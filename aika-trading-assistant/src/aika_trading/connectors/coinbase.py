from typing import Any
import httpx
from tenacity import retry, stop_after_attempt, wait_exponential
from ..config import settings
from .base import BrokerConnector


class CoinbaseClient(BrokerConnector):
    name = "coinbase"

    def __init__(self, access_token: str) -> None:
        self._token = access_token
        self._base = settings.coinbase_api_base
        self._ws_url = settings.coinbase_ws_url
        if settings.coinbase_sandbox:
            self._base = settings.coinbase_sandbox_api_base
            self._ws_url = settings.coinbase_sandbox_ws_url

    def _headers(self) -> dict[str, str]:
        return {"Authorization": f"Bearer {self._token}", "Content-Type": "application/json"}

    @retry(stop=stop_after_attempt(3), wait=wait_exponential(multiplier=0.5, min=1, max=6))
    def _get(self, path: str) -> dict[str, Any]:
        url = f"{self._base}{path}"
        resp = httpx.get(url, headers=self._headers(), timeout=20.0)
        resp.raise_for_status()
        return resp.json()

    @retry(stop=stop_after_attempt(3), wait=wait_exponential(multiplier=0.5, min=1, max=6))
    def _post(self, path: str, payload: dict[str, Any]) -> dict[str, Any]:
        url = f"{self._base}{path}"
        resp = httpx.post(url, headers=self._headers(), json=payload, timeout=20.0)
        resp.raise_for_status()
        return resp.json()

    def get_account(self) -> dict[str, Any]:
        return self._get("/accounts")

    def get_positions(self) -> list[dict[str, Any]]:
        data = self._get("/positions")
        return data.get("positions", [])

    def get_market_data(self, symbol: str) -> dict[str, Any]:
        return self._get(f"/market/products/{symbol}")

    def place_order(self, order: dict[str, Any]) -> dict[str, Any]:
        return self._post("/orders", order)

    def cancel_order(self, order_id: str) -> dict[str, Any]:
        return self._post("/orders/cancel", {"order_ids": [order_id]})


class CoinbaseWebSocket:
    def __init__(self, access_token: str) -> None:
        self.url = settings.coinbase_ws_url if not settings.coinbase_sandbox else settings.coinbase_sandbox_ws_url
        self.token = access_token

    async def connect(self, channels: list[str], product_ids: list[str]) -> dict[str, Any]:
        return {
            "type": "subscribe",
            "product_ids": product_ids,
            "channels": channels,
            "token": self.token,
        }
