from typing import Any
import httpx
from ..config import settings
from ..security.token_store import upsert_token, revoke_token
from .state import consume_state


class OAuthError(RuntimeError):
    pass


class OAuthClient:
    def __init__(self, provider: str, auth_url: str, token_url: str, revoke_url: str | None) -> None:
        self.provider = provider
        self.auth_url = auth_url
        self.token_url = token_url
        self.revoke_url = revoke_url

    def build_authorize_url(self, *, client_id: str, redirect_uri: str, scopes: str, state: str, code_challenge: str) -> str:
        params = {
            "response_type": "code",
            "client_id": client_id,
            "redirect_uri": redirect_uri,
            "scope": scopes,
            "state": state,
            "code_challenge": code_challenge,
            "code_challenge_method": "S256",
        }
        return str(httpx.URL(self.auth_url, params=params))

    def exchange_code(
        self,
        *,
        db,
        client_id: str,
        client_secret: str,
        code: str,
        redirect_uri: str,
        code_verifier: str,
        subject_id: str,
    ) -> dict:
        payload = {
            "grant_type": "authorization_code",
            "client_id": client_id,
            "client_secret": client_secret,
            "code": code,
            "redirect_uri": redirect_uri,
            "code_verifier": code_verifier,
        }
        response = httpx.post(self.token_url, data=payload, timeout=20.0)
        if response.status_code >= 400:
            raise OAuthError(f"token_exchange_failed:{response.text}")
        data = response.json()
        upsert_token(
            db,
            self.provider,
            subject_id,
            data.get("access_token", ""),
            data.get("refresh_token"),
            data.get("scope"),
            data.get("expires_in"),
        )
        return data

    def refresh_token(
        self,
        *,
        db,
        client_id: str,
        client_secret: str,
        refresh_token: str,
        subject_id: str,
    ) -> dict:
        payload = {
            "grant_type": "refresh_token",
            "client_id": client_id,
            "client_secret": client_secret,
            "refresh_token": refresh_token,
        }
        response = httpx.post(self.token_url, data=payload, timeout=20.0)
        if response.status_code >= 400:
            raise OAuthError(f"token_refresh_failed:{response.text}")
        data = response.json()
        upsert_token(
            db,
            self.provider,
            subject_id,
            data.get("access_token", ""),
            data.get("refresh_token", refresh_token),
            data.get("scope"),
            data.get("expires_in"),
        )
        return data

    def revoke(self, *, db, client_id: str, client_secret: str, token: str, subject_id: str) -> bool:
        if not self.revoke_url:
            revoke_token(db, self.provider, subject_id)
            return True
        payload = {"token": token, "client_id": client_id, "client_secret": client_secret}
        response = httpx.post(self.revoke_url, data=payload, timeout=20.0)
        if response.status_code >= 400:
            raise OAuthError(f"token_revoke_failed:{response.text}")
        revoke_token(db, self.provider, subject_id)
        return True


def validate_callback_state(db, provider: str, state_value: str, redirect_uri: str) -> str:
    record = consume_state(db, provider, state_value)
    if not record:
        raise OAuthError("invalid_state")
    if record.redirect_uri != redirect_uri:
        raise OAuthError("redirect_uri_mismatch")
    return record.code_verifier
