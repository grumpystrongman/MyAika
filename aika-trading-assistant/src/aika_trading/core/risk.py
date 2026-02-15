from __future__ import annotations

from dataclasses import dataclass

from .config import RiskConfig
from .models import OrderRequest, PortfolioState, RiskDecision


@dataclass
class RiskEngine:
    limits: RiskConfig

    def evaluate_order(self, order: OrderRequest, portfolio: PortfolioState, market_price: float) -> RiskDecision:
        risk_flags: list[str] = []
        notional = market_price * order.quantity
        if portfolio.equity <= 0:
            return RiskDecision("deny", "no_equity", 0.0, ["equity_zero"])

        max_value = self.limits.max_position_value
        adjusted_qty = order.quantity
        if abs(notional) > max_value:
            adjusted_qty = max_value / max(market_price, 1e-6)
            risk_flags.append("position_value_capped")

        corr = order.meta.get("correlation") if hasattr(order, "meta") else None
        if corr is not None and corr > self.limits.correlation_cap:
            return RiskDecision("deny", "correlation_cap", None, risk_flags + ["correlation_cap"])

        signal_vol = None
        if hasattr(order, "meta"):
            signal_vol = order.meta.get("vol") or order.meta.get("signal_vol") or order.meta.get("atr")
        if signal_vol and self.limits.vol_target > 0:
            scale = min(1.0, self.limits.vol_target / max(float(signal_vol), 1e-6))
            if scale < 1.0:
                adjusted_qty *= scale
                risk_flags.append("vol_target")

        projected_gross = portfolio.gross_exposure + abs(market_price * adjusted_qty)
        projected_leverage = projected_gross / max(portfolio.equity, 1e-6)
        if projected_leverage > self.limits.max_leverage:
            risk_flags.append("leverage_capped")
            if portfolio.gross_exposure >= self.limits.max_leverage * portfolio.equity:
                return RiskDecision("deny", "max_leverage", None, risk_flags)
            allowed = (self.limits.max_leverage * portfolio.equity) - portfolio.gross_exposure
            adjusted_qty = max(0.0, allowed / max(market_price, 1e-6))

        if portfolio.drawdown >= self.limits.max_drawdown:
            return RiskDecision("deny", "max_drawdown", None, risk_flags + ["drawdown_guard"])

        if portfolio.loss_streak >= self.limits.max_loss_streak:
            return RiskDecision("deny", "loss_streak", None, risk_flags + ["loss_streak_guard"])

        if adjusted_qty != order.quantity:
            return RiskDecision("reduce", "risk_adjusted", adjusted_qty, risk_flags)

        return RiskDecision("allow", "ok", None, risk_flags)
