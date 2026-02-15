from __future__ import annotations

from dataclasses import dataclass
from pathlib import Path
from typing import Any, Iterable, Callable
import csv
import itertools
import json
import uuid

from .config import ExecutionConfig, RiskConfig
from .execution import ExecutionSimulator
from .metrics import (
    cagr,
    sharpe,
    sortino,
    calmar,
    max_drawdown,
    time_under_water,
    win_rate,
    profit_factor,
    expectancy,
)
from .models import Bar, OrderRequest
from .risk import RiskEngine
from .strategy.base import Strategy
from .brokers.paper import PaperBroker
from .validation import ensure_time_ordered, ensure_timezone_consistent

_PERIODS_PER_YEAR = {
    "1m": 252 * 6 * 60,
    "5m": 252 * 6 * 12,
    "15m": 252 * 6 * 4,
    "1h": 252 * 6,
    "4h": 252 * 2,
    "1d": 252,
}


@dataclass
class BacktestResult:
    metrics: dict[str, Any]
    equity_curve: list[float]
    trades: list[dict[str, Any]]


def run_backtest(
    strategy: Strategy,
    bars: list[Bar],
    initial_cash: float = 100_000.0,
    execution: ExecutionConfig | None = None,
    risk: RiskConfig | None = None,
) -> BacktestResult:
    ensure_time_ordered(bars)
    ensure_timezone_consistent(bars)
    if not bars:
        return BacktestResult(metrics={}, equity_curve=[], trades=[])

    execution = execution or ExecutionConfig()
    risk = risk or RiskConfig()
    simulator = ExecutionSimulator(execution)
    broker = PaperBroker(simulator, initial_cash=initial_cash)
    risk_engine = RiskEngine(risk)

    equity_curve: list[float] = []
    trades: list[dict[str, Any]] = []

    min_history = max(strategy.min_history, 2)
    for idx in range(min_history, len(bars)):
        history = bars[: idx + 1]
        latest = history[-1]
        signals = strategy.generate_signals(history)
        for signal in signals:
            if signal.side == "flat":
                continue
            portfolio = broker.snapshot()
            notional = strategy.position_sizing(signal, portfolio.equity)
            if notional <= 0:
                continue
            qty = notional / max(latest.close, 1e-6)
            order = OrderRequest(
                symbol=signal.symbol,
                side="buy" if signal.side == "long" else "sell",
                quantity=qty,
                order_type="market",
                market_price=latest.close,
                strategy_name=strategy.name,
                meta=signal.meta,
            )
            decision = risk_engine.evaluate_order(order, portfolio, latest.close)
            if decision.decision == "deny":
                continue
            if decision.decision == "reduce" and decision.adjusted_quantity is not None:
                order = OrderRequest(
                    symbol=order.symbol,
                    side=order.side,
                    quantity=decision.adjusted_quantity,
                    order_type=order.order_type,
                    market_price=order.market_price,
                    strategy_name=order.strategy_name,
                )
            fill = broker.place_order(order)
            trades.append(fill.to_dict())
        account = broker.get_account()
        equity_curve.append(float(account.get("equity", 0.0)))

    returns = [
        (equity_curve[i] / equity_curve[i - 1] - 1.0)
        for i in range(1, len(equity_curve))
        if equity_curve[i - 1] != 0
    ]
    periods = _PERIODS_PER_YEAR.get(bars[0].timeframe, 252)
    metrics = {
        "cagr": cagr(equity_curve, periods),
        "sharpe": sharpe(returns, periods),
        "sortino": sortino(returns, periods),
        "calmar": calmar(equity_curve, periods),
        "max_drawdown": max_drawdown(equity_curve),
        "time_under_water": time_under_water(equity_curve),
        "win_rate": win_rate(returns),
        "profit_factor": profit_factor(returns),
        "expectancy": expectancy(returns),
    }
    return BacktestResult(metrics=metrics, equity_curve=equity_curve, trades=trades)


def save_backtest_artifacts(base_dir: str, run_id: str, result: BacktestResult, config: dict[str, Any]) -> None:
    run_dir = Path(base_dir) / run_id
    run_dir.mkdir(parents=True, exist_ok=True)
    (run_dir / "config.json").write_text(json.dumps(config, indent=2), encoding="utf-8")
    (run_dir / "metrics.json").write_text(json.dumps(result.metrics, indent=2), encoding="utf-8")
    (run_dir / "equity_curve.json").write_text(json.dumps(result.equity_curve, indent=2), encoding="utf-8")
    trades_path = run_dir / "trades.csv"
    if result.trades:
        fieldnames = sorted({key for trade in result.trades for key in trade.keys()})
        with trades_path.open("w", newline="", encoding="utf-8") as handle:
            writer = csv.DictWriter(handle, fieldnames=fieldnames)
            writer.writeheader()
            writer.writerows(result.trades)


def _expand_grid(param_grid: dict[str, Iterable[Any]]) -> list[dict[str, Any]]:
    if not param_grid:
        return [{}]
    keys = list(param_grid.keys())
    values = [list(param_grid[k]) for k in keys]
    combos = []
    for combo in itertools.product(*values):
        combos.append({k: v for k, v in zip(keys, combo)})
    return combos


def run_grid_search(
    strategy_factory: Callable[..., Strategy],
    bars: list[Bar],
    param_grid: dict[str, Iterable[Any]],
    base_dir: str | None = None,
    objective: str = "sharpe",
) -> dict[str, Any]:
    results: list[dict[str, Any]] = []
    run_id = str(uuid.uuid4())
    for params in _expand_grid(param_grid):
        strategy = strategy_factory(**params)
        result = run_backtest(strategy, bars)
        results.append({"params": params, "metrics": result.metrics})
    best = max(results, key=lambda item: item["metrics"].get(objective, 0.0)) if results else None
    payload = {"run_id": run_id, "objective": objective, "results": results, "best": best}
    if base_dir:
        run_dir = Path(base_dir) / run_id
        run_dir.mkdir(parents=True, exist_ok=True)
        (run_dir / "grid_results.json").write_text(json.dumps(payload, indent=2), encoding="utf-8")
        if best:
            (run_dir / "best.json").write_text(json.dumps(best, indent=2), encoding="utf-8")
    return payload
