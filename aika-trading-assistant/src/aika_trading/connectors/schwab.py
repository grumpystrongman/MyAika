from typing import Any
import httpx
from ..config import settings
from .base import BrokerConnector


class SchwabConnector(BrokerConnector):
    name = "schwab"

    def __init__(self, access_token: str) -> None:
        self._token = access_token
        self._base = settings.schwab_api_base if hasattr(settings, "schwab_api_base") else ""

    def _headers(self) -> dict[str, str]:
        return {"Authorization": f"Bearer {self._token}", "Content-Type": "application/json"}

    def get_account(self) -> dict[str, Any]:
        if not self._base:
            raise RuntimeError("SCHWAB_API_BASE not configured")
        resp = httpx.get(f"{self._base}/accounts", headers=self._headers(), timeout=20.0)
        resp.raise_for_status()
        return resp.json()

    def get_positions(self) -> list[dict[str, Any]]:
        data = self.get_account()
        return data.get("positions", []) if isinstance(data, dict) else []

    def get_market_data(self, symbol: str) -> dict[str, Any]:
        if not self._base:
            raise RuntimeError("SCHWAB_API_BASE not configured")
        resp = httpx.get(f"{self._base}/marketdata/{symbol}", headers=self._headers(), timeout=20.0)
        resp.raise_for_status()
        return resp.json()

    def place_order(self, order: dict[str, Any]) -> dict[str, Any]:
        if not self._base:
            raise RuntimeError("SCHWAB_API_BASE not configured")
        resp = httpx.post(f"{self._base}/orders", headers=self._headers(), json=order, timeout=20.0)
        resp.raise_for_status()
        return resp.json()

    def cancel_order(self, order_id: str) -> dict[str, Any]:
        if not self._base:
            raise RuntimeError("SCHWAB_API_BASE not configured")
        resp = httpx.delete(f"{self._base}/orders/{order_id}", headers=self._headers(), timeout=20.0)
        resp.raise_for_status()
        return resp.json()
