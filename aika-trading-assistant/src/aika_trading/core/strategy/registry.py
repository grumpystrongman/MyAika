from __future__ import annotations

from typing import Callable, Type

from .base import Strategy


class StrategyRegistry:
    def __init__(self) -> None:
        self._strategies: dict[str, Type[Strategy]] = {}

    def register(self, cls: Type[Strategy]) -> Type[Strategy]:
        self._strategies[cls.name] = cls
        return cls

    def create(self, name: str, **params) -> Strategy:
        if name not in self._strategies:
            raise KeyError(f"strategy_not_found:{name}")
        return self._strategies[name](**params)

    def list(self) -> list[str]:
        return sorted(self._strategies.keys())


registry = StrategyRegistry()
