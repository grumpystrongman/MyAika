from datetime import datetime

from aika_trading.core.config import RiskConfig
from aika_trading.core.models import OrderRequest, PortfolioState
from aika_trading.core.risk import RiskEngine


def test_risk_engine_caps_position():
    engine = RiskEngine(RiskConfig(max_position_value=100.0, max_leverage=2.0, max_drawdown=0.5, max_loss_streak=5))
    portfolio = PortfolioState(cash=1000.0, equity=1000.0)
    order = OrderRequest(symbol="TEST", side="buy", quantity=10.0, order_type="market", market_price=50.0)
    decision = engine.evaluate_order(order, portfolio, market_price=50.0)
    assert decision.decision == "reduce"
    assert decision.adjusted_quantity is not None


def test_risk_engine_denies_drawdown():
    engine = RiskEngine(RiskConfig(max_position_value=10000.0, max_leverage=2.0, max_drawdown=0.1, max_loss_streak=5))
    portfolio = PortfolioState(cash=1000.0, equity=1000.0, drawdown=0.2)
    order = OrderRequest(symbol="TEST", side="buy", quantity=1.0, order_type="market", market_price=10.0)
    decision = engine.evaluate_order(order, portfolio, market_price=10.0)
    assert decision.decision == "deny"
