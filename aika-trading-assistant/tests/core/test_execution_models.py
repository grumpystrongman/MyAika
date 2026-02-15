import math

from aika_trading.core.config import ExecutionConfig
from aika_trading.core.execution import ExecutionSimulator
from aika_trading.core.models import OrderRequest


def test_execution_models_apply_costs():
    config = ExecutionConfig(fee_bps=10.0, slippage_bps=10.0, spread_bps=10.0, latency_ms=0)
    simulator = ExecutionSimulator(config)
    order = OrderRequest(symbol="TEST", side="buy", quantity=1.0, order_type="market", market_price=100.0)
    fill, _log = simulator.simulate_fill(order, market_price=100.0)
    assert fill.price > 100.0
    assert math.isclose(fill.fee, fill.price * 0.001, rel_tol=1e-6)
