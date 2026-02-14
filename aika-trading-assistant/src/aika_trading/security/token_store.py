from datetime import datetime, timedelta
from sqlalchemy.orm import Session
from ..db.models import OAuthToken
from .crypto import encrypt_value, decrypt_value


class TokenStoreError(RuntimeError):
    pass


def upsert_token(
    db: Session,
    provider: str,
    subject_id: str,
    access_token: str,
    refresh_token: str | None,
    scopes: str | None,
    expires_in: int | None,
) -> OAuthToken:
    existing = db.query(OAuthToken).filter_by(provider=provider, subject_id=subject_id).first()
    expires_at = datetime.utcnow() + timedelta(seconds=expires_in) if expires_in else None
    if existing:
        existing.access_token_enc = encrypt_value(access_token)
        existing.refresh_token_enc = encrypt_value(refresh_token) if refresh_token else None
        existing.scopes = scopes
        existing.expires_at = expires_at
        existing.updated_at = datetime.utcnow()
        db.add(existing)
        db.commit()
        db.refresh(existing)
        return existing

    record = OAuthToken(
        provider=provider,
        subject_id=subject_id,
        access_token_enc=encrypt_value(access_token),
        refresh_token_enc=encrypt_value(refresh_token) if refresh_token else None,
        scopes=scopes,
        expires_at=expires_at,
    )
    db.add(record)
    db.commit()
    db.refresh(record)
    return record


def get_token(db: Session, provider: str, subject_id: str) -> dict | None:
    record = db.query(OAuthToken).filter_by(provider=provider, subject_id=subject_id).first()
    if not record:
        return None
    return {
        "provider": record.provider,
        "subject_id": record.subject_id,
        "access_token": decrypt_value(record.access_token_enc),
        "refresh_token": decrypt_value(record.refresh_token_enc) if record.refresh_token_enc else None,
        "scopes": record.scopes,
        "expires_at": record.expires_at,
    }


def revoke_token(db: Session, provider: str, subject_id: str) -> bool:
    record = db.query(OAuthToken).filter_by(provider=provider, subject_id=subject_id).first()
    if not record:
        return False
    db.delete(record)
    db.commit()
    return True
