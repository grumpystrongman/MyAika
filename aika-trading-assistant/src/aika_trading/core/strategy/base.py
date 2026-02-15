from __future__ import annotations

from abc import ABC, abstractmethod
from typing import Any

from ..models import Bar, Signal


class Strategy(ABC):
    name: str
    version: str = "0.1"

    def __init__(self, **params: Any) -> None:
        self.params = params

    @property
    def min_history(self) -> int:
        return int(self.params.get("min_history", 30))

    @abstractmethod
    def generate_signals(self, history: list[Bar]) -> list[Signal]:
        raise NotImplementedError

    def position_sizing(self, signal: Signal, portfolio_value: float) -> float:
        risk_pct = float(self.params.get("risk_pct", 0.02))
        return max(0.0, portfolio_value * risk_pct)

    def risk_overrides(self, signal: Signal) -> dict[str, Any]:
        return {}
