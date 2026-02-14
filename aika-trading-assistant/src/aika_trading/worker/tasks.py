from .app import celery_app
from ..db.session import SessionLocal
from ..security.token_store import get_token
from ..oauth.coinbase import coinbase_oauth
from ..oauth.schwab import schwab_oauth
from ..oauth.alpaca import alpaca_oauth
from ..config import settings


@celery_app.task
def refresh_tokens():
    with SessionLocal() as db:
        for provider, client, cfg in [
            ("coinbase", coinbase_oauth, settings),
            ("schwab", schwab_oauth, settings),
            ("alpaca", alpaca_oauth, settings),
        ]:
            token = get_token(db, provider, "local")
            if not token or not token.get("refresh_token"):
                continue
            client_id = getattr(cfg, f"{provider}_client_id")
            client_secret = getattr(cfg, f"{provider}_client_secret")
            client.refresh_token(
                db=db,
                client_id=client_id,
                client_secret=client_secret,
                refresh_token=token["refresh_token"],
                subject_id="local",
            )


@celery_app.task
def ingest_knowledge(payload: dict):
    # Stub for knowledge ingestion
    return {"status": "ok", "items": len(payload.get("items", []))}
