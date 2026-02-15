from __future__ import annotations

from dataclasses import dataclass
from typing import Any


def payoff_at_expiry(legs: list[dict[str, Any]], price: float) -> float:
    total = 0.0
    for leg in legs:
        if leg.get("instrument") == "stock" or leg.get("option_type") == "stock":
            qty = float(leg.get("quantity", 1))
            entry = float(leg.get("entry", 0.0))
            side = leg.get("side", "long")
            pnl = (price - entry) * qty
            if side == "short":
                pnl = -pnl
            total += pnl
            continue
        option_type = leg.get("option_type")
        strike = float(leg.get("strike"))
        qty = float(leg.get("quantity", 1))
        premium = float(leg.get("premium", 0.0))
        side = leg.get("side", "long")
        if option_type == "call":
            intrinsic = max(0.0, price - strike)
        else:
            intrinsic = max(0.0, strike - price)
        pnl = intrinsic - premium
        if side == "short":
            pnl = -pnl
        total += pnl * qty * float(leg.get("multiplier", 100))
    return total


def payoff_curve(legs: list[dict[str, Any]], min_price: float, max_price: float, steps: int = 40) -> list[dict[str, float]]:
    if steps <= 1:
        steps = 2
    results = []
    step = (max_price - min_price) / (steps - 1)
    for idx in range(steps):
        price = min_price + step * idx
        results.append({"price": price, "pnl": payoff_at_expiry(legs, price)})
    return results


@dataclass
class StrategyOutcome:
    max_profit: float | None
    max_loss: float | None
    breakevens: list[float]
    notes: str = ""

    def to_dict(self) -> dict[str, Any]:
        return {
            "max_profit": self.max_profit,
            "max_loss": self.max_loss,
            "breakevens": self.breakevens,
            "notes": self.notes,
        }


def covered_call(spot: float, strike: float, premium: float) -> StrategyOutcome:
    max_profit = (strike - spot + premium) * 100
    max_loss = (spot - premium) * 100
    breakeven = spot - premium
    return StrategyOutcome(max_profit=max_profit, max_loss=max_loss, breakevens=[breakeven], notes="Covered call")


def cash_secured_put(strike: float, premium: float) -> StrategyOutcome:
    max_profit = premium * 100
    max_loss = (strike - premium) * 100
    breakeven = strike - premium
    return StrategyOutcome(max_profit=max_profit, max_loss=max_loss, breakevens=[breakeven], notes="Cash-secured put")


def bull_call_spread(long_strike: float, long_premium: float, short_strike: float, short_premium: float) -> StrategyOutcome:
    net_debit = long_premium - short_premium
    max_profit = (short_strike - long_strike - net_debit) * 100
    max_loss = net_debit * 100
    breakeven = long_strike + net_debit
    return StrategyOutcome(max_profit=max_profit, max_loss=max_loss, breakevens=[breakeven], notes="Bull call spread")


def bear_put_spread(long_strike: float, long_premium: float, short_strike: float, short_premium: float) -> StrategyOutcome:
    net_debit = long_premium - short_premium
    max_profit = (long_strike - short_strike - net_debit) * 100
    max_loss = net_debit * 100
    breakeven = long_strike - net_debit
    return StrategyOutcome(max_profit=max_profit, max_loss=max_loss, breakevens=[breakeven], notes="Bear put spread")


def iron_condor(
    short_put_strike: float,
    short_put_premium: float,
    long_put_strike: float,
    long_put_premium: float,
    short_call_strike: float,
    short_call_premium: float,
    long_call_strike: float,
    long_call_premium: float,
) -> StrategyOutcome:
    net_credit = (short_put_premium + short_call_premium) - (long_put_premium + long_call_premium)
    max_loss = max(
        (short_put_strike - long_put_strike - net_credit) * 100,
        (long_call_strike - short_call_strike - net_credit) * 100,
    )
    max_profit = net_credit * 100
    breakevens = [short_put_strike - net_credit, short_call_strike + net_credit]
    return StrategyOutcome(max_profit=max_profit, max_loss=max_loss, breakevens=breakevens, notes="Iron condor")
