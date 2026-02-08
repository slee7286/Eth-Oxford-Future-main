"""
FDC Web2Json integration — fetches Ethereum gas prices via Flare Data Connector.

Flow:
1. Prepare attestation request (POST to verifier)
2. Submit request on-chain to FdcHub (costs small testnet FLR fee)
3. Wait for voting round to finalize (~90-180s)
4. Retrieve proof from DA layer
5. Decode ABI-encoded gas price data from the attested response
"""

import asyncio
import logging
import time

import aiohttp
from eth_abi import decode as abi_decode
from web3 import AsyncHTTPProvider, AsyncWeb3
from web3.middleware import ExtraDataToPOAMiddleware

from config import settings

log = logging.getLogger("flarerisk.fdc")

# ---------------------------------------------------------------------------
# Hex encoding helpers (matching Flare's convention)
# ---------------------------------------------------------------------------

def to_utf8_hex(s: str) -> str:
    """Encode string to 0x-prefixed hex, zero-right-padded to 32 bytes."""
    hex_str = s.encode().hex()
    return "0x" + hex_str.ljust(64, "0")


ATTESTATION_TYPE = "Web2Json"
SOURCE_ID = "PublicWeb2"
ATTESTATION_TYPE_HEX = to_utf8_hex(ATTESTATION_TYPE)
SOURCE_ID_HEX = to_utf8_hex(SOURCE_ID)

# ---------------------------------------------------------------------------
# Gas price request configuration
# ---------------------------------------------------------------------------

# Beaconcha.in — public, no API key, returns integer wei values (best for consensus)
GAS_API_URL = "https://beaconcha.in/api/v1/execution/gasnow"
GAS_QUERY_PARAMS = "{}"

POSTPROCESS_JQ = (
    "{rapid: .data.rapid, fast: .data.fast,"
    " standard: .data.standard, slow: .data.slow}"
)

ABI_SIGNATURE = (
    '{"components": ['
    '{"internalType": "uint256", "name": "rapid", "type": "uint256"},'
    '{"internalType": "uint256", "name": "fast", "type": "uint256"},'
    '{"internalType": "uint256", "name": "standard", "type": "uint256"},'
    '{"internalType": "uint256", "name": "slow", "type": "uint256"}'
    '], "name": "gasData", "type": "tuple"}'
)

# ---------------------------------------------------------------------------
# Minimal contract ABIs
# ---------------------------------------------------------------------------

FDC_HUB_ABI = [
    {
        "inputs": [{"internalType": "bytes", "name": "data", "type": "bytes"}],
        "name": "requestAttestation",
        "outputs": [],
        "stateMutability": "payable",
        "type": "function",
    }
]

FDC_FEE_ABI = [
    {
        "inputs": [{"internalType": "bytes", "name": "data", "type": "bytes"}],
        "name": "getRequestFee",
        "outputs": [{"internalType": "uint256", "name": "", "type": "uint256"}],
        "stateMutability": "view",
        "type": "function",
    }
]

REGISTRY_ABI = [
    {
        "inputs": [{"internalType": "string", "name": "_name", "type": "string"}],
        "name": "getContractAddressByName",
        "outputs": [{"internalType": "address", "name": "", "type": "address"}],
        "stateMutability": "view",
        "type": "function",
    }
]

SYSTEMS_MANAGER_ABI = [
    {
        "inputs": [],
        "name": "firstVotingRoundStartTs",
        "outputs": [{"internalType": "uint64", "name": "", "type": "uint64"}],
        "stateMutability": "view",
        "type": "function",
    },
    {
        "inputs": [],
        "name": "votingEpochDurationSeconds",
        "outputs": [{"internalType": "uint64", "name": "", "type": "uint64"}],
        "stateMutability": "view",
        "type": "function",
    },
]

RELAY_ABI = [
    {
        "inputs": [
            {"internalType": "uint256", "name": "_protocolId", "type": "uint256"},
            {"internalType": "uint256", "name": "_votingRoundId", "type": "uint256"},
        ],
        "name": "isFinalized",
        "outputs": [{"internalType": "bool", "name": "", "type": "bool"}],
        "stateMutability": "view",
        "type": "function",
    }
]


# ---------------------------------------------------------------------------
# FDC Client
# ---------------------------------------------------------------------------

