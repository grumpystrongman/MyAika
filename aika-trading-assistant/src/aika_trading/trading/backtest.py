from typing import Any


def run_backtest(strategy_spec: dict[str, Any], data: list[dict[str, Any]]) -> dict[str, Any]:
    return {
        "status": "stub",
        "strategy": strategy_spec.get("name"),
        "trades": [],
        "note": "Backtest harness stub; plug in a framework like backtrader or vectorbt."
    }
