import os
import respx
import httpx
from cryptography.fernet import Fernet

os.environ["DATABASE_URL"] = "sqlite:///./test.db"
os.environ["TOKEN_ENCRYPTION_KEY"] = Fernet.generate_key().decode("utf-8")

from aika_trading.db.session import init_db, SessionLocal
from aika_trading.security.token_store import upsert_token
from aika_trading.oauth.base import OAuthClient


def setup_module():
    init_db()


def test_token_refresh():
    client = OAuthClient("coinbase", "https://auth", "https://token", None)
    with SessionLocal() as db:
        upsert_token(db, "coinbase", "local", "old", "refresh", "scope", 3600)

    with respx.mock:
        respx.post("https://token").mock(
            return_value=httpx.Response(200, json={"access_token": "new", "refresh_token": "refresh", "expires_in": 3600})
        )
        with SessionLocal() as db:
            data = client.refresh_token(
                db=db,
                client_id="cid",
                client_secret="secret",
                refresh_token="refresh",
                subject_id="local",
            )
            assert data["access_token"] == "new"
