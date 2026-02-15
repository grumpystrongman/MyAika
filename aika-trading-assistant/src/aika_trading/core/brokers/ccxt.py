from __future__ import annotations

import uuid
from typing import Any

from ..models import Fill, OrderRequest, utc_now
from .base import Broker


class CcxtBroker(Broker):
    name = "ccxt"

    def __init__(self, exchange: str, api_key: str | None = None, api_secret: str | None = None) -> None:
        try:
            import ccxt  # type: ignore
        except Exception as exc:
            raise RuntimeError("ccxt_not_installed") from exc
        if not hasattr(ccxt, exchange):
            raise RuntimeError("exchange_not_supported")
        klass = getattr(ccxt, exchange)
        self._client = klass({"apiKey": api_key, "secret": api_secret})

    def get_account(self) -> dict[str, Any]:
        return self._client.fetch_balance()

    def get_positions(self) -> list[dict[str, Any]]:
        return []

    def place_order(self, order: OrderRequest) -> Fill:
        resp = self._client.create_order(
            order.symbol,
            order.order_type,
            order.side,
            order.quantity,
            order.limit_price,
        )
        price = order.market_price or order.limit_price or 0.0
        return Fill(
            order_id=str(resp.get("id") or uuid.uuid4()),
            symbol=order.symbol,
            side=order.side,
            quantity=order.quantity,
            price=price,
            fee=0.0,
            slippage_bps=0.0,
            spread_bps=0.0,
            latency_ms=0,
            filled_at=utc_now(),
            assumptions={"source": "ccxt"},
        )

    def cancel_order(self, order_id: str) -> dict[str, Any]:
        return {"status": "cancelled", "order_id": order_id}

    def get_open_orders(self) -> list[dict[str, Any]]:
        return []
