from __future__ import annotations

import sqlite3
from datetime import datetime, timedelta, timezone
from pathlib import Path

from .models import OptionContract


class OptionIVHistoryStore:
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
                CREATE TABLE IF NOT EXISTS iv_history (
                    symbol TEXT NOT NULL,
                    expiration TEXT NOT NULL,
                    strike REAL NOT NULL,
                    option_type TEXT NOT NULL,
                    iv REAL NOT NULL,
                    ts TEXT NOT NULL
                )
                """
            )
            conn.execute(
                "CREATE INDEX IF NOT EXISTS idx_iv_hist ON iv_history(symbol, expiration, strike, option_type, ts)"
            )

    def record_snapshot(self, contracts: list[OptionContract], ts: datetime | None = None) -> None:
        ts = ts or datetime.now(timezone.utc)
        rows = []
        for contract in contracts:
            if contract.iv is None:
                continue
            rows.append(
                (
                    contract.underlying,
                    contract.expiration.isoformat(),
                    float(contract.strike),
                    contract.option_type,
                    float(contract.iv),
                    ts.isoformat(),
                )
            )
        if not rows:
            return
        with self._connect() as conn:
            conn.executemany(
                """
                INSERT INTO iv_history (symbol, expiration, strike, option_type, iv, ts)
                VALUES (?, ?, ?, ?, ?, ?)
                """,
                rows,
            )

    def fetch_history(
        self,
        symbol: str,
        expiration: str,
        strike: float,
        option_type: str,
        lookback_days: int = 90,
    ) -> list[float]:
        since = (datetime.now(timezone.utc) - timedelta(days=lookback_days)).isoformat()
        with self._connect() as conn:
            rows = conn.execute(
                """
                SELECT iv FROM iv_history
                WHERE symbol = ? AND expiration = ? AND strike = ? AND option_type = ? AND ts >= ?
                ORDER BY ts ASC
                """,
                (symbol, expiration, strike, option_type, since),
            ).fetchall()
        return [float(row[0]) for row in rows]

    def iv_rank_history(self, contract: OptionContract, lookback_days: int = 90) -> float | None:
        history = self.fetch_history(
            contract.underlying,
            contract.expiration.isoformat(),
            float(contract.strike),
            contract.option_type,
            lookback_days=lookback_days,
        )
        if not history or contract.iv is None:
            return None
        min_iv = min(history)
        max_iv = max(history)
        if max_iv == min_iv:
            return 0.5
        return (float(contract.iv) - min_iv) / (max_iv - min_iv)
