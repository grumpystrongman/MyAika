from __future__ import annotations

from dataclasses import dataclass
from typing import Any

from ..metrics import cagr, sharpe, max_drawdown
from ..models import Bar
from .analytics import bs_price


@dataclass
class OptionsBacktestResult:
    metrics: dict[str, Any]
    equity_curve: list[float]
    trades: list[dict[str, Any]]


def _realized_vol(bars: list[Bar], lookback: int = 20) -> float:
    if len(bars) < lookback + 1:
        return 0.3
    returns = []
    for idx in range(-lookback, 0):
        prev = bars[idx - 1].close
        curr = bars[idx].close
        if prev == 0:
            continue
        returns.append(curr / prev - 1)
    if not returns:
        return 0.3
    mean = sum(returns) / len(returns)
    var = sum((r - mean) ** 2 for r in returns) / len(returns)
    daily_vol = var ** 0.5
    return max(0.05, daily_vol * (252 ** 0.5))


def _metrics(equity_curve: list[float], periods_per_year: int = 12) -> dict[str, Any]:
    if len(equity_curve) < 2:
        return {"cagr": 0.0, "sharpe": 0.0, "max_drawdown": 0.0}
    returns = [
        (equity_curve[i] / equity_curve[i - 1] - 1.0)
        for i in range(1, len(equity_curve))
        if equity_curve[i - 1] != 0
    ]
    return {
        "cagr": cagr(equity_curve, periods_per_year),
        "sharpe": sharpe(returns, periods_per_year),
        "max_drawdown": max_drawdown(equity_curve),
    }


def backtest_wheel(
    bars: list[Bar],
    initial_cash: float = 10_000.0,
    hold_days: int = 30,
    put_otm_pct: float = 0.05,
    call_otm_pct: float = 0.05,
    lookback: int = 20,
    rate: float = 0.02,
) -> OptionsBacktestResult:
    cash = initial_cash
    shares = 0
    equity_curve: list[float] = []
    trades: list[dict[str, Any]] = []
    for idx in range(max(lookback, 1), len(bars) - hold_days, hold_days):
        entry = bars[idx]
        expiry = bars[idx + hold_days]
        spot = entry.close
        exp_price = expiry.close
        vol = _realized_vol(bars[:idx], lookback)
        t = hold_days / 365
        if shares == 0:
            strike = spot * (1 - put_otm_pct)
            premium = bs_price(spot, strike, t, rate, vol, "put")
            cash += premium * 100
            assigned = exp_price < strike
            if assigned:
                cash -= strike * 100
                shares = 100
            trades.append({
                "type": "wheel_put",
                "entry": entry.ts.isoformat(),
                "expiry": expiry.ts.isoformat(),
                "spot": spot,
                "strike": strike,
                "premium": premium,
                "assigned": assigned,
            })
        else:
            strike = spot * (1 + call_otm_pct)
            premium = bs_price(spot, strike, t, rate, vol, "call")
            cash += premium * 100
            called = exp_price > strike
            if called:
                cash += strike * 100
                shares = 0
            trades.append({
                "type": "wheel_call",
                "entry": entry.ts.isoformat(),
                "expiry": expiry.ts.isoformat(),
                "spot": spot,
                "strike": strike,
                "premium": premium,
                "called": called,
            })
        equity_curve.append(cash + shares * exp_price)
    return OptionsBacktestResult(metrics=_metrics(equity_curve), equity_curve=equity_curve, trades=trades)


def backtest_covered_call(
    bars: list[Bar],
    initial_cash: float = 10_000.0,
    hold_days: int = 30,
    call_otm_pct: float = 0.05,
    lookback: int = 20,
    rate: float = 0.02,
) -> OptionsBacktestResult:
    if not bars:
        return OptionsBacktestResult(metrics={}, equity_curve=[], trades=[])
    spot0 = bars[0].close
    if initial_cash < spot0 * 100:
        raise RuntimeError("insufficient_cash_for_covered_call")
    cash = initial_cash - spot0 * 100
    shares = 100
    equity_curve: list[float] = []
    trades: list[dict[str, Any]] = []
    for idx in range(max(lookback, 1), len(bars) - hold_days, hold_days):
        entry = bars[idx]
        expiry = bars[idx + hold_days]
        spot = entry.close
        exp_price = expiry.close
        vol = _realized_vol(bars[:idx], lookback)
        t = hold_days / 365
        strike = spot * (1 + call_otm_pct)
        premium = bs_price(spot, strike, t, rate, vol, "call")
        cash += premium * 100
        called = exp_price > strike
        if called:
            cash += strike * 100
            cash -= exp_price * 100
        trades.append({
            "type": "covered_call",
            "entry": entry.ts.isoformat(),
            "expiry": expiry.ts.isoformat(),
            "spot": spot,
            "strike": strike,
            "premium": premium,
            "called": called,
        })
        equity_curve.append(cash + shares * exp_price)
    return OptionsBacktestResult(metrics=_metrics(equity_curve), equity_curve=equity_curve, trades=trades)


def backtest_vertical(
    bars: list[Bar],
    initial_cash: float = 10_000.0,
    hold_days: int = 30,
    long_pct: float = 0.0,
    short_pct: float = 0.05,
    lookback: int = 20,
    rate: float = 0.02,
    option_type: str = "call",
) -> OptionsBacktestResult:
    cash = initial_cash
    equity_curve: list[float] = []
    trades: list[dict[str, Any]] = []
    for idx in range(max(lookback, 1), len(bars) - hold_days, hold_days):
        entry = bars[idx]
        expiry = bars[idx + hold_days]
        spot = entry.close
        exp_price = expiry.close
        vol = _realized_vol(bars[:idx], lookback)
        t = hold_days / 365
        long_strike = spot * (1 + long_pct)
        short_strike = spot * (1 + short_pct)
        long_price = bs_price(spot, long_strike, t, rate, vol, option_type)
        short_price = bs_price(spot, short_strike, t, rate, vol, option_type)
        net_debit = long_price - short_price
        if cash < net_debit * 100:
            continue
        cash -= net_debit * 100
        if option_type == "call":
            payoff = min(max(exp_price - long_strike, 0), short_strike - long_strike)
        else:
            payoff = min(max(long_strike - exp_price, 0), long_strike - short_strike)
        cash += payoff * 100
        trades.append({
            "type": f"vertical_{option_type}",
            "entry": entry.ts.isoformat(),
            "expiry": expiry.ts.isoformat(),
            "spot": spot,
            "long_strike": long_strike,
            "short_strike": short_strike,
            "net_debit": net_debit,
        })
        equity_curve.append(cash)
    return OptionsBacktestResult(metrics=_metrics(equity_curve), equity_curve=equity_curve, trades=trades)
