from __future__ import annotations

import math
from statistics import mean, pstdev


def max_drawdown(equity_curve: list[float]) -> float:
    if not equity_curve:
        return 0.0
    peak = equity_curve[0]
    max_dd = 0.0
    for value in equity_curve:
        peak = max(peak, value)
        if peak == 0:
            continue
        dd = (peak - value) / peak
        max_dd = max(max_dd, dd)
    return max_dd


def time_under_water(equity_curve: list[float]) -> int:
    peak = -math.inf
    current = 0
    longest = 0
    for value in equity_curve:
        if value >= peak:
            peak = value
            current = 0
        else:
            current += 1
            longest = max(longest, current)
    return longest


def cagr(equity_curve: list[float], periods_per_year: int) -> float:
    if len(equity_curve) < 2:
        return 0.0
    total_return = equity_curve[-1] / equity_curve[0] - 1.0
    years = len(equity_curve) / max(periods_per_year, 1)
    if years <= 0:
        return 0.0
    return (1 + total_return) ** (1 / years) - 1.0


def sharpe(returns: list[float], periods_per_year: int) -> float:
    if len(returns) < 2:
        return 0.0
    avg = mean(returns)
    std = pstdev(returns)
    if std == 0:
        return 0.0
    return (avg / std) * math.sqrt(periods_per_year)


def sortino(returns: list[float], periods_per_year: int) -> float:
    if len(returns) < 2:
        return 0.0
    avg = mean(returns)
    downside = [r for r in returns if r < 0]
    if not downside:
        return 0.0
    std = pstdev(downside)
    if std == 0:
        return 0.0
    return (avg / std) * math.sqrt(periods_per_year)


def calmar(equity_curve: list[float], periods_per_year: int) -> float:
    dd = max_drawdown(equity_curve)
    if dd == 0:
        return 0.0
    return cagr(equity_curve, periods_per_year) / dd


def win_rate(trade_returns: list[float]) -> float:
    if not trade_returns:
        return 0.0
    wins = len([r for r in trade_returns if r > 0])
    return wins / len(trade_returns)


def profit_factor(trade_returns: list[float]) -> float:
    gains = sum(r for r in trade_returns if r > 0)
    losses = -sum(r for r in trade_returns if r < 0)
    if losses == 0:
        return 0.0
    return gains / losses


def expectancy(trade_returns: list[float]) -> float:
    if not trade_returns:
        return 0.0
    return mean(trade_returns)


def monte_carlo_resample(returns: list[float], trials: int = 200) -> list[float]:
    if not returns:
        return []
    rng = [returns[i % len(returns)] for i in range(len(returns))]
    results = []
    for t in range(trials):
        total = 1.0
        for r in rng:
            total *= (1 + r)
        results.append(total - 1.0)
    return results
