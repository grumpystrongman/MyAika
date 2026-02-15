from aika_trading.core.data import SyntheticDataProvider
from aika_trading.core.strategy import registry
from aika_trading.core.backtest import run_backtest


def test_smoke_backtest_runs():
    provider = SyntheticDataProvider(seed=42, points=120)
    bars = provider.get_bars("TEST", "1h")
    strategy = registry.create("volatility_momentum", lookback=20)
    result = run_backtest(strategy, bars)
    assert "cagr" in result.metrics
    assert isinstance(result.trades, list)
