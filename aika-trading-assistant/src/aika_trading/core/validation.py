from __future__ import annotations

from datetime import datetime

from .models import Bar


def ensure_time_ordered(bars: list[Bar]) -> None:
    if not bars:
        return
    last_ts: datetime | None = None
    for bar in bars:
        if last_ts and bar.ts < last_ts:
            raise ValueError("bars_not_time_ordered")
        last_ts = bar.ts


def ensure_timezone_consistent(bars: list[Bar]) -> None:
    if not bars:
        return
    tzinfo = bars[0].ts.tzinfo
    for bar in bars:
        if bar.ts.tzinfo != tzinfo:
            raise ValueError("timezone_inconsistent")