class FDCClient:
    def __init__(self) -> None:
        self._w3: AsyncWeb3 | None = None
        self._account = None
        self._fdc_hub = None
        self._relay = None
        self._systems_manager = None
        self._fdc_fee = None

    async def connect(self) -> None:
        self._w3 = AsyncWeb3(AsyncHTTPProvider(settings.flare_rpc_url))
        self._w3.middleware_onion.inject(ExtraDataToPOAMiddleware, layer=0)
        connected = await self._w3.is_connected()
        log.info("Connected to Flare RPC: %s", connected)

        if not settings.private_key:
            raise ValueError("PRIVATE_KEY is required for FDC mode")

        self._account = self._w3.eth.account.from_key(settings.private_key)
        log.info("Wallet: %s", self._account.address)

        # FdcHub contract
        self._fdc_hub = self._w3.eth.contract(
            address=self._w3.to_checksum_address(settings.fdc_hub_address),
            abi=FDC_HUB_ABI,
        )

        # Resolve other contracts via ContractRegistry
        registry = self._w3.eth.contract(
            address=self._w3.to_checksum_address(settings.contract_registry_address),
            abi=REGISTRY_ABI,
        )

        fee_addr = await registry.functions.getContractAddressByName(
            "FdcRequestFeeConfigurations"
        ).call()
        self._fdc_fee = self._w3.eth.contract(address=fee_addr, abi=FDC_FEE_ABI)

        relay_addr = await registry.functions.getContractAddressByName("Relay").call()
        self._relay = self._w3.eth.contract(address=relay_addr, abi=RELAY_ABI)

        sm_addr = await registry.functions.getContractAddressByName(
            "FlareSystemsManager"
        ).call()
        self._systems_manager = self._w3.eth.contract(
            address=sm_addr, abi=SYSTEMS_MANAGER_ABI
        )

        log.info("FDC contracts resolved (FdcHub, Relay, FlareSystemsManager, FeeConfig)")

    # ------------------------------------------------------------------
    # Step 1: Prepare attestation request via verifier
    # ------------------------------------------------------------------
    async def prepare_request(self) -> str:
        url = f"{settings.web2json_verifier_url}Web2Json/prepareRequest"

        payload = {
            "attestationType": ATTESTATION_TYPE_HEX,
            "sourceId": SOURCE_ID_HEX,
            "requestBody": {
                "url": GAS_API_URL,
                "httpMethod": "GET",
                "headers": "{}",
                "queryParams": GAS_QUERY_PARAMS,
                "body": "{}",
                "postProcessJq": POSTPROCESS_JQ,
                "abiSignature": ABI_SIGNATURE,
            },
        }

        async with aiohttp.ClientSession() as session:
            async with session.post(
                url,
                json=payload,
                headers={
                    "X-API-KEY": settings.verifier_api_key,
                    "Content-Type": "application/json",
                },
            ) as resp:
                if resp.status != 200:
                    text = await resp.text()
                    raise RuntimeError(f"Verifier error {resp.status}: {text}")
                data = await resp.json()

        status = data.get("status", "")
        if status != "VALID":
            raise RuntimeError(f"Verifier rejected request: {status}")

        abi_encoded_request = data["abiEncodedRequest"]
        log.info("Prepared attestation request (%d bytes)", len(abi_encoded_request) // 2)
        return abi_encoded_request

    # ------------------------------------------------------------------
    # Step 2: Submit on-chain to FdcHub
    # ------------------------------------------------------------------
    async def submit_request(self, abi_encoded_request: str) -> tuple[int, int]:
        request_bytes = bytes.fromhex(abi_encoded_request[2:])

        # Get the attestation fee
        fee = await self._fdc_fee.functions.getRequestFee(request_bytes).call()
        log.info("Attestation fee: %d wei", fee)

        # Build and send transaction
        tx = await self._fdc_hub.functions.requestAttestation(
            request_bytes
        ).build_transaction(
            {
                "from": self._account.address,
                "value": fee,
                "nonce": await self._w3.eth.get_transaction_count(self._account.address),
                "gas": 500_000,
                "maxFeePerGas": await self._w3.eth.gas_price * 2,
                "maxPriorityFeePerGas": await self._w3.eth.gas_price,
            }
        )

        signed = self._account.sign_transaction(tx)
        tx_hash = await self._w3.eth.send_raw_transaction(signed.raw_transaction)
        receipt = await self._w3.eth.wait_for_transaction_receipt(tx_hash)
        log.info("Attestation submitted: tx=%s block=%d", tx_hash.hex(), receipt.blockNumber)

        # Calculate voting round ID
        block = await self._w3.eth.get_block(receipt.blockNumber)
        first_ts = await self._systems_manager.functions.firstVotingRoundStartTs().call()
        epoch_dur = await self._systems_manager.functions.votingEpochDurationSeconds().call()
        round_id = (block.timestamp - first_ts) // epoch_dur

        log.info("Voting round ID: %d", round_id)
        return round_id, block.timestamp

    # ------------------------------------------------------------------
    # Step 3: Wait for voting round finalization
    # ------------------------------------------------------------------
    async def wait_for_finalization(self, round_id: int, timeout: int = 300) -> None:
        log.info("Waiting for round %d to finalize (up to %ds)...", round_id, timeout)
        deadline = time.time() + timeout
        while time.time() < deadline:
            is_final = await self._relay.functions.isFinalized(200, round_id).call()
            if is_final:
                log.info("Round %d finalized!", round_id)
                return
            await asyncio.sleep(10)
        raise TimeoutError(f"Round {round_id} did not finalize within {timeout}s")

    # ------------------------------------------------------------------
    # Step 4: Retrieve proof from DA layer
    # ------------------------------------------------------------------
    async def retrieve_proof(self, abi_encoded_request: str, round_id: int) -> dict:
        url = f"{settings.da_layer_url}api/v1/fdc/proof-by-request-round-raw"
        payload = {
            "votingRoundId": round_id,
            "requestBytes": abi_encoded_request,
        }

        # DA layer needs time after finalization to build the merkle tree
        log.info("Waiting 30s for DA layer to process proof...")
        await asyncio.sleep(30)

        for attempt in range(20):
            async with aiohttp.ClientSession() as session:
                async with session.post(
                    url,
                    json=payload,
                    headers={"Content-Type": "application/json"},
                ) as resp:
                    body = await resp.text()
                    if resp.status != 200:
                        log.warning("DA layer returned %d (attempt %d): %s", resp.status, attempt + 1, body[:300])
                        await asyncio.sleep(15)
                        continue
                    proof = await resp.json()
                    if proof.get("response_hex"):
                        log.info("Proof retrieved from DA layer!")
                        return proof
                    log.info("Proof not ready yet (attempt %d): %s", attempt + 1, str(proof)[:200])
                    await asyncio.sleep(15)

        raise RuntimeError("Failed to retrieve proof from DA layer after retries")

    # ------------------------------------------------------------------
    # Step 5: Decode gas price data from attested response
    # ------------------------------------------------------------------
    def decode_gas_data(self, proof: dict) -> dict:
        response_hex = proof["response_hex"]
        raw = bytes.fromhex(response_hex[2:] if response_hex.startswith("0x") else response_hex)

        # Decode outer IWeb2Json.Response struct.
        # eth_abi doesn't handle nested tuples with trailing commas well,
        # so we parse the raw response manually using offset-based decoding.
        # The responseBody is the last field — a (bytes) tuple containing
        # the ABI-encoded gas data.

        # The response_hex from the DA layer raw endpoint wraps everything
        # in an outer tuple with an offset pointer. Skip the first 32-byte
        # offset word, then locate the responseBody bytes.
        # Strategy: find the inner gas data by scanning for our 4-field struct.
        # The responseBody.abiEncodedData starts after all the string fields.

        # Simpler approach: use the decoded /api/v1/fdc endpoint which gives
        # us the response_hex of just the full IWeb2Json.Response. The inner
        # ABI-encoded data is at the end. We scan backwards for it.

        # Most reliable: decode just the inner gas data.
        # The response_hex contains the full struct. The last dynamic field
        # is responseBody which is (bytes). We need to find where that bytes
        # payload starts. We'll look for 4 consecutive uint256 values (128 bytes)
        # near the end of the response.

        # Actually, the simplest working approach: the gas data is 4 uint256s
        # = exactly 128 bytes. Try decoding the last 128 bytes.
        if len(raw) >= 128:
            # Try progressively from the end to find valid gas data
            for offset in range(len(raw) - 128, max(0, len(raw) - 512), -32):
                try:
                    gas_tuple = abi_decode(
                        ["(uint256,uint256,uint256,uint256)"],
                        raw[offset:offset + 128],
                    )
                    gas = gas_tuple[0]
                    # Sanity check: gas prices should be reasonable (1 wei to 1 ETH in wei)
                    if all(0 < g < 1_000_000_000_000 for g in gas):
                        result = {
                            "rapid_gas_price": gas[0] / 1e9,
                            "fast_gas_price": gas[1] / 1e9,
                            "propose_gas_price": gas[2] / 1e9,
                            "safe_gas_price": gas[3] / 1e9,
                        }
                        log.info(
                            "Decoded gas: rapid=%.4f fast=%.4f standard=%.4f slow=%.4f gwei",
                            result["rapid_gas_price"],
                            result["fast_gas_price"],
                            result["propose_gas_price"],
                            result["safe_gas_price"],
                        )
                        return result
                except Exception:
                    continue

        raise RuntimeError("Could not decode gas data from proof response")

    # ------------------------------------------------------------------
    # Full cycle: prepare → submit → wait → retrieve → decode
    # ------------------------------------------------------------------
    async def fetch_gas_price(self) -> dict | None:
        try:
            if self._w3 is None:
                await self.connect()

            abi_encoded_request = await self.prepare_request()
            round_id, block_ts = await self.submit_request(abi_encoded_request)
            await self.wait_for_finalization(round_id)
            proof = await self.retrieve_proof(abi_encoded_request, round_id)
            return self.decode_gas_data(proof)

        except Exception as e:
            log.error("FDC fetch failed: %s", e, exc_info=True)
            return None


# Singleton
fdc_client = FDCClient()
