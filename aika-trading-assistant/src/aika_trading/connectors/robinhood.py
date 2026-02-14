from typing import Any
from .base import BrokerConnector
from ..config import settings


class RobinhoodConnector(BrokerConnector):
    name = "robinhood"
    read_only = True

    def __init__(self) -> None:
        if not settings.robinhood_read_only:
            raise RuntimeError("Robinhood connector is experimental; enable read-only only.")

    def get_account(self) -> dict[str, Any]:
        return {"status": "unsupported", "mode": "read_only"}

    def get_positions(self) -> list[dict[str, Any]]:
        return []

    def get_market_data(self, symbol: str) -> dict[str, Any]:
        return {"symbol": symbol, "status": "unsupported"}

    def place_order(self, order: dict[str, Any]) -> dict[str, Any]:
        raise RuntimeError("robinhood_connector_read_only")

    def cancel_order(self, order_id: str) -> dict[str, Any]:
        raise RuntimeError("robinhood_connector_read_only")
