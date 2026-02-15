from __future__ import annotations

import json
import random
import uuid
from datetime import datetime
from pathlib import Path
from typing import Any

from .config import CoreSettings, ensure_dirs
from .data import load_bars
from .execution import ExecutionSimulator
from .models import OrderRequest, RunSummary, utc_now
from .backtest import run_backtest as core_run_backtest
from .regime import compute_regime_labels
from .ensemble import EnsembleEngine
from .risk import RiskEngine
from .storage import RunStore
from .strategy import registry
from .validation import ensure_time_ordered
from .brokers.paper import PaperBroker


def _save_artifact(base_dir: str, run_id: str, name: str, payload: Any) -> None:
    run_dir = Path(base_dir) / run_id
    run_dir.mkdir(parents=True, exist_ok=True)
    path = run_dir / name
    with path.open("w", encoding="utf-8") as handle:
        json.dump(payload, handle, indent=2)


def run_paper_session(settings: CoreSettings, symbols: list[str] | None = None) -> dict[str, Any]:
    ensure_dirs(settings)
    settings.ensure_live_confirmed()

    random.seed(settings.run.seed)
    run_id = settings.run.run_id or str(uuid.uuid4())
    if isinstance(symbols, str):
        symbols = [s.strip() for s in symbols.split(",") if s.strip()]
    symbols = symbols or settings.data.symbols

    simulator = ExecutionSimulator(settings.execution)
    broker = PaperBroker(simulator, initial_cash=settings.broker.paper_initial_cash)
    risk_engine = RiskEngine(settings.risk)
    store = RunStore(str(Path(settings.run.artifacts_dir) / "runs.sqlite"))

    started_at = utc_now()
    risk_flags: list[str] = []
    fills: list[dict[str, Any]] = []
    errors: list[str] = []
    equity_curve: list[float] = []
    drawdown_curve: list[float] = []
    regime_labels: list[str] = []
    ensemble_weights: dict[str, float] = {}
    backtest_metrics: dict[str, Any] = {}

    for symbol in symbols:
        bars: list[Any] = []
        try:
            bars = load_bars(
                settings,
                symbol,
                settings.data.timeframe,
                limit=max(120, settings.run.lookback + 5),
            )
        except Exception as exc:
            errors.append(f"{symbol}: {exc}")
            continue
        if not bars:
            continue
        ensure_time_ordered(bars)
        strategy = registry.create(settings.run.strategy, lookback=settings.run.lookback)
        if not equity_curve:
            try:
                backtest = core_run_backtest(strategy, bars, initial_cash=settings.broker.paper_initial_cash)
                equity_curve = backtest.equity_curve
                backtest_metrics = backtest.metrics
                peak = 0.0
                for value in equity_curve:
                    peak = max(peak, value)
                    drawdown_curve.append((peak - value) / peak if peak else 0.0)
            except Exception as exc:
                errors.append(f"{symbol}: backtest_failed:{exc}")
        if not regime_labels:
            try:
                regime_labels = compute_regime_labels(bars)
            except Exception as exc:
                errors.append(f"{symbol}: regime_failed:{exc}")
        signals = strategy.generate_signals(bars)
        if not signals:
            continue
        signal = signals[-1]
        store.record_signal(run_id, signal)
        if not ensemble_weights:
            ensemble_weights = EnsembleEngine().weight_by_performance({strategy.name: signal.strength})
        if signal.side == "flat":
            continue
        latest = bars[-1]
        portfolio = broker.snapshot()
        notional = strategy.position_sizing(signal, portfolio.equity)
        qty = notional / max(latest.close, 1e-6)
        order = OrderRequest(
            symbol=symbol,
            side="buy" if signal.side == "long" else "sell",
            quantity=qty,
            order_type="market",
            market_price=latest.close,
            strategy_name=strategy.name,
            client_order_id=str(uuid.uuid4()),
            meta=signal.meta,
        )
        decision = risk_engine.evaluate_order(order, portfolio, latest.close)
        if decision.risk_flags:
            risk_flags.extend(decision.risk_flags)
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
                client_order_id=order.client_order_id,
            )
        store.record_order(run_id, order)
        fill = broker.place_order(order)
        store.record_fill(run_id, fill)
        fills.append(fill.to_dict())

    account = broker.get_account()
    summary = RunSummary(
        run_id=run_id,
        mode=settings.mode,
        status="completed",
        started_at=started_at,
        completed_at=utc_now(),
        strategy=settings.run.strategy,
        symbols=symbols,
        equity=float(account.get("equity", 0.0)),
        cash=float(account.get("cash", 0.0)),
        exposure=float(account.get("equity", 0.0)) - float(account.get("cash", 0.0)),
        risk_flags=sorted(set(risk_flags)),
        metrics={"backtest": backtest_metrics, "errors": errors} if errors or backtest_metrics else {},
        equity_curve=equity_curve,
        drawdown_curve=drawdown_curve,
        regime_labels=regime_labels,
        ensemble_weights=ensemble_weights or {settings.run.strategy: 1.0},
    )

    store.record_run(summary, settings.model_dump())

    _save_artifact(settings.run.artifacts_dir, run_id, "config.json", settings.model_dump())
    _save_artifact(settings.run.artifacts_dir, run_id, "summary.json", summary.to_dict())
    _save_artifact(settings.run.artifacts_dir, run_id, "fills.json", fills)

    return {"run": summary.to_dict(), "fills": fills}
