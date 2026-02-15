from __future__ import annotations

from fastapi import APIRouter, HTTPException

from ...core.config import CoreSettings
from ...core.runner import run_paper_session
from ...core.storage import RunStore
from ...core.data import load_bars
from ...core.strategy import registry
from ...core.backtest import run_backtest, run_grid_search, save_backtest_artifacts
from ...core.walk_forward import walk_forward, save_walk_forward_artifacts
from ...core.options import (
    resolve_options_provider,
    bs_price,
    bs_greeks,
    bs_stats,
    implied_vol,
    payoff_curve,
    covered_call,
    cash_secured_put,
    bull_call_spread,
    bear_put_spread,
    iron_condor,
    backtest_wheel,
    backtest_covered_call,
    backtest_vertical,
    scan_contracts,
    OptionIVHistoryStore,
)
from datetime import date
from pathlib import Path
import csv
import json
import uuid

router = APIRouter(prefix="/core", tags=["core"])


def _parse_date(value: str | None) -> date | None:
    if not value:
        return None
    try:
        return date.fromisoformat(value)
    except Exception:
        return None


def _enrich_chain(settings: CoreSettings, symbol: str, provider_name: str, limit: int, rate: float):
    provider = resolve_options_provider(settings, provider_name)
    chain = provider.get_chain(symbol, limit=limit)
    bars = load_bars(settings, symbol, settings.data.timeframe, limit=30)
    spot = bars[-1].close if bars else chain.underlying_price or 100.0
    today = date.today()
    for contract in chain.contracts:
        t = max(1, (contract.expiration - today).days) / 365.0
        mid = None
        if contract.bid is not None and contract.ask is not None:
            mid = (contract.bid + contract.ask) / 2
        if contract.iv is None:
            if mid is not None:
                contract_iv = implied_vol(mid, spot, contract.strike, t, rate, contract.option_type)
            else:
                contract_iv = 0.3
            contract_iv = max(1e-4, min(contract_iv, 3.0))
            contract_price = bs_price(spot, contract.strike, t, rate, contract_iv, contract.option_type)
            greeks = bs_greeks(spot, contract.strike, t, rate, contract_iv, contract.option_type)
            stats = bs_stats(spot, contract.strike, t, rate, contract_iv, contract.option_type)
            contract.greeks = {**greeks, **stats}
            contract.bid = contract.bid or max(contract_price - 0.05, 0.01)
            contract.ask = contract.ask or (contract_price + 0.05)
            contract.last = contract.last or contract_price
            contract.iv = contract_iv
        else:
            greeks = bs_greeks(spot, contract.strike, t, rate, contract.iv, contract.option_type)
            stats = bs_stats(spot, contract.strike, t, rate, contract.iv, contract.option_type)
            contract.greeks = {**greeks, **stats}
    return spot, chain.contracts


def _attach_iv_ranks(
    contracts: list,
    store: OptionIVHistoryStore,
    lookback_days: int = 90,
) -> None:
    ivs = [c.iv for c in contracts if c.iv is not None]
    min_iv = min(ivs) if ivs else None
    max_iv = max(ivs) if ivs else None
    for contract in contracts:
        if contract.greeks is None:
            contract.greeks = {}
        if contract.iv is not None and min_iv is not None and max_iv is not None:
            if max_iv == min_iv:
                contract.greeks["iv_rank_chain"] = 0.5
            else:
                contract.greeks["iv_rank_chain"] = (float(contract.iv) - min_iv) / (max_iv - min_iv)
        hist_rank = store.iv_rank_history(contract, lookback_days=lookback_days)
        if hist_rank is not None:
            contract.greeks["iv_rank_hist"] = hist_rank


def _read_json(path: Path) -> dict | list | None:
    try:
        return json.loads(path.read_text(encoding="utf-8"))
    except Exception:
        return None


def _read_csv(path: Path) -> list[dict]:
    if not path.exists():
        return []
    try:
        with path.open("r", encoding="utf-8", newline="") as handle:
            reader = csv.DictReader(handle)
            return [row for row in reader]
    except Exception:
        return []


def _write_json(path: Path, payload: dict) -> None:
    path.write_text(json.dumps(payload, indent=2), encoding="utf-8")


