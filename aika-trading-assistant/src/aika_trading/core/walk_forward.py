from __future__ import annotations

from typing import Any, Callable
from pathlib import Path
import json

from .backtest import run_backtest
from .models import Bar
from .strategy.base import Strategy


def walk_forward(
    bars: list[Bar],
    strategy_factory: Callable[[], Strategy],
    train_window: int,
    test_window: int,
    step: int | None = None,
) -> list[dict[str, Any]]:
    results: list[dict[str, Any]] = []
    if not bars:
        return results
    step = step or test_window
    for start in range(0, len(bars) - train_window - test_window + 1, step):
        train_slice = bars[start : start + train_window]
        test_slice = bars[start + train_window : start + train_window + test_window]
        strategy = strategy_factory()
        result = run_backtest(strategy, test_slice)
        results.append(
            {
                "train_start": train_slice[0].ts.isoformat(),
                "train_end": train_slice[-1].ts.isoformat(),
                "test_start": test_slice[0].ts.isoformat(),
                "test_end": test_slice[-1].ts.isoformat(),
                "metrics": result.metrics,
                "equity_curve": result.equity_curve,
            }
        )
    return results


def save_walk_forward_artifacts(base_dir: str, run_id: str, results: list[dict[str, Any]], config: dict) -> None:
    run_dir = Path(base_dir) / run_id
    run_dir.mkdir(parents=True, exist_ok=True)
    (run_dir / "config.json").write_text(json.dumps(config, indent=2), encoding="utf-8")
    (run_dir / "walk_forward.json").write_text(json.dumps(results, indent=2), encoding="utf-8")
