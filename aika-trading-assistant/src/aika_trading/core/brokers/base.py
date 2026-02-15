from __future__ import annotations

from abc import ABC, abstractmethod
from typing import Any

from ..models import OrderRequest, Fill


class Broker(ABC):
    name: str

    @abstractmethod
    def get_account(self) -> dict[str, Any]:
        raise NotImplementedError

    @abstractmethod
    def get_positions(self) -> list[dict[str, Any]]:
        raise NotImplementedError

    @abstractmethod
    def place_order(self, order: OrderRequest) -> Fill:
        raise NotImplementedError

    @abstractmethod
    def cancel_order(self, order_id: str) -> dict[str, Any]:
        raise NotImplementedError

    @abstractmethod
    def get_open_orders(self) -> list[dict[str, Any]]:
        raise NotImplementedError

    def stream_prices(self):
        return None
