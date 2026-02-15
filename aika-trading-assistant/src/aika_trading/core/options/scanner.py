from __future__ import annotations

from typing import Any

from .models import OptionContract


def _iv_rank(contracts: list[OptionContract]) -> dict[str, float]:
    ivs = [c.iv for c in contracts if c.iv is not None]
    if not ivs:
        return {}
    min_iv = min(ivs)
    max_iv = max(ivs)
    ranks: dict[str, float] = {}
    for c in contracts:
        if c.iv is None:
            ranks[c.symbol] = 0.0
        elif max_iv == min_iv:
            ranks[c.symbol] = 0.5
        else:
            ranks[c.symbol] = (c.iv - min_iv) / (max_iv - min_iv)
    return ranks


def scan_contracts(
    contracts: list[OptionContract],
    filters: dict[str, Any] | None = None,
) -> list[dict[str, Any]]:
    filters = filters or {}
    option_type = filters.get("option_type")
    side = filters.get("side") or "short"
    min_delta = filters.get("min_delta")
    max_delta = filters.get("max_delta")
    use_abs = filters.get("abs_delta", True)
    min_iv_rank = filters.get("min_iv_rank")
    min_iv_rank_hist = filters.get("min_iv_rank_hist")
    min_pop = filters.get("min_pop")
    ranks = _iv_rank(contracts)

    results: list[dict[str, Any]] = []
    for contract in contracts:
        if option_type and contract.option_type != option_type:
            continue
        greeks = contract.greeks or {}
        delta = float(greeks.get("delta") or 0.0)
        prob_itm = float(greeks.get("prob_itm") or 0.0)
        delta_val = abs(delta) if use_abs else delta
        if min_delta is not None and delta_val < float(min_delta):
            continue
        if max_delta is not None and delta_val > float(max_delta):
            continue
        iv_rank = ranks.get(contract.symbol, 0.0)
        if min_iv_rank is not None and iv_rank < float(min_iv_rank):
            continue
        iv_rank_hist = float((greeks.get("iv_rank_hist") or 0.0))
        if min_iv_rank_hist is not None and iv_rank_hist < float(min_iv_rank_hist):
            continue
        pop = (1 - prob_itm) if side == "short" else prob_itm
        if min_pop is not None and pop < float(min_pop):
            continue
        results.append({
            "symbol": contract.symbol,
            "underlying": contract.underlying,
            "expiration": contract.expiration.isoformat(),
            "strike": contract.strike,
            "option_type": contract.option_type,
            "bid": contract.bid,
            "ask": contract.ask,
            "iv": contract.iv,
            "iv_rank": iv_rank,
            "iv_rank_hist": iv_rank_hist,
            "delta": delta,
            "prob_itm": prob_itm,
            "pop": pop,
        })
    results.sort(key=lambda item: item.get("iv_rank", 0), reverse=True)
    return results
