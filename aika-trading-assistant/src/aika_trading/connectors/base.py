from abc import ABC, abstractmethod
from typing import Any


class BrokerConnector(ABC):
    name: str
    read_only: bool = False

    @abstractmethod
    def get_account(self) -> dict[str, Any]:
        raise NotImplementedError

    @abstractmethod
    def get_positions(self) -> list[dict[str, Any]]:
        raise NotImplementedError

    @abstractmethod
    def get_market_data(self, symbol: str) -> dict[str, Any]:
        raise NotImplementedError

    @abstractmethod
    def place_order(self, order: dict[str, Any]) -> dict[str, Any]:
        raise NotImplementedError

    @abstractmethod
    def cancel_order(self, order_id: str) -> dict[str, Any]:
        raise NotImplementedError
