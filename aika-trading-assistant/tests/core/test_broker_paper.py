from aika_trading.core.config import ExecutionConfig
from aika_trading.core.execution import ExecutionSimulator
from aika_trading.core.models import OrderRequest
from aika_trading.core.brokers.paper import PaperBroker


def test_paper_broker_updates_positions():
    simulator = ExecutionSimulator(ExecutionConfig(fee_bps=0.0, slippage_bps=0.0, spread_bps=0.0, latency_ms=0))
    broker = PaperBroker(simulator, initial_cash=1000.0)
    order = OrderRequest(symbol="TEST", side="buy", quantity=1.0, order_type="market", market_price=10.0)
    fill = broker.place_order(order)
    positions = broker.get_positions()
    assert len(positions) == 1
    assert positions[0]["symbol"] == "TEST"
    assert fill.price == 10.0
