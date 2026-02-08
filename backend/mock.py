"""
Mock gas price generator — produces realistic Ethereum-style gas data.

Gas price dynamics modelled:
- Base: ~25 gwei with slow drift (random walk)
- Noise: +-5 gwei normal fluctuation
- Spikes: ~5% chance of a spike to 80-200 gwei (simulating NFT mints, MEV events)
- Mean reversion: after spikes, price drifts back down over several readings
"""

import math
import random
import time
import logging

log = logging.getLogger("flarerisk.mock")

_state = {
    "base": 25.0,
    "last_price": 25.0,
    "spike_cooldown": 0,
}


def generate_gas_price() -> float:
    """Generate a single realistic gas price in gwei."""
    s = _state

    # Mean-revert base toward 25 gwei
    s["base"] += (25.0 - s["base"]) * 0.02
    # Random walk on base
    s["base"] += random.gauss(0, 0.3)
    s["base"] = max(8.0, min(60.0, s["base"]))

    if s["spike_cooldown"] > 0:
        # Decaying spike
        s["spike_cooldown"] -= 1
        spike_factor = 1.0 + (s["spike_cooldown"] / 10) * random.uniform(1.5, 3.0)
        price = s["base"] * spike_factor
    elif random.random() < 0.05:
        # New spike
        s["spike_cooldown"] = random.randint(3, 8)
        price = random.uniform(80.0, 200.0)
        log.info("Gas spike! %.1f gwei", price)
    else:
        # Normal fluctuation
        noise = random.gauss(0, 3.0)
        price = s["base"] + noise

    price = max(5.0, round(price, 2))
    s["last_price"] = price
    return price


def generate_historical(hours: int = 168) -> list[dict]:
    """Generate `hours` worth of historical data at 90-second intervals.

    Default 168 hours = 7 days, which gives us enough for the 7-day moving average.
    """
    readings = []
    interval = 90  # seconds
    count = (hours * 3600) // interval
    now = int(time.time())
    start_ts = now - (count * interval)

    # Reset state for clean history generation
    _state["base"] = 25.0
    _state["last_price"] = 25.0
    _state["spike_cooldown"] = 0

    for i in range(count):
        ts = start_ts + (i * interval)
        price = generate_gas_price()
        readings.append({"timestamp": ts, "gas_price": price, "source": "mock"})

    log.info("Generated %d historical mock readings (%d hours)", len(readings), hours)
    return readings
