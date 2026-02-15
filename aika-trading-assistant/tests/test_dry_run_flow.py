import os
from cryptography.fernet import Fernet
import uuid

os.environ["DATABASE_URL"] = "sqlite:///./test.db"
os.environ["TOKEN_ENCRYPTION_KEY"] = Fernet.generate_key().decode("utf-8")
os.environ["APPROVAL_SIGNING_KEY"] = "test-signing-key"
os.environ["REDIS_URL"] = ""

from aika_trading.db.session import init_db, SessionLocal
from aika_trading.security.policy import PolicyEngine
from aika_trading.security.approvals import approve
from aika_trading.trading.execution import propose_trade, execute_trade
from aika_trading.connectors.base import BrokerConnector


class DummyConnector(BrokerConnector):
    name = "dummy"

    def get_account(self):
        return {"ok": True}

    def get_positions(self):
        return []

    def get_market_data(self, symbol: str):
        return {"symbol": symbol, "price": 100}

    def place_order(self, order: dict):
        return {"order_id": "ext-1"}

    def cancel_order(self, order_id: str):
        return {"ok": True}


def setup_module():
    init_db()


def test_dry_run_flow():
    policy = PolicyEngine()
    payload = {
        "broker": "dummy",
        "symbol": "AAPL",
        "side": "buy",
        "quantity": 1,
        "idempotency_key": f"test-run-{uuid.uuid4()}",
    }
    with SessionLocal() as db:
        result = propose_trade(db, policy, payload, "tester")
        assert result.get("approval") is not None
        approval = approve(db, result["approval"].id, "approver")
        assert approval.status == "approved"
        outcome = execute_trade(db, DummyConnector(), result["order_id"], payload)
        assert outcome["status"] == "executed"
