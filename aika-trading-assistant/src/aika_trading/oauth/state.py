import base64
import hashlib
import os
from datetime import datetime, timedelta
from sqlalchemy.orm import Session
from ..db.models import OAuthState


def _random_urlsafe(n: int = 32) -> str:
    return base64.urlsafe_b64encode(os.urandom(n)).rstrip(b"=").decode("ascii")


def build_pkce() -> tuple[str, str]:
    verifier = _random_urlsafe(32)
    digest = hashlib.sha256(verifier.encode("ascii")).digest()
    challenge = base64.urlsafe_b64encode(digest).rstrip(b"=").decode("ascii")
    return verifier, challenge


def create_state(db: Session, provider: str, redirect_uri: str, ttl_minutes: int = 10) -> dict:
    verifier, challenge = build_pkce()
    state_value = _random_urlsafe(24)
    expires_at = datetime.utcnow() + timedelta(minutes=ttl_minutes)
    record = OAuthState(
        provider=provider,
        state=state_value,
        code_verifier=verifier,
        redirect_uri=redirect_uri,
        expires_at=expires_at,
    )
    db.add(record)
    db.commit()
    db.refresh(record)
    return {
        "state": state_value,
        "code_verifier": verifier,
        "code_challenge": challenge,
        "redirect_uri": redirect_uri,
    }


def consume_state(db: Session, provider: str, state_value: str) -> OAuthState | None:
    record = db.query(OAuthState).filter_by(provider=provider, state=state_value).first()
    if not record:
        return None
    if record.expires_at < datetime.utcnow():
        db.delete(record)
        db.commit()
        return None
    db.delete(record)
    db.commit()
    return record
