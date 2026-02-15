from typing import Any

from ..core.backtest import run_backtest as core_run_backtest
from ..core.models import Bar, utc_now
from ..core.strategy import registry


def _bars_from_payload(data: list[dict[str, Any]], symbol: str, timeframe: str) -> list[Bar]:
    bars: list[Bar] = []
    for row in data:
        bars.append(
            Bar.from_dict(
                {
                    **row,
                    "symbol": row.get("symbol") or symbol,
                    "timeframe": row.get("timeframe") or timeframe,
                    "fetched_at": row.get("fetched_at") or utc_now().isoformat(),
                }
            )
        )
    return bars


def run_backtest(strategy_spec: dict[str, Any], data: list[dict[str, Any]]) -> dict[str, Any]:
    name = strategy_spec.get("name") or "volatility_momentum"
    timeframe = strategy_spec.get("timeframe") or "1h"
    symbol = strategy_spec.get("symbol") or "UNKNOWN"
    params = strategy_spec.get("params") or {}
    try:
        strategy = registry.create(name, **params)
        bars = _bars_from_payload(data, symbol, timeframe)
        result = core_run_backtest(strategy, bars)
        return {
            "status": "ok",
            "strategy": name,
            "metrics": result.metrics,
            "trades": result.trades,
        }
    except Exception as exc:
        return {
            "status": "stub",
            "strategy": name,
            "trades": [],
            "note": f"Backtest fallback: {exc}",
        }
