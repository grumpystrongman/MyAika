from __future__ import annotations

import json
import sqlite3
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

from .models import RunSummary, Signal, OrderRequest, Fill


class RunStore:
    def __init__(self, path: str) -> None:
        self._path = Path(path)
        self._path.parent.mkdir(parents=True, exist_ok=True)
        self._init_db()

    def _connect(self) -> sqlite3.Connection:
        return sqlite3.connect(str(self._path))

    def _init_db(self) -> None:
        with self._connect() as conn:
            conn.execute(
                """
                CREATE TABLE IF NOT EXISTS runs (
                    run_id TEXT PRIMARY KEY,
                    mode TEXT,
                    status TEXT,
                    started_at TEXT,
                    completed_at TEXT,
                    strategy TEXT,
                    symbols_json TEXT,
                    summary_json TEXT,
                    config_json TEXT
                )
                """
            )
            conn.execute(
                """
                CREATE TABLE IF NOT EXISTS signals (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    run_id TEXT,
                    symbol TEXT,
                    side TEXT,
                    strength REAL,
                    generated_at TEXT,
                    meta_json TEXT
                )
                """
            )
            conn.execute(
                """
                CREATE TABLE IF NOT EXISTS orders (
                    id TEXT PRIMARY KEY,
                    run_id TEXT,
                    symbol TEXT,
                    side TEXT,
                    quantity REAL,
                    order_type TEXT,
                    created_at TEXT,
                    payload_json TEXT
                )
                """
            )
            conn.execute(
                """
                CREATE TABLE IF NOT EXISTS fills (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    run_id TEXT,
                    order_id TEXT,
                    symbol TEXT,
                    side TEXT,
                    quantity REAL,
                    price REAL,
                    fee REAL,
                    slippage_bps REAL,
                    spread_bps REAL,
                    latency_ms INTEGER,
                    filled_at TEXT,
                    payload_json TEXT
                )
                """
            )

    def record_run(self, summary: RunSummary, config: dict) -> None:
        with self._connect() as conn:
            conn.execute(
                """
                INSERT OR REPLACE INTO runs
                (run_id, mode, status, started_at, completed_at, strategy, symbols_json, summary_json, config_json)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
                """,
                (
                    summary.run_id,
                    summary.mode,
                    summary.status,
                    summary.started_at.isoformat(),
                    summary.completed_at.isoformat() if summary.completed_at else None,
                    summary.strategy,
                    json.dumps(summary.symbols),
                    json.dumps(summary.to_dict()),
                    json.dumps(config),
                ),
            )

    def record_signal(self, run_id: str, signal: Signal) -> None:
        with self._connect() as conn:
            conn.execute(
                """
                INSERT INTO signals (run_id, symbol, side, strength, generated_at, meta_json)
                VALUES (?, ?, ?, ?, ?, ?)
                """,
                (
                    run_id,
                    signal.symbol,
                    signal.side,
                    signal.strength,
                    signal.generated_at.isoformat(),
                    json.dumps(signal.meta),
                ),
            )

    def record_order(self, run_id: str, order: OrderRequest) -> None:
        order_id = order.client_order_id or ""
        with self._connect() as conn:
            conn.execute(
                """
                INSERT OR REPLACE INTO orders
                (id, run_id, symbol, side, quantity, order_type, created_at, payload_json)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?)
                """,
                (
                    order_id,
                    run_id,
                    order.symbol,
                    order.side,
                    order.quantity,
                    order.order_type,
                    datetime.now(timezone.utc).isoformat(),
                    json.dumps(order.to_dict()),
                ),
            )

    def record_fill(self, run_id: str, fill: Fill) -> None:
        with self._connect() as conn:
            conn.execute(
                """
                INSERT INTO fills
                (run_id, order_id, symbol, side, quantity, price, fee, slippage_bps, spread_bps, latency_ms, filled_at, payload_json)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                """,
                (
                    run_id,
                    fill.order_id,
                    fill.symbol,
                    fill.side,
                    fill.quantity,
                    fill.price,
                    fill.fee,
                    fill.slippage_bps,
                    fill.spread_bps,
                    fill.latency_ms,
                    fill.filled_at.isoformat(),
                    json.dumps(fill.to_dict()),
                ),
            )

    def latest_run(self) -> dict[str, Any] | None:
        with self._connect() as conn:
            row = conn.execute(
                "SELECT summary_json FROM runs ORDER BY started_at DESC LIMIT 1"
            ).fetchone()
        if not row:
            return None
        return json.loads(row[0])

    def list_fills(self, limit: int = 50) -> list[dict]:
        with self._connect() as conn:
            rows = conn.execute(
                """
                SELECT payload_json FROM fills
                ORDER BY filled_at DESC
                LIMIT ?
                """,
                (limit,),
            ).fetchall()
        return [json.loads(row[0]) for row in rows]

    def list_runs(self, limit: int = 20) -> list[dict]:
        with self._connect() as conn:
            rows = conn.execute(
                """
                SELECT summary_json FROM runs
                ORDER BY started_at DESC
                LIMIT ?
                """,
                (limit,),
            ).fetchall()
        return [json.loads(row[0]) for row in rows]
