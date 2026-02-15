from aika_trading.core.data import SyntheticDataProvider
from aika_trading.core.strategy import registry
from aika_trading.core.walk_forward import walk_forward


def test_walk_forward_runs():
    provider = SyntheticDataProvider(seed=7, points=200)
    bars = provider.get_bars("TEST", "1h")
    results = walk_forward(bars, lambda: registry.create("mean_reversion", lookback=20), train_window=120, test_window=40)
    assert results
    assert "metrics" in results[0]
