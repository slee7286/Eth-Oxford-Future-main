from pydantic_settings import BaseSettings


class Settings(BaseSettings):
    # Flare RPC (Coston2 testnet)
    flare_rpc_url: str = "https://coston2-api.flare.network/ext/C/rpc"

    # FDC Web2Json
    web2json_verifier_url: str = "https://fdc-verifiers-testnet.flare.network/verifier/web2/"
    verifier_api_key: str = "00000000-0000-0000-0000-000000000000"
    da_layer_url: str = "https://ctn2-data-availability.flare.network/"

    # Flare contract addresses (Coston2)
    contract_registry_address: str = "0xaD67FE66660Fb8dFE9d6b1b4240d8650e30F6019"
    fdc_hub_address: str = "0x48aC463d7975828989331F4De43341627b9c5f1D"

    # Wallet (needed for submitting FDC attestation requests on-chain)
    private_key: str = ""

    # Gas price API (the Web2 source that FDC will fetch)
    gas_api_url: str = "https://api.etherscan.io/v2/api"
    etherscan_api_key: str = ""

    # Polling
    poll_interval_seconds: int = 90

    # Mode: "fdc" uses Flare Data Connector, "mock" uses synthetic data
    use_mock: bool = True

    # API server
    host: str = "0.0.0.0"
    port: int = 8000

    # Database
    db_path: str = "gas_data.db"

    model_config = {"env_file": ".env", "env_file_encoding": "utf-8"}


settings = Settings()
