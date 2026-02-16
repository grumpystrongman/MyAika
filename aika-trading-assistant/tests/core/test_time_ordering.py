from datetime import datetime, timedelta, timezone

import pytest

from aika_trading.core.models import Bar
from aika_trading.core.validation import ensure_time_ordered


def _bar(ts: datetime) -> Bar:
    return Bar(
        ts=ts,
        open=1.0,
        high=1.0,
        low=1.0,
        close=1.0,
        volume=1.0,
        symbol="TEST",
        timeframe="1h",
        source="test",
        fetched_at=ts,
    )


def test_time_ordering_raises():
    base = datetime.now(timezone.utc)
    bars = [_bar(base + timedelta(hours=1)), _bar(base)]
    with pytest.raises(ValueError):
        ensure_time_ordered(bars)


def test_time_ordering_ok():
    base = datetime.now(timezone.utc)
    bars = [_bar(base), _bar(base + timedelta(hours=1))]
    ensure_time_ordered(bars)
