from typing import Any
import httpx
from ..config import settings
from .base import BrokerConnector


class AlpacaConnector(BrokerConnector):
    name = "alpaca"

    def __init__(self, api_key: str | None = None, api_secret: str | None = None, access_token: str | None = None) -> None:
        self._api_key = api_key or settings.alpaca_api_key
        self._api_secret = api_secret or settings.alpaca_api_secret
        self._access_token = access_token
        self._base = settings.alpaca_api_base

    def _headers(self) -> dict[str, str]:
        if self._access_token:
            return {"Authorization": f"Bearer {self._access_token}", "Content-Type": "application/json"}
        return {
            "APCA-API-KEY-ID": self._api_key or "",
            "APCA-API-SECRET-KEY": self._api_secret or "",
            "Content-Type": "application/json",
        }

    def get_account(self) -> dict[str, Any]:
        resp = httpx.get(f"{self._base}/v2/account", headers=self._headers(), timeout=20.0)
        resp.raise_for_status()
        return resp.json()

    def get_positions(self) -> list[dict[str, Any]]:
        resp = httpx.get(f"{self._base}/v2/positions", headers=self._headers(), timeout=20.0)
        resp.raise_for_status()
        return resp.json()

    def get_market_data(self, symbol: str) -> dict[str, Any]:
        resp = httpx.get(f"{self._base}/v2/stocks/{symbol}/trades/latest", headers=self._headers(), timeout=20.0)
        resp.raise_for_status()
        return resp.json()

    def place_order(self, order: dict[str, Any]) -> dict[str, Any]:
        resp = httpx.post(f"{self._base}/v2/orders", headers=self._headers(), json=order, timeout=20.0)
        resp.raise_for_status()
        return resp.json()

    def cancel_order(self, order_id: str) -> dict[str, Any]:
        resp = httpx.delete(f"{self._base}/v2/orders/{order_id}", headers=self._headers(), timeout=20.0)
        resp.raise_for_status()
        return resp.json()