@router.post("/run")
def run_core(payload: dict):
    settings = CoreSettings()
    if "mode" in payload:
        settings.mode = payload.get("mode") or settings.mode
    if "symbols" in payload:
        symbols = payload.get("symbols")
        if isinstance(symbols, str):
            settings.data.symbols = [s.strip() for s in symbols.split(",") if s.strip()]
        elif isinstance(symbols, list):
            settings.data.symbols = symbols
    if "strategy" in payload:
        settings.run.strategy = payload.get("strategy") or settings.run.strategy
    if "timeframe" in payload:
        settings.data.timeframe = payload.get("timeframe") or settings.data.timeframe
    if "seed" in payload:
        settings.run.seed = int(payload.get("seed") or settings.run.seed)
    if "data_source" in payload:
        settings.data.source = payload.get("data_source") or settings.data.source
    if "alpaca_feed" in payload:
        settings.data.alpaca_feed = payload.get("alpaca_feed") or settings.data.alpaca_feed
    if "ccxt_exchange" in payload:
        settings.data.ccxt_exchange = payload.get("ccxt_exchange") or settings.data.ccxt_exchange
    if payload.get("confirm_live"):
        settings.confirm_live = True
    if payload.get("confirm_token"):
        settings.confirm_live_token = payload.get("confirm_token")
    try:
        result = run_paper_session(settings, symbols=settings.data.symbols)
    except RuntimeError as exc:
        raise HTTPException(status_code=400, detail=str(exc))
    return result


@router.get("/dashboard")
def dashboard():
    settings = CoreSettings()
    store = RunStore(f"{settings.run.artifacts_dir}/runs.sqlite")
    latest = store.latest_run()
    return {"latest": latest}


@router.get("/trades")
def trades(limit: int = 50):
    settings = CoreSettings()
    store = RunStore(f"{settings.run.artifacts_dir}/runs.sqlite")
    return {"fills": store.list_fills(limit=limit)}


@router.get("/runs")
def runs(limit: int = 20):
    settings = CoreSettings()
    store = RunStore(f"{settings.run.artifacts_dir}/runs.sqlite")
    return {"runs": store.list_runs(limit=limit)}


