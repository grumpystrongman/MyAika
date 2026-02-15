from __future__ import annotations

import uuid
from dataclasses import dataclass
from datetime import datetime

from .config import ExecutionConfig
from .models import Fill, OrderRequest, utc_now


@dataclass
class ExecutionLog:
    fee: float
    slippage_bps: float
    spread_bps: float
    latency_ms: int
    liquidity_ok: bool
    notes: str | None = None


class FeeModel:
    def __init__(self, fee_bps: float, min_fee: float = 0.0) -> None:
        self._fee_bps = fee_bps
        self._min_fee = min_fee

    def compute(self, price: float, quantity: float) -> float:
        fee = price * quantity * (self._fee_bps / 10_000)
        return max(self._min_fee, fee)


class SlippageModel:
    def __init__(self, slippage_bps: float) -> None:
        self._slippage_bps = slippage_bps

    def apply(self, price: float, side: str) -> float:
        if side == "buy":
            return price * (1 + self._slippage_bps / 10_000)
        if side == "sell":
            return price * (1 - self._slippage_bps / 10_000)
        return price


class SpreadModel:
    def __init__(self, spread_bps: float) -> None:
        self._spread_bps = spread_bps

    def apply(self, price: float, side: str) -> float:
        half = self._spread_bps / 20_000
        if side == "buy":
            return price * (1 + half)
        if side == "sell":
            return price * (1 - half)
        return price


class LiquidityGuard:
    def __init__(self, min_volume: float, max_adv_pct: float) -> None:
        self._min_volume = min_volume
        self._max_adv_pct = max_adv_pct

    def allow(self, quantity: float, daily_volume: float | None) -> bool:
        if daily_volume is None:
            return True
        if daily_volume < self._min_volume:
            return False
        return quantity <= daily_volume * self._max_adv_pct


class ExecutionSimulator:
    def __init__(self, config: ExecutionConfig) -> None:
        self._fee_model = FeeModel(config.fee_bps)
        self._slippage_model = SlippageModel(config.slippage_bps)
        self._spread_model = SpreadModel(config.spread_bps)
        self._latency_ms = config.latency_ms
        self._liquidity_guard = LiquidityGuard(config.min_volume, config.max_adv_pct)

    def simulate_fill(
        self,
        order: OrderRequest,
        market_price: float,
        market_volume: float | None = None,
        timestamp: datetime | None = None,
    ) -> tuple[Fill, ExecutionLog]:
        if not self._liquidity_guard.allow(order.quantity, market_volume):
            raise RuntimeError("liquidity_guard_blocked")
        price = self._spread_model.apply(market_price, order.side)
        price = self._slippage_model.apply(price, order.side)
        fee = self._fee_model.compute(price, order.quantity)
        filled_at = timestamp or utc_now()
        fill = Fill(
            order_id=order.client_order_id or str(uuid.uuid4()),
            symbol=order.symbol,
            side=order.side,
            quantity=order.quantity,
            price=price,
            fee=fee,
            slippage_bps=self._slippage_model._slippage_bps,
            spread_bps=self._spread_model._spread_bps,
            latency_ms=self._latency_ms,
            filled_at=filled_at,
            assumptions={
                "fee_bps": self._fee_model._fee_bps,
                "slippage_bps": self._slippage_model._slippage_bps,
                "spread_bps": self._spread_model._spread_bps,
                "latency_ms": self._latency_ms,
            },
        )
        log = ExecutionLog(
            fee=fee,
            slippage_bps=self._slippage_model._slippage_bps,
            spread_bps=self._spread_model._spread_bps,
            latency_ms=self._latency_ms,
            liquidity_ok=True,
        )
        return fill, log
