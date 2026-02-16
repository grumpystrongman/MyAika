from __future__ import annotations

from dataclasses import dataclass, field, asdict
from datetime import datetime, timezone
from typing import Any

ISO_FMT = "%Y-%m-%dT%H:%M:%S.%fZ"


def utc_now() -> datetime:
    return datetime.now(timezone.utc)


def _dt_to_iso(value: datetime | None) -> str | None:
    if value is None:
        return None
    return value.strftime(ISO_FMT)


def _iso_to_dt(value: str | None) -> datetime | None:
    if not value:
        return None
    try:
        return datetime.strptime(value, ISO_FMT)
    except ValueError:
        return datetime.fromisoformat(value.replace("Z", "+00:00"))


@dataclass(frozen=True)
class Bar:
    ts: datetime
    open: float
    high: float
    low: float
    close: float
    volume: float
    symbol: str
    timeframe: str
    source: str
    fetched_at: datetime

    def to_dict(self) -> dict[str, Any]:
        return {
            "ts": _dt_to_iso(self.ts),
            "open": self.open,
            "high": self.high,
            "low": self.low,
            "close": self.close,
            "volume": self.volume,
            "symbol": self.symbol,
            "timeframe": self.timeframe,
            "source": self.source,
            "fetched_at": _dt_to_iso(self.fetched_at),
        }

    @staticmethod
    def from_dict(payload: dict[str, Any]) -> "Bar":
        return Bar(
            ts=_iso_to_dt(payload.get("ts")) or utc_now(),
            open=float(payload.get("open") or payload.get("o") or 0.0),
            high=float(payload.get("high") or payload.get("h") or 0.0),
            low=float(payload.get("low") or payload.get("l") or 0.0),
            close=float(payload.get("close") or payload.get("c") or 0.0),
            volume=float(payload.get("volume") or payload.get("v") or 0.0),
            symbol=str(payload.get("symbol") or ""),
            timeframe=str(payload.get("timeframe") or ""),
            source=str(payload.get("source") or "unknown"),
            fetched_at=_iso_to_dt(payload.get("fetched_at")) or utc_now(),
        )


@dataclass(frozen=True)
class Signal:
    symbol: str
    side: str
    strength: float
    generated_at: datetime
    meta: dict[str, Any] = field(default_factory=dict)

    def to_dict(self) -> dict[str, Any]:
        return {
            "symbol": self.symbol,
            "side": self.side,
            "strength": self.strength,
            "generated_at": _dt_to_iso(self.generated_at),
            "meta": self.meta,
        }


@dataclass(frozen=True)
class OrderRequest:
    symbol: str
    side: str
    quantity: float
    order_type: str
    limit_price: float | None = None
    stop_price: float | None = None
    market_price: float | None = None
    time_in_force: str = "day"
    strategy_name: str | None = None
    client_order_id: str | None = None
    meta: dict[str, Any] = field(default_factory=dict)

    def to_dict(self) -> dict[str, Any]:
        return asdict(self)


@dataclass(frozen=True)
class Fill:
    order_id: str
    symbol: str
    side: str
    quantity: float
    price: float
    fee: float
    slippage_bps: float
    spread_bps: float
    latency_ms: int
    filled_at: datetime
    assumptions: dict[str, Any] = field(default_factory=dict)

    def to_dict(self) -> dict[str, Any]:
        return {
            "order_id": self.order_id,
            "symbol": self.symbol,
            "side": self.side,
            "quantity": self.quantity,
            "price": self.price,
            "fee": self.fee,
            "slippage_bps": self.slippage_bps,
            "spread_bps": self.spread_bps,
            "latency_ms": self.latency_ms,
            "filled_at": _dt_to_iso(self.filled_at),
            "assumptions": self.assumptions,
        }


@dataclass
class Position:
    symbol: str
    quantity: float
    avg_price: float
    market_price: float

    def market_value(self) -> float:
        return self.quantity * self.market_price


@dataclass
class PortfolioState:
    cash: float
    equity: float
    positions: dict[str, Position] = field(default_factory=dict)
    gross_exposure: float = 0.0
    net_exposure: float = 0.0
    peak_equity: float = 0.0
    drawdown: float = 0.0
    loss_streak: int = 0


@dataclass(frozen=True)
class RiskDecision:
    decision: str
    reason: str
    adjusted_quantity: float | None = None
    risk_flags: list[str] = field(default_factory=list)


@dataclass
class RunSummary:
    run_id: str
    mode: str
    status: str
    started_at: datetime
    completed_at: datetime | None
    strategy: str
    symbols: list[str]
    equity: float
    cash: float
    exposure: float
    risk_flags: list[str] = field(default_factory=list)
    metrics: dict[str, Any] = field(default_factory=dict)
    equity_curve: list[float] = field(default_factory=list)
    drawdown_curve: list[float] = field(default_factory=list)
    regime_labels: list[str] = field(default_factory=list)
    ensemble_weights: dict[str, float] = field(default_factory=dict)

    def to_dict(self) -> dict[str, Any]:
        return {
            "run_id": self.run_id,
            "mode": self.mode,
            "status": self.status,
            "started_at": _dt_to_iso(self.started_at),
            "completed_at": _dt_to_iso(self.completed_at) if self.completed_at else None,
            "strategy": self.strategy,
            "symbols": self.symbols,
            "equity": self.equity,
            "cash": self.cash,
            "exposure": self.exposure,
            "risk_flags": self.risk_flags,
            "metrics": self.metrics,
            "equity_curve": self.equity_curve,
            "drawdown_curve": self.drawdown_curve,
            "regime_labels": self.regime_labels,
            "ensemble_weights": self.ensemble_weights,
        }
