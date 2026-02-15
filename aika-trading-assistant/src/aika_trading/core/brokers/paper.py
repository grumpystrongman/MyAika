from __future__ import annotations

from typing import Any

from ..execution import ExecutionSimulator
from ..models import Fill, OrderRequest, PortfolioState, Position
from .base import Broker


class PaperBroker(Broker):
    name = "paper"

    def __init__(self, simulator: ExecutionSimulator, initial_cash: float = 100_000.0) -> None:
        self._simulator = simulator
        self._cash = initial_cash
        self._positions: dict[str, Position] = {}
        self._open_orders: list[dict[str, Any]] = []

    def get_account(self) -> dict[str, Any]:
        equity = self._cash + sum(pos.market_value() for pos in self._positions.values())
        return {"cash": self._cash, "equity": equity}

    def get_positions(self) -> list[dict[str, Any]]:
        return [
            {
                "symbol": pos.symbol,
                "quantity": pos.quantity,
                "avg_price": pos.avg_price,
                "market_price": pos.market_price,
                "market_value": pos.market_value(),
            }
            for pos in self._positions.values()
        ]

    def place_order(self, order: OrderRequest) -> Fill:
        price = order.market_price or order.limit_price or order.stop_price
        if price is None:
            raise RuntimeError("market_price_required_for_paper")
        fill, _log = self._simulator.simulate_fill(order, price)
        signed_qty = fill.quantity if fill.side == "buy" else -fill.quantity
        cost = fill.price * fill.quantity + fill.fee
        if fill.side == "sell":
            self._cash += fill.price * fill.quantity - fill.fee
        else:
            self._cash -= cost
        position = self._positions.get(fill.symbol)
        if position:
            new_qty = position.quantity + signed_qty
            if new_qty == 0:
                self._positions.pop(fill.symbol)
            else:
                if (position.quantity > 0 and signed_qty > 0) or (position.quantity < 0 and signed_qty < 0):
                    position.avg_price = (position.avg_price * position.quantity + fill.price * signed_qty) / new_qty
                elif (position.quantity > 0 and new_qty > 0) or (position.quantity < 0 and new_qty < 0):
                    position.avg_price = position.avg_price
                else:
                    position.avg_price = fill.price
                position.quantity = new_qty
                position.market_price = fill.price
        else:
            self._positions[fill.symbol] = Position(
                symbol=fill.symbol,
                quantity=signed_qty,
                avg_price=fill.price,
                market_price=fill.price,
            )
        return fill

    def cancel_order(self, order_id: str) -> dict[str, Any]:
        self._open_orders = [o for o in self._open_orders if o.get("id") != order_id]
        return {"status": "cancelled", "order_id": order_id}

    def get_open_orders(self) -> list[dict[str, Any]]:
        return list(self._open_orders)

    def snapshot(self) -> PortfolioState:
        account = self.get_account()
        equity = float(account.get("equity", 0.0))
        gross = sum(abs(pos.market_value()) for pos in self._positions.values())
        net = sum(pos.market_value() for pos in self._positions.values())
        return PortfolioState(
            cash=float(account.get("cash", 0.0)),
            equity=equity,
            positions=self._positions,
            gross_exposure=gross,
            net_exposure=net,
            peak_equity=max(equity, equity),
            drawdown=0.0,
            loss_streak=0,
        )
