# Backend API Integration Guide — GasCap Futures

## Overview

The backend fetches **real Ethereum gas prices** using Flare's FDC (Flare Data Connector) Web2Json attestation system. Every ~90 seconds it:

1. Fetches gas prices from Beaconcha.in (rapid, fast, standard, slow)
2. Submits an attestation request on-chain to Flare's FdcHub contract
3. Waits for ~100 independent attestation providers to reach consensus
4. Retrieves a **merkle proof** from the DA layer — cryptographic proof the gas data is correct
5. Stores the attested gas price in the database and serves it via REST API

The backend runs at `http://localhost:8000`. Swagger docs at `/docs`.

---

## REST API Endpoints

### `GET /gas/current` — Latest gas price

Returns the most recent gas price reading.

**Response:**
```json
{
  "latest": {
    "timestamp": 1770510970,
    "gas_price_gwei": 0.073886461,
    "source": "fdc-attested"
  }
}
```

**Fields:**
- `timestamp` — Unix epoch (seconds)
- `gas_price_gwei` — Ethereum gas price in gwei (float). This is the "standard" tier.
- `source` — One of:
  - `"fdc-attested"` — Verified by Flare's FDC attestation providers (has merkle proof)
  - `"direct"` — Fetched directly from Beaconcha.in (unattested, used for quick display while FDC cycle runs)
  - `"mock"` — Synthetic data (dev/demo mode)

### `GET /gas/average?days=7` — Rolling average

Returns average gas price over the last N days.

**Response:**
```json
{
  "average_gwei": 0.0789,
  "days": 7,
  "sample_count": 142,
  "oldest_timestamp": 1769906170,
  "newest_timestamp": 1770510970
}
```

**Query params:**
- `days` — Number of days to average over (1-30, default 7)

### `GET /gas/history?from=START&to=END` — Historical readings

Returns all gas readings in a time range (for charts).

**Response:**
```json
{
  "readings": [
    {"timestamp": 1770510784, "gas_price_gwei": 0.081, "source": "direct"},
    {"timestamp": 1770510970, "gas_price_gwei": 0.0739, "source": "fdc-attested"}
  ],
  "count": 2
}
```

**Query params:**
- `from` (required) — Start unix timestamp
- `to` (optional) — End unix timestamp (defaults to now)

### `GET /health` — System status

```json
{
  "status": "ok",
  "mode": "fdc",
  "readings_stored": 142,
  "latest_timestamp": 1770510970
}
```

---

## Smart Contract Integration

### Current State

The `GasCapFutures.sol` contract currently uses `getCurrentGasPrice()` which reads FTSO price feeds (BTC/ETH/FLR) and maps them to a synthetic gas index (20-79 range). **This is not real gas data.**

### How to Use Real Gas Prices

There are two integration approaches:

#### Option A: Off-chain Oracle (Recommended for Hackathon)

Have a keeper/relayer script that:
1. Calls `GET /gas/current` from the backend
2. Submits the gas price on-chain via a `setGasPrice()` function on the contract

```solidity
// Add to GasCapFutures.sol
uint256 public lastGasPrice;
uint256 public lastGasPriceTimestamp;

function updateGasPrice(uint256 _priceGwei, uint256 _timestamp) external onlyOwner {
    lastGasPrice = _priceGwei;
    lastGasPriceTimestamp = _timestamp;
}

function getCurrentGasPrice() public view returns (uint256 price, uint256 timestamp) {
    return (lastGasPrice, lastGasPriceTimestamp);
}
```

Keeper script (runs alongside backend):
```javascript
const response = await fetch("http://localhost:8000/gas/current");
const data = await response.json();
// gas_price_gwei is a float like 0.074 — scale to integer for Solidity
const priceScaled = Math.round(data.latest.gas_price_gwei * 1e9); // wei
await contract.updateGasPrice(priceScaled, data.latest.timestamp);
```

#### Option B: On-chain FDC Proof Verification (Full Trustless)

The FDC pipeline produces a merkle proof that can be verified on-chain. The proof contains:
- `merkleProof` — Array of bytes32 hashes
- `response_hex` — ABI-encoded gas data (rapid, fast, standard, slow in wei)

To verify on-chain, the contract would call Flare's Relay contract to confirm the proof belongs to a finalized voting round. This is the fully trustless approach but requires more contract code. See Flare docs: https://docs.flare.network/tech/fdc/

---

## Gas Price Data Format

The FDC-attested gas data contains 4 tiers (all in gwei when served via API):

| Tier | Meaning | Typical Value |
|------|---------|---------------|
| rapid | Fastest inclusion (~5s) | 0.17 gwei |
| fast | Fast inclusion (~15s) | 0.16 gwei |
| standard | Normal inclusion (~30s) | 0.07 gwei |
| slow | Economy (~60s+) | 0.07 gwei |

The API currently serves the **standard** tier as `gas_price_gwei`. The backend stores all 4 tiers internally.

---

## Running the Backend

```bash
cd backend
python -m venv .venv && source .venv/bin/activate
pip install -r requirements.txt
cp .env.example .env  # Then fill in PRIVATE_KEY and ETHERSCAN_API_KEY
python main.py
```

**Required .env variables for FDC mode:**
- `USE_MOCK=false`
- `PRIVATE_KEY` — Coston2 wallet private key (get test C2FLR from https://faucet.flare.network/coston2)
- All Flare RPC/FDC settings are pre-configured for Coston2 testnet

**Mock mode** (`USE_MOCK=true`): No wallet needed, generates realistic synthetic gas data.

---

## Architecture

```
Beaconcha.in Gas API
        |
        v
  FDC Web2Json Verifier (prepareRequest)
        |
        v
  FdcHub Contract on Coston2 (requestAttestation)
        |
        v
  ~100 Attestation Providers reach consensus
        |
        v
  DA Layer (proof-by-request-round-raw)
        |
        v
  Backend decodes proof → SQLite → REST API
        |
        v
  Smart Contracts / Frontend consume /gas/current
```

**Data source:** `https://beaconcha.in/api/v1/execution/gasnow` — public Ethereum gas tracker, returns gas prices in wei. No API key required.

**Network:** Flare Coston2 Testnet (Chain ID 114)

**Polling interval:** 90 seconds. Each FDC cycle takes ~2-3 minutes (submit → finalize → proof retrieval).
