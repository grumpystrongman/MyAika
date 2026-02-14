import os
from datetime import timedelta

os.environ["DATABASE_URL"] = "sqlite:///./test.db"

from sqlalchemy.orm import Session
from aika_trading.db.session import init_db, SessionLocal
from aika_trading.oauth.state import create_state, consume_state


def setup_module():
    init_db()


def test_oauth_state_roundtrip():
    with SessionLocal() as db:
        state = create_state(db, "coinbase", "http://localhost/callback")
        record = consume_state(db, "coinbase", state["state"])
        assert record is not None
        assert record.code_verifier


def test_oauth_state_invalid():
    with SessionLocal() as db:
        record = consume_state(db, "coinbase", "missing")
        assert record is None
