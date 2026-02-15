from __future__ import annotations

import uuid
from datetime import datetime
from typing import Any

from ..models import Fill, OrderRequest, utc_now
from .base import Broker
from ...connectors.alpaca import AlpacaConnector


class AlpacaBroker(Broker):
    name = "alpaca"

    def __init__(self, api_key: str | None = None, api_secret: str | None = None) -> None:
        self._client = AlpacaConnector(api_key=api_key, api_secret=api_secret)

    def get_account(self) -> dict[str, Any]:
        return self._client.get_account()

    def get_positions(self) -> list[dict[str, Any]]:
        return self._client.get_positions()

    def place_order(self, order: OrderRequest) -> Fill:
        payload = {
            "symbol": order.symbol,
            "side": order.side,
            "qty": str(order.quantity),
            "type": order.order_type,
            "time_in_force": order.time_in_force,
        }
        if order.limit_price is not None:
            payload["limit_price"] = str(order.limit_price)
        if order.stop_price is not None:
            payload["stop_price"] = str(order.stop_price)
        resp = self._client.place_order(payload)
        price = order.market_price or order.limit_price or order.stop_price or 0.0
        return Fill(
            order_id=str(resp.get("id") or resp.get("order_id") or uuid.uuid4()),
            symbol=order.symbol,
            side=order.side,
            quantity=order.quantity,
            price=price,
            fee=0.0,
            slippage_bps=0.0,
            spread_bps=0.0,
            latency_ms=0,
            filled_at=utc_now(),
            assumptions={"source": "alpaca"},
        )

    def cancel_order(self, order_id: str) -> dict[str, Any]:
        return self._client.cancel_order(order_id)

    def get_open_orders(self) -> list[dict[str, Any]]:
        return []
