from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session
from ..deps import get_db
from ...oauth.state import create_state
from ...oauth.base import validate_callback_state, OAuthError
from ...oauth.coinbase import coinbase_oauth
from ...oauth.schwab import schwab_oauth
from ...oauth.alpaca import alpaca_oauth
from ...config import settings
from ...security.token_store import get_token

router = APIRouter(prefix="/oauth", tags=["oauth"])

PROVIDERS = {
    "coinbase": coinbase_oauth,
    "schwab": schwab_oauth,
    "alpaca": alpaca_oauth,
}


def _provider_config(name: str):
    if name == "coinbase":
        return {
            "client_id": settings.coinbase_client_id,
            "client_secret": settings.coinbase_client_secret,
            "redirect_uri": settings.coinbase_redirect_uri,
            "scopes": settings.coinbase_scopes,
        }
    if name == "schwab":
        return {
            "client_id": settings.schwab_client_id,
            "client_secret": settings.schwab_client_secret,
            "redirect_uri": settings.schwab_redirect_uri,
            "scopes": settings.schwab_scopes,
        }
    if name == "alpaca":
        return {
            "client_id": settings.alpaca_client_id,
            "client_secret": settings.alpaca_client_secret,
            "redirect_uri": settings.alpaca_redirect_uri,
            "scopes": settings.alpaca_scopes,
        }
    raise HTTPException(status_code=404, detail="provider_not_found")


@router.get("/{provider}/authorize")
def authorize(provider: str, subject: str = Query(default="local"), db: Session = Depends(get_db)):
    client = PROVIDERS.get(provider)
    if not client:
        raise HTTPException(status_code=404, detail="provider_not_found")
    cfg = _provider_config(provider)
    if not cfg["client_id"] or not cfg["redirect_uri"]:
        raise HTTPException(status_code=400, detail="provider_not_configured")
    state = create_state(db, provider, cfg["redirect_uri"])
    url = client.build_authorize_url(
        client_id=cfg["client_id"],
        redirect_uri=cfg["redirect_uri"],
        scopes=cfg["scopes"],
        state=state["state"],
        code_challenge=state["code_challenge"],
    )
    return {"authorize_url": url, "state": state["state"], "subject": subject}


@router.get("/{provider}/callback")
def callback(
    provider: str,
    code: str,
    state: str,
    subject: str = Query(default="local"),
    db: Session = Depends(get_db),
):
    client = PROVIDERS.get(provider)
    if not client:
        raise HTTPException(status_code=404, detail="provider_not_found")
    cfg = _provider_config(provider)
    try:
        verifier = validate_callback_state(db, provider, state, cfg["redirect_uri"])
        data = client.exchange_code(
            db=db,
            client_id=cfg["client_id"],
            client_secret=cfg["client_secret"],
            code=code,
            redirect_uri=cfg["redirect_uri"],
            code_verifier=verifier,
            subject_id=subject,
        )
        return {"status": "ok", "provider": provider, "token": data}
    except OAuthError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc


@router.post("/{provider}/refresh")
def refresh(provider: str, subject: str = Query(default="local"), db: Session = Depends(get_db)):
    client = PROVIDERS.get(provider)
    if not client:
        raise HTTPException(status_code=404, detail="provider_not_found")
    cfg = _provider_config(provider)
    token = get_token(db, provider, subject)
    if not token or not token.get("refresh_token"):
        raise HTTPException(status_code=404, detail="refresh_token_missing")
    try:
        data = client.refresh_token(
            db=db,
            client_id=cfg["client_id"],
            client_secret=cfg["client_secret"],
            refresh_token=token["refresh_token"],
            subject_id=subject,
        )
        return {"status": "ok", "token": data}
    except OAuthError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc


@router.post("/{provider}/revoke")
def revoke(provider: str, subject: str = Query(default="local"), db: Session = Depends(get_db)):
    client = PROVIDERS.get(provider)
    if not client:
        raise HTTPException(status_code=404, detail="provider_not_found")
    cfg = _provider_config(provider)
    token = get_token(db, provider, subject)
    if not token:
        raise HTTPException(status_code=404, detail="token_not_found")
    try:
        client.revoke(
            db=db,
            client_id=cfg["client_id"],
            client_secret=cfg["client_secret"],
            token=token["access_token"],
            subject_id=subject,
        )
        return {"status": "revoked"}
    except OAuthError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
