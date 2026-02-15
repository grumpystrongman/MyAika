from __future__ import annotations

from dataclasses import dataclass
import os
from pathlib import Path
from typing import Any

from pydantic import BaseModel, Field
from pydantic_settings import BaseSettings, SettingsConfigDict


def _default_core_dir() -> Path:
    return Path(__file__).resolve().parents[3] / "data" / "core"


class DataConfig(BaseModel):
    source: str = Field(default_factory=lambda: os.getenv("CORE_DATA_SOURCE", "synthetic"))
    timeframe: str = Field(default_factory=lambda: os.getenv("CORE_DATA_TIMEFRAME", "1h"))
    symbols: list[str] = Field(default_factory=lambda: ["AAPL"])
    data_dir: str = Field(default_factory=lambda: str(_default_core_dir() / "data"))
    cache_db: str = Field(default_factory=lambda: str(_default_core_dir() / "market_cache.sqlite"))
    options_cache_db: str = Field(default_factory=lambda: str(_default_core_dir() / "options_cache.sqlite"))
    use_cache: bool = True
    cache_only: bool = False
    alpaca_data_base: str = Field(default_factory=lambda: os.getenv("ALPACA_DATA_BASE", "https://data.alpaca.markets"))
    alpaca_feed: str = Field(default_factory=lambda: os.getenv("ALPACA_FEED", "iex"))
    alpaca_api_key: str = Field(default_factory=lambda: os.getenv("ALPACA_API_KEY", ""))
    alpaca_api_secret: str = Field(default_factory=lambda: os.getenv("ALPACA_API_SECRET", ""))
    ccxt_exchange: str = Field(default_factory=lambda: os.getenv("CCXT_EXCHANGE", "coinbase"))
    ccxt_api_key: str = Field(default_factory=lambda: os.getenv("CCXT_API_KEY", ""))
    ccxt_api_secret: str = Field(default_factory=lambda: os.getenv("CCXT_API_SECRET", ""))
    polygon_api_key: str = Field(default_factory=lambda: os.getenv("POLYGON_API_KEY", ""))
    polygon_api_base: str = Field(default_factory=lambda: os.getenv("POLYGON_API_BASE", "https://api.polygon.io"))
    polygon_snapshot_path: str = Field(default_factory=lambda: os.getenv("POLYGON_SNAPSHOT_PATH", "/v3/snapshot/options/{symbol}"))


class ExecutionConfig(BaseModel):
    fee_bps: float = 1.0
    slippage_bps: float = 2.0
    spread_bps: float = 1.0
    latency_ms: int = 250
    min_volume: float = 0.0
    max_adv_pct: float = 0.02


class RiskConfig(BaseModel):
    max_position_value: float = 10_000.0
    max_leverage: float = 1.2
    max_drawdown: float = 0.2
    max_loss_streak: int = 5
    correlation_cap: float = 0.75
    vol_target: float = 0.15


class BrokerConfig(BaseModel):
    name: str = "paper"
    paper_initial_cash: float = 100_000.0


class RunConfig(BaseModel):
    strategy: str = "volatility_momentum"
    lookback: int = 50
    seed: int = 7
    run_id: str | None = None
    artifacts_dir: str = Field(default_factory=lambda: str(_default_core_dir() / "runs"))


class CoreSettings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", env_file_encoding="utf-8")

    config_version: str = Field(default="1", alias="CORE_CONFIG_VERSION")
    env: str = Field(default="dev", alias="CORE_ENV")
    mode: str = Field(default="paper", alias="CORE_MODE")
    confirm_live_phrase: str = Field(default="I_UNDERSTAND_LIVE_TRADING", alias="CORE_CONFIRM_PHRASE")
    confirm_live: bool = Field(default=False, alias="CORE_CONFIRM_LIVE")
    confirm_live_token: str = Field(default="", alias="CORE_CONFIRM_TOKEN")

    data: DataConfig = Field(default_factory=DataConfig)
    execution: ExecutionConfig = Field(default_factory=ExecutionConfig)
    risk: RiskConfig = Field(default_factory=RiskConfig)
    broker: BrokerConfig = Field(default_factory=BrokerConfig)
    run: RunConfig = Field(default_factory=RunConfig)

    def ensure_live_confirmed(self, override_token: str | None = None) -> None:
        if self.mode != "live":
            return
        token = override_token or self.confirm_live_token
        if self.confirm_live or token == self.confirm_live_phrase:
            return
        raise RuntimeError(
            "live_trading_requires_confirmation: set CORE_CONFIRM_LIVE=1 and CORE_CONFIRM_TOKEN"
        )


@dataclass
class RunContext:
    settings: CoreSettings
    run_id: str
    started_at: str
    extra: dict[str, Any] | None = None


def ensure_dirs(settings: CoreSettings) -> None:
    Path(settings.data.data_dir).mkdir(parents=True, exist_ok=True)
    Path(settings.run.artifacts_dir).mkdir(parents=True, exist_ok=True)
    Path(settings.data.cache_db).parent.mkdir(parents=True, exist_ok=True)
    Path(settings.data.options_cache_db).parent.mkdir(parents=True, exist_ok=True)
