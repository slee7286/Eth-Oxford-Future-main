"""
FlareRisk Backend — GasCap Futures data service.

Fetches Ethereum gas prices via Flare's FDC Web2Json attestations
and serves them through a REST API for the frontend.
"""

import asyncio
import logging
import time
from contextlib import asynccontextmanager
from pathlib import Path

from fastapi import FastAPI, Query
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse

from config import settings
from models import (
    GasCurrentResponse,
    GasAverageResponse,
    GasHistoryResponse,
    GasReading,
    HealthResponse,
)
import db
import aiohttp

from fdc import fdc_client
from mock import generate_gas_price, generate_historical

# ---------------------------------------------------------------------------
# Logging
# ---------------------------------------------------------------------------
logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s | %(name)-22s | %(levelname)-5s | %(message)s",
    datefmt="%H:%M:%S",
)
log = logging.getLogger("flarerisk")


# ---------------------------------------------------------------------------
# Direct gas price fetch (quick fallback while FDC cycle runs)
# ---------------------------------------------------------------------------
async def _fetch_gas_direct() -> float | None:
    """Fetch gas price directly from Beaconcha.in (unattested, for quick display)."""
    try:
        async with aiohttp.ClientSession() as session:
            async with session.get(
                "https://beaconcha.in/api/v1/execution/gasnow",
                timeout=aiohttp.ClientTimeout(total=10),
            ) as resp:
                data = await resp.json()
                return data["data"]["standard"] / 1e9
    except Exception as e:
        log.error("Direct gas fetch failed: %s", e)
        return None


# ---------------------------------------------------------------------------
# Background poller
# ---------------------------------------------------------------------------
async def poll_loop() -> None:
    mode = "MOCK" if settings.use_mock else "FDC"
    log.info("Poller started — mode=%s, interval=%ds", mode, settings.poll_interval_seconds)

    # Mock mode: seed 7 days of history on first run
    if settings.use_mock and await db.count_readings() == 0:
        log.info("Seeding 7 days of historical mock data...")
        for r in generate_historical(hours=168):
            await db.insert_reading(r["timestamp"], r["gas_price"], r["source"])
        log.info("Seeding complete.")

    while True:
        try:
            if settings.use_mock:
                # ── Mock mode ──
                ts = int(time.time())
                gas_price = generate_gas_price()
                await db.insert_reading(ts, gas_price, "mock")
                log.info("Recorded gas: %.2f gwei [mock]", gas_price)
            else:
                # ── FDC mode ──
                # Quick direct fetch so dashboard has data immediately
                direct_price = await _fetch_gas_direct()
                if direct_price is not None:
                    await db.insert_reading(int(time.time()), direct_price, "direct")
                    log.info("Recorded gas: %.4f gwei [direct/unattested]", direct_price)

                # Full FDC attestation cycle (~3-5 min)
                log.info("Starting FDC Web2Json attestation cycle...")
                result = await fdc_client.fetch_gas_price()
                if result:
                    ts = int(time.time())
                    gas_price = float(result["propose_gas_price"])
                    await db.insert_reading(ts, gas_price, "fdc-attested")
                    log.info("FDC attested gas: %.4f gwei [flare-verified]", gas_price)
                else:
                    log.warning("FDC cycle returned no result")

        except Exception as e:
            log.error("Poll error: %s", e, exc_info=True)

        await asyncio.sleep(settings.poll_interval_seconds)


# ---------------------------------------------------------------------------
# App lifecycle
# ---------------------------------------------------------------------------
@asynccontextmanager
async def lifespan(app: FastAPI):
    await db.get_db()
    task = asyncio.create_task(poll_loop())
    log.info("FlareRisk backend started on :%d", settings.port)
    yield
    task.cancel()
    await db.close_db()


# ---------------------------------------------------------------------------
# FastAPI app
# ---------------------------------------------------------------------------
app = FastAPI(
    title="FlareRisk — GasCap Futures API",
    description=(
        "Backend data service for FlareRisk GasCap Futures. "
        "Fetches Ethereum gas prices via Flare's FDC Web2Json attestations."
    ),
    version="0.2.0",
    lifespan=lifespan,
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


# ---------------------------------------------------------------------------
# Endpoints
# ---------------------------------------------------------------------------
@app.get("/health", response_model=HealthResponse, tags=["System"])
async def health():
    latest = await db.get_latest()
    count = await db.count_readings()
    return HealthResponse(
        status="ok",
        mode="mock" if settings.use_mock else "fdc",
        readings_stored=count,
        latest_timestamp=latest["timestamp"] if latest else None,
    )


@app.get("/gas/current", response_model=GasCurrentResponse, tags=["Gas Data"])
async def gas_current():
    row = await db.get_latest()
    if row is None:
        return GasCurrentResponse(
            latest=GasReading(timestamp=0, gas_price_gwei=0.0, source="none"),
        )
    return GasCurrentResponse(
        latest=GasReading(
            timestamp=row["timestamp"],
            gas_price_gwei=row["gas_price"],
            source=row["source"],
        ),
    )


@app.get("/gas/average", response_model=GasAverageResponse, tags=["Gas Data"])
async def gas_average(days: int = Query(default=7, ge=1, le=30)):
    since_ts = int(time.time()) - (days * 86400)
    result = await db.get_average_since(since_ts)
    return GasAverageResponse(
        average_gwei=round(result["avg_price"], 4),
        days=days,
        sample_count=result["count"],
        oldest_timestamp=result["oldest"],
        newest_timestamp=result["newest"],
    )


@app.get("/gas/history", response_model=GasHistoryResponse, tags=["Gas Data"])
async def gas_history(
    from_ts: int = Query(alias="from", description="Start unix timestamp"),
    to_ts: int = Query(
        default=None, alias="to", description="End unix timestamp (default: now)"
    ),
):
    if to_ts is None:
        to_ts = int(time.time())
    rows = await db.get_readings_range(from_ts, to_ts)
    readings = [
        GasReading(
            timestamp=r["timestamp"],
            gas_price_gwei=r["gas_price"],
            source=r["source"],
        )
        for r in rows
    ]
    return GasHistoryResponse(readings=readings, count=len(readings))


# ---------------------------------------------------------------------------
# Serve test frontend
# ---------------------------------------------------------------------------
FRONTEND_PATH = Path(__file__).parent.parent / "frontend-test" / "index.html"


@app.get("/", tags=["Frontend"])
async def serve_frontend():
    if FRONTEND_PATH.exists():
        return FileResponse(FRONTEND_PATH)
    return {"message": "FlareRisk API is running. Visit /docs for Swagger UI."}


# ---------------------------------------------------------------------------
# Run directly
# ---------------------------------------------------------------------------
if __name__ == "__main__":
    import uvicorn

    uvicorn.run("main:app", host=settings.host, port=settings.port, reload=True)
