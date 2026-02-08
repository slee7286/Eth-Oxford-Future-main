import aiosqlite
import time
import logging

from config import settings

log = logging.getLogger("flarerisk.db")

_db: aiosqlite.Connection | None = None


async def get_db() -> aiosqlite.Connection:
    global _db
    if _db is None:
        _db = await aiosqlite.connect(settings.db_path)
        _db.row_factory = aiosqlite.Row
        await _db.execute("PRAGMA journal_mode=WAL")
        await _db.execute(
            """
            CREATE TABLE IF NOT EXISTS gas_readings (
                id        INTEGER PRIMARY KEY AUTOINCREMENT,
                timestamp INTEGER NOT NULL,
                gas_price REAL    NOT NULL,
                source    TEXT    NOT NULL
            )
            """
        )
        await _db.execute(
            "CREATE INDEX IF NOT EXISTS idx_gas_ts ON gas_readings(timestamp)"
        )
        await _db.commit()
        log.info("Database initialized at %s", settings.db_path)
    return _db


async def close_db() -> None:
    global _db
    if _db is not None:
        await _db.close()
        _db = None


async def insert_reading(timestamp: int, gas_price: float, source: str) -> None:
    db = await get_db()
    await db.execute(
        "INSERT INTO gas_readings (timestamp, gas_price, source) VALUES (?, ?, ?)",
        (timestamp, gas_price, source),
    )
    await db.commit()


async def get_latest() -> dict | None:
    db = await get_db()
    cursor = await db.execute(
        "SELECT timestamp, gas_price, source FROM gas_readings ORDER BY timestamp DESC LIMIT 1"
    )
    row = await cursor.fetchone()
    if row is None:
        return None
    return {"timestamp": row["timestamp"], "gas_price": row["gas_price"], "source": row["source"]}


async def get_readings_since(since_ts: int) -> list[dict]:
    db = await get_db()
    cursor = await db.execute(
        "SELECT timestamp, gas_price, source FROM gas_readings WHERE timestamp >= ? ORDER BY timestamp ASC",
        (since_ts,),
    )
    rows = await cursor.fetchall()
    return [
        {"timestamp": r["timestamp"], "gas_price": r["gas_price"], "source": r["source"]}
        for r in rows
    ]


async def get_readings_range(from_ts: int, to_ts: int) -> list[dict]:
    db = await get_db()
    cursor = await db.execute(
        "SELECT timestamp, gas_price, source FROM gas_readings "
        "WHERE timestamp >= ? AND timestamp <= ? ORDER BY timestamp ASC",
        (from_ts, to_ts),
    )
    rows = await cursor.fetchall()
    return [
        {"timestamp": r["timestamp"], "gas_price": r["gas_price"], "source": r["source"]}
        for r in rows
    ]


async def get_average_since(since_ts: int) -> dict:
    db = await get_db()
    cursor = await db.execute(
        "SELECT AVG(gas_price) as avg_price, COUNT(*) as cnt, "
        "MIN(timestamp) as oldest, MAX(timestamp) as newest "
        "FROM gas_readings WHERE timestamp >= ?",
        (since_ts,),
    )
    row = await cursor.fetchone()
    return {
        "avg_price": row["avg_price"] or 0.0,
        "count": row["cnt"],
        "oldest": row["oldest"] or 0,
        "newest": row["newest"] or 0,
    }


async def count_readings() -> int:
    db = await get_db()
    cursor = await db.execute("SELECT COUNT(*) as cnt FROM gas_readings")
    row = await cursor.fetchone()
    return row["cnt"]
