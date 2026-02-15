from __future__ import annotations

import argparse
import json
import uuid

from .config import CoreSettings
from .runner import run_paper_session
from .data import SyntheticDataProvider
from .strategy import registry
from .backtest import run_backtest, run_grid_search, save_backtest_artifacts
from .storage import RunStore
from .walk_forward import walk_forward, save_walk_forward_artifacts


def _parse_symbols(raw: str) -> list[str]:
    return [s.strip() for s in raw.split(",") if s.strip()]


def run_trade(args: argparse.Namespace) -> None:
    settings = CoreSettings()
    settings.mode = args.mode
    if args.symbols:
        settings.data.symbols = _parse_symbols(args.symbols)
    if args.strategy:
        settings.run.strategy = args.strategy
    if args.timeframe:
        settings.data.timeframe = args.timeframe
    if args.confirm_live:
        settings.confirm_live = True
        settings.confirm_live_token = settings.confirm_live_phrase
    result = run_paper_session(settings, symbols=settings.data.symbols)
    print(json.dumps(result, indent=2))


def run_backtest_cli(args: argparse.Namespace) -> None:
    settings = CoreSettings()
    provider = SyntheticDataProvider(seed=settings.run.seed)
    bars = provider.get_bars(args.symbol, args.timeframe, limit=200)
    strategy = registry.create(args.strategy, lookback=args.lookback)
    result = run_backtest(strategy, bars)
    run_id = args.run_id or str(uuid.uuid4())
    save_backtest_artifacts(settings.run.artifacts_dir, run_id, result, {
        "strategy": args.strategy,
        "symbol": args.symbol,
        "timeframe": args.timeframe,
        "lookback": args.lookback,
    })
    print(json.dumps({"run_id": run_id, "metrics": result.metrics, "trades": result.trades}, indent=2))


def run_grid_cli(args: argparse.Namespace) -> None:
    settings = CoreSettings()
    provider = SyntheticDataProvider(seed=settings.run.seed)
    bars = provider.get_bars(args.symbol, args.timeframe, limit=200)
    grid = json.loads(args.grid) if args.grid else {"lookback": [20, 50, 80]}
    result = run_grid_search(
        lambda **params: registry.create(args.strategy, **params),
        bars,
        grid,
        base_dir=settings.run.artifacts_dir,
        objective=args.objective,
    )
    print(json.dumps(result, indent=2))


def run_walk_forward_cli(args: argparse.Namespace) -> None:
    settings = CoreSettings()
    provider = SyntheticDataProvider(seed=settings.run.seed)
    bars = provider.get_bars(args.symbol, args.timeframe, limit=args.limit)
    run_id = args.run_id or str(uuid.uuid4())
    results = walk_forward(
        bars,
        lambda: registry.create(args.strategy, lookback=args.lookback),
        train_window=args.train,
        test_window=args.test,
        step=args.step,
    )
    save_walk_forward_artifacts(settings.run.artifacts_dir, run_id, results, {
        "strategy": args.strategy,
        "symbol": args.symbol,
        "timeframe": args.timeframe,
        "train_window": args.train,
        "test_window": args.test,
        "step": args.step,
        "lookback": args.lookback,
    })
    print(json.dumps({"run_id": run_id, "windows": len(results)}, indent=2))


def report_latest(args: argparse.Namespace) -> None:
    settings = CoreSettings()
    store = RunStore(f"{settings.run.artifacts_dir}/runs.sqlite")
    latest = store.latest_run()
    print(json.dumps(latest or {}, indent=2))


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(prog="aika-core")
    sub = parser.add_subparsers(dest="command")

    trade = sub.add_parser("trade")
    trade_sub = trade.add_subparsers(dest="trade_cmd")
    trade_run = trade_sub.add_parser("run")
    trade_run.add_argument("--mode", default="paper")
    trade_run.add_argument("--symbols", default="")
    trade_run.add_argument("--strategy", default="volatility_momentum")
    trade_run.add_argument("--timeframe", default="1h")
    trade_run.add_argument("--confirm-live", action="store_true")
    trade_run.set_defaults(func=run_trade)

    backtest = sub.add_parser("backtest")
    backtest_sub = backtest.add_subparsers(dest="backtest_cmd")
    backtest_run = backtest_sub.add_parser("run")
    backtest_run.add_argument("--symbol", default="AAPL")
    backtest_run.add_argument("--strategy", default="volatility_momentum")
    backtest_run.add_argument("--timeframe", default="1h")
    backtest_run.add_argument("--lookback", type=int, default=50)
    backtest_run.add_argument("--run-id", default="")
    backtest_run.set_defaults(func=run_backtest_cli)

    backtest_grid = backtest_sub.add_parser("grid")
    backtest_grid.add_argument("--symbol", default="AAPL")
    backtest_grid.add_argument("--strategy", default="volatility_momentum")
    backtest_grid.add_argument("--timeframe", default="1h")
    backtest_grid.add_argument("--grid", default="")
    backtest_grid.add_argument("--objective", default="sharpe")
    backtest_grid.set_defaults(func=run_grid_cli)

    backtest_walk = backtest_sub.add_parser("walk-forward")
    backtest_walk.add_argument("--symbol", default="AAPL")
    backtest_walk.add_argument("--strategy", default="volatility_momentum")
    backtest_walk.add_argument("--timeframe", default="1h")
    backtest_walk.add_argument("--train", type=int, default=120)
    backtest_walk.add_argument("--test", type=int, default=40)
    backtest_walk.add_argument("--step", type=int, default=40)
    backtest_walk.add_argument("--lookback", type=int, default=50)
    backtest_walk.add_argument("--limit", type=int, default=300)
    backtest_walk.add_argument("--run-id", default="")
    backtest_walk.set_defaults(func=run_walk_forward_cli)

    report = sub.add_parser("report")
    report_sub = report.add_subparsers(dest="report_cmd")
    report_latest_cmd = report_sub.add_parser("open")
    report_latest_cmd.add_argument("--latest", action="store_true")
    report_latest_cmd.set_defaults(func=report_latest)

    return parser


def main() -> None:
    parser = build_parser()
    args = parser.parse_args()
    if hasattr(args, "func"):
        args.func(args)
    else:
        parser.print_help()


if __name__ == "__main__":
    main()
