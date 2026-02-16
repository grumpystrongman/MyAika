from datetime import datetime, timedelta, timezone

from aika_trading.core.models import Bar
from aika_trading.core.options.backtest import backtest_wheel


def _bars(n=120):
    base = datetime.now(timezone.utc)
    bars = []
    price = 100.0
    for i in range(n):
        price += 0.1
        bars.append(
            Bar(
                ts=base + timedelta(days=i),
                open=price,
                high=price + 1,
                low=price - 1,
                close=price,
                volume=1000,
                symbol="TEST",
                timeframe="1d",
                source="test",
                fetched_at=base,
            )
        )
    return bars


def test_options_backtest_wheel_runs():
    bars = _bars()
    result = backtest_wheel(bars, initial_cash=10000, hold_days=30)
    assert result.equity_curve
    assert "cagr" in result.metrics
