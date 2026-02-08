from pydantic import BaseModel


class GasReading(BaseModel):
    timestamp: int
    gas_price_gwei: float
    source: str  # "fdc-attested", "direct", or "mock"


class GasCurrentResponse(BaseModel):
    latest: GasReading


class GasAverageResponse(BaseModel):
    average_gwei: float
    days: int
    sample_count: int
    oldest_timestamp: int
    newest_timestamp: int


class GasHistoryResponse(BaseModel):
    readings: list[GasReading]
    count: int


class HealthResponse(BaseModel):
    status: str
    mode: str
    readings_stored: int
    latest_timestamp: int | None