@router.post("/backtest")
def backtest(payload: dict):
    settings = CoreSettings()
    symbol = payload.get("symbol") or (payload.get("symbols") or ["AAPL"])[0]
    timeframe = payload.get("timeframe") or settings.data.timeframe
    strategy_name = payload.get("strategy") or settings.run.strategy
    lookback = int(payload.get("lookback") or settings.run.lookback)
    grid = payload.get("grid") or {}
    objective = payload.get("objective") or "sharpe"
    wf = payload.get("walk_forward") or {}
    limit = int(wf.get("limit") or payload.get("limit") or 300)
    train = int(wf.get("train") or 120)
    test = int(wf.get("test") or 40)
    step = int(wf.get("step") or test)

    data_source = payload.get("data_source")
    if data_source:
        settings.data.source = data_source

    bars = load_bars(settings, symbol, timeframe, limit=limit)
    if not bars:
        raise HTTPException(status_code=404, detail="no_bars")

    strategy = registry.create(strategy_name, lookback=lookback)
    run_id = payload.get("run_id") or settings.run.run_id

    result = run_backtest(strategy, bars, initial_cash=settings.broker.paper_initial_cash)
    if not run_id:
        import uuid
        run_id = str(uuid.uuid4())
    save_backtest_artifacts(settings.run.artifacts_dir, run_id, result, {
        "symbol": symbol,
        "timeframe": timeframe,
        "strategy": strategy_name,
        "lookback": lookback,
    })

    grid_result = run_grid_search(
        lambda **params: registry.create(strategy_name, **params),
        bars,
        grid if grid else {"lookback": [max(5, lookback // 2), lookback, lookback * 2]},
        base_dir=settings.run.artifacts_dir,
        objective=objective,
    )

    wf_results = walk_forward(
        bars,
        lambda: registry.create(strategy_name, lookback=lookback),
        train_window=train,
        test_window=test,
        step=step,
    )
    save_walk_forward_artifacts(settings.run.artifacts_dir, run_id, wf_results, {
        "symbol": symbol,
        "timeframe": timeframe,
        "strategy": strategy_name,
        "lookback": lookback,
        "train": train,
        "test": test,
        "step": step,
        "limit": limit,
    })
    run_dir = Path(settings.run.artifacts_dir) / run_id
    _write_json(run_dir / "manifest.json", {
        "backtest_run": run_id,
        "grid_run": grid_result.get("run_id"),
        "walk_forward_run": run_id,
    })

    return {
        "run_id": run_id,
        "metrics": result.metrics,
        "equity_curve": result.equity_curve,
        "trades": result.trades,
        "grid": grid_result,
        "walk_forward": wf_results,
        "artifacts": {
            "base_dir": settings.run.artifacts_dir,
            "backtest_run": run_id,
            "grid_run": grid_result.get("run_id"),
            "walk_forward_run": run_id,
        },
    }


@router.get("/backtest/artifacts/{run_id}")
def backtest_artifacts(run_id: str, grid_run_id: str | None = None):
    settings = CoreSettings()
    base_dir = Path(settings.run.artifacts_dir)
    run_dir = base_dir / run_id
    if not run_dir.exists():
        raise HTTPException(status_code=404, detail="run_not_found")
    manifest = _read_json(run_dir / "manifest.json") or {}
    grid_id = grid_run_id or manifest.get("grid_run")
    grid_results = _read_json(base_dir / grid_id / "grid_results.json") if grid_id else None
    grid_best = _read_json(base_dir / grid_id / "best.json") if grid_id else None
    return {
        "run_id": run_id,
        "base_dir": str(run_dir),
        "config": _read_json(run_dir / "config.json"),
        "metrics": _read_json(run_dir / "metrics.json"),
        "equity_curve": _read_json(run_dir / "equity_curve.json"),
        "trades": _read_csv(run_dir / "trades.csv"),
        "walk_forward": _read_json(run_dir / "walk_forward.json"),
        "grid": grid_results,
        "grid_best": grid_best,
        "manifest": manifest,
    }


@router.post("/options/chain")
def options_chain(payload: dict):
    settings = CoreSettings()
    symbol = payload.get("symbol") or "AAPL"
    provider_name = payload.get("provider") or "synthetic"
    limit = int(payload.get("limit") or 50)
    rate = float(payload.get("rate") or 0.02)
    spot, contracts = _enrich_chain(settings, symbol, provider_name, limit=limit * 4, rate=rate)
    store = OptionIVHistoryStore(settings.data.options_cache_db)
    store.record_snapshot(contracts)
    iv_rank_days = int(payload.get("iv_rank_days") or 90)
    expiry_from = _parse_date(payload.get("expiry_from"))
    expiry_to = _parse_date(payload.get("expiry_to"))
    min_days = payload.get("min_days")
    max_days = payload.get("max_days")
    strike_min = payload.get("strike_min")
    strike_max = payload.get("strike_max")
    strike_min_pct = payload.get("strike_min_pct")
    strike_max_pct = payload.get("strike_max_pct")
    option_type = payload.get("option_type")
    today = date.today()

    filtered = []
    for contract in contracts:
        if option_type and contract.option_type != option_type:
            continue
        if expiry_from and contract.expiration < expiry_from:
            continue
        if expiry_to and contract.expiration > expiry_to:
            continue
        if min_days is not None and (contract.expiration - today).days < int(min_days):
            continue
        if max_days is not None and (contract.expiration - today).days > int(max_days):
            continue
        if strike_min is not None and contract.strike < float(strike_min):
            continue
        if strike_max is not None and contract.strike > float(strike_max):
            continue
        if strike_min_pct is not None and contract.strike < spot * (1 + float(strike_min_pct)):
            continue
        if strike_max_pct is not None and contract.strike > spot * (1 + float(strike_max_pct)):
            continue
        filtered.append(contract)
    _attach_iv_ranks(filtered, store, lookback_days=iv_rank_days)
    if limit:
        filtered = filtered[:limit]
    return {
        "symbol": symbol,
        "underlying_price": spot,
        "provider": provider_name,
        "contracts": [c.to_dict() for c in filtered],
    }


@router.post("/options/strategy")
def options_strategy(payload: dict):
    strategy = payload.get("strategy") or "covered_call"
    params = payload.get("params") or {}
    def _f(key: str) -> float:
        try:
            return float(params.get(key) or 0.0)
        except Exception:
            return 0.0
    if strategy == "covered_call":
        outcome = covered_call(_f("spot"), _f("strike"), _f("premium"))
    elif strategy == "cash_secured_put":
        outcome = cash_secured_put(_f("strike"), _f("premium"))
    elif strategy == "bull_call_spread":
        outcome = bull_call_spread(
            _f("long_strike"),
            _f("long_premium"),
            _f("short_strike"),
            _f("short_premium"),
        )
    elif strategy == "bear_put_spread":
        outcome = bear_put_spread(
            _f("long_strike"),
            _f("long_premium"),
            _f("short_strike"),
            _f("short_premium"),
        )
    elif strategy == "iron_condor":
        outcome = iron_condor(
            _f("short_put_strike"),
            _f("short_put_premium"),
            _f("long_put_strike"),
            _f("long_put_premium"),
            _f("short_call_strike"),
            _f("short_call_premium"),
            _f("long_call_strike"),
            _f("long_call_premium"),
        )
    else:
        raise HTTPException(status_code=400, detail="unknown_strategy")
    return outcome.to_dict()


@router.post("/options/payoff")
def options_payoff(payload: dict):
    legs = payload.get("legs") or []
    min_price = float(payload.get("min_price") or 0)
    max_price = float(payload.get("max_price") or 0)
    if min_price <= 0 or max_price <= 0:
        raise HTTPException(status_code=400, detail="min_max_required")
    curve = payoff_curve(legs, min_price, max_price, steps=int(payload.get("steps") or 40))
    return {"curve": curve}


@router.post("/options/scan")
def options_scan(payload: dict):
    settings = CoreSettings()
    symbol = payload.get("symbol") or "AAPL"
    provider_name = payload.get("provider") or "synthetic"
    rate = float(payload.get("rate") or 0.02)
    limit = int(payload.get("limit") or 50)
    filters = payload.get("filters") or {}
    min_days = filters.get("min_days")
    max_days = filters.get("max_days")
    expiry_from = _parse_date(filters.get("expiry_from"))
    expiry_to = _parse_date(filters.get("expiry_to"))

    spot, contracts = _enrich_chain(settings, symbol, provider_name, limit=200, rate=rate)
    store = OptionIVHistoryStore(settings.data.options_cache_db)
    store.record_snapshot(contracts)
    iv_rank_days = int(filters.get("iv_rank_days") or 90)
    today = date.today()
    filtered = []
    for contract in contracts:
        if expiry_from and contract.expiration < expiry_from:
            continue
        if expiry_to and contract.expiration > expiry_to:
            continue
        if min_days is not None and (contract.expiration - today).days < int(min_days):
            continue
        if max_days is not None and (contract.expiration - today).days > int(max_days):
            continue
        filtered.append(contract)
    _attach_iv_ranks(filtered, store, lookback_days=iv_rank_days)
    scan = scan_contracts(filtered, filters)
    return {
        "symbol": symbol,
        "underlying_price": spot,
        "provider": provider_name,
        "results": scan[:limit],
    }


@router.post("/options/backtest")
def options_backtest(payload: dict):
    settings = CoreSettings()
    symbol = payload.get("symbol") or "AAPL"
    timeframe = payload.get("timeframe") or "1d"
    strategy = payload.get("strategy") or "wheel"
    hold_days = int(payload.get("hold_days") or 30)
    lookback = int(payload.get("lookback") or 20)
    initial_cash = float(payload.get("initial_cash") or 10_000.0)
    rate = float(payload.get("rate") or 0.02)
    otm_pct = float(payload.get("otm_pct") or 0.05)
    spread_width = float(payload.get("spread_width") or 0.05)
    limit = int(payload.get("limit") or 400)

    bars = load_bars(settings, symbol, timeframe, limit=limit)
    if not bars:
        raise HTTPException(status_code=404, detail="no_bars")
    if strategy == "wheel":
        result = backtest_wheel(
            bars,
            initial_cash=initial_cash,
            hold_days=hold_days,
            put_otm_pct=otm_pct,
            call_otm_pct=otm_pct,
            lookback=lookback,
            rate=rate,
        )
    elif strategy == "covered_call":
        result = backtest_covered_call(
            bars,
            initial_cash=initial_cash,
            hold_days=hold_days,
            call_otm_pct=otm_pct,
            lookback=lookback,
            rate=rate,
        )
    elif strategy == "bull_call_spread":
        result = backtest_vertical(
            bars,
            initial_cash=initial_cash,
            hold_days=hold_days,
            long_pct=0.0,
            short_pct=spread_width,
            lookback=lookback,
            rate=rate,
            option_type="call",
        )
    elif strategy == "bear_put_spread":
        result = backtest_vertical(
            bars,
            initial_cash=initial_cash,
            hold_days=hold_days,
            long_pct=0.0,
            short_pct=-spread_width,
            lookback=lookback,
            rate=rate,
            option_type="put",
        )
    else:
        raise HTTPException(status_code=400, detail="unknown_strategy")
    run_id = payload.get("run_id") or str(uuid.uuid4())
    return {
        "run_id": run_id,
        "symbol": symbol,
        "strategy": strategy,
        "metrics": result.metrics,
        "equity_curve": result.equity_curve,
        "trades": result.trades,
    }
