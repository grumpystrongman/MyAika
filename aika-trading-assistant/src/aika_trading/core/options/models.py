from __future__ import annotations

from dataclasses import dataclass, field
from datetime import date
from typing import Any


@dataclass(frozen=True)
class OptionContract:
    symbol: str
    underlying: str
    expiration: date
    strike: float
    option_type: str
    multiplier: int = 100
    style: str = "american"
    bid: float | None = None
    ask: float | None = None
    last: float | None = None
    iv: float | None = None
    open_interest: int | None = None
    volume: int | None = None
    greeks: dict[str, float] = field(default_factory=dict)

    def to_dict(self) -> dict[str, Any]:
        return {
            "symbol": self.symbol,
            "underlying": self.underlying,
            "expiration": self.expiration.isoformat(),
            "strike": self.strike,
            "option_type": self.option_type,
            "multiplier": self.multiplier,
            "style": self.style,
            "bid": self.bid,
            "ask": self.ask,
            "last": self.last,
            "iv": self.iv,
            "open_interest": self.open_interest,
            "volume": self.volume,
            "greeks": self.greeks,
        }


@dataclass
class OptionChain:
    symbol: str
    underlying_price: float
    contracts: list[OptionContract]
    provider: str

    def to_dict(self) -> dict[str, Any]:
        return {
            "symbol": self.symbol,
            "underlying_price": self.underlying_price,
            "provider": self.provider,
            "contracts": [c.to_dict() for c in self.contracts],
        }
