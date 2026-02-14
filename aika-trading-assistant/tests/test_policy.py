import os

os.environ["DATABASE_URL"] = "sqlite:///./test.db"

from aika_trading.security.policy import PolicyEngine


def test_policy_requires_approval_by_default():
    engine = PolicyEngine()
    decision = engine.evaluate_trade("trade.place", {"broker": "alpaca", "symbol": "AAPL"})
    assert decision.requires_approval is True
    assert decision.decision in {"require_approval", "deny"}
