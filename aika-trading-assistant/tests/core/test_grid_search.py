from aika_trading.core.data import SyntheticDataProvider
from aika_trading.core.strategy import registry
from aika_trading.core.backtest import run_grid_search


def test_grid_search_runs():
    provider = SyntheticDataProvider(seed=7, points=120)
    bars = provider.get_bars("TEST", "1h")
    result = run_grid_search(
        lambda **params: registry.create("volatility_momentum", **params),
        bars,
        {"lookback": [10, 20]},
    )
    assert result["results"]
    assert result["best"] is not None
