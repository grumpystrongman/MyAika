from pathlib import Path
import os
from pydantic_settings import BaseSettings, SettingsConfigDict
from pydantic import Field


def _resolve_env_file() -> str:
    override = os.getenv("AIKA_TRADING_ENV_FILE")
    if override:
        return override
    explicit = Path.cwd() / ".env"
    if explicit.exists():
        return str(explicit)
    project_root = Path(__file__).resolve().parents[2]
    candidate = project_root / ".env"
    return str(candidate)


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=_resolve_env_file(), env_file_encoding="utf-8")

    app_env: str = Field(default="development", alias="APP_ENV")
    app_name: str = Field(default="Aika Trading Assistant", alias="APP_NAME")
    api_base_url: str = Field(default="http://localhost:8088", alias="API_BASE_URL")
    api_cors_origins: str = Field(default="*", alias="API_CORS_ORIGINS")

    database_url: str = Field(
        default="postgresql+psycopg://aika:aika@localhost:5432/aika_trading",
        alias="DATABASE_URL",
    )
    async_database_url: str = Field(
        default="postgresql+asyncpg://aika:aika@localhost:5432/aika_trading",
        alias="ASYNC_DATABASE_URL",
    )

    redis_url: str = Field(default="redis://localhost:6379/0", alias="REDIS_URL")
    qdrant_url: str = Field(default="http://localhost:6333", alias="QDRANT_URL")
    qdrant_api_key: str = Field(default="", alias="QDRANT_API_KEY")
    qdrant_collection: str = Field(default="aika_knowledge", alias="QDRANT_COLLECTION")
    embeddings_provider: str = Field(default="hash", alias="EMBEDDINGS_PROVIDER")
    embeddings_model: str = Field(default="all-MiniLM-L6-v2", alias="EMBEDDINGS_MODEL")
    embeddings_dim: int = Field(default=384, alias="EMBEDDINGS_DIM")

    token_encryption_key: str = Field(default="", alias="TOKEN_ENCRYPTION_KEY")
    approval_signing_key: str = Field(default="", alias="APPROVAL_SIGNING_KEY")

    rate_limit_requests: int = Field(default=60, alias="RATE_LIMIT_REQUESTS")
    rate_limit_window_seconds: int = Field(default=60, alias="RATE_LIMIT_WINDOW_SECONDS")

    policy_default_requires_approval: bool = Field(default=True, alias="POLICY_REQUIRE_APPROVAL")
    policy_risk_threshold: int = Field(default=50, alias="POLICY_RISK_THRESHOLD")
    policy_connector_budget_per_min: int = Field(default=120, alias="POLICY_CONNECTOR_BUDGET")

    coinbase_client_id: str = Field(default="", alias="COINBASE_CLIENT_ID")
    coinbase_client_secret: str = Field(default="", alias="COINBASE_CLIENT_SECRET")
    coinbase_redirect_uri: str = Field(default="", alias="COINBASE_REDIRECT_URI")
    coinbase_scopes: str = Field(default="wallet:accounts:read", alias="COINBASE_SCOPES")
    coinbase_auth_url: str = Field(
        default="https://login.coinbase.com/oauth2/authorize", alias="COINBASE_AUTH_URL"
    )
    coinbase_token_url: str = Field(
        default="https://api.coinbase.com/oauth2/token", alias="COINBASE_TOKEN_URL"
    )
    coinbase_revoke_url: str = Field(
        default="https://api.coinbase.com/oauth2/revoke", alias="COINBASE_REVOKE_URL"
    )
    coinbase_sandbox: bool = Field(default=False, alias="COINBASE_SANDBOX")
    coinbase_api_base: str = Field(
        default="https://api.coinbase.com/api/v3/brokerage", alias="COINBASE_API_BASE"
    )
    coinbase_ws_url: str = Field(
        default="wss://advanced-trade-ws.coinbase.com", alias="COINBASE_WS_URL"
    )
    coinbase_sandbox_api_base: str = Field(
        default="https://api-public.sandbox.exchange.coinbase.com", alias="COINBASE_SANDBOX_API_BASE"
    )
    coinbase_sandbox_ws_url: str = Field(
        default="wss://advanced-trade-ws.sandbox.coinbase.com", alias="COINBASE_SANDBOX_WS_URL"
    )

    schwab_client_id: str = Field(default="", alias="SCHWAB_CLIENT_ID")
    schwab_client_secret: str = Field(default="", alias="SCHWAB_CLIENT_SECRET")
    schwab_redirect_uri: str = Field(default="", alias="SCHWAB_REDIRECT_URI")
    schwab_scopes: str = Field(default="", alias="SCHWAB_SCOPES")
    schwab_auth_url: str = Field(default="", alias="SCHWAB_AUTH_URL")
    schwab_token_url: str = Field(default="", alias="SCHWAB_TOKEN_URL")
    schwab_revoke_url: str = Field(default="", alias="SCHWAB_REVOKE_URL")
    schwab_api_base: str = Field(default="", alias="SCHWAB_API_BASE")

    alpaca_client_id: str = Field(default="", alias="ALPACA_CLIENT_ID")
    alpaca_client_secret: str = Field(default="", alias="ALPACA_CLIENT_SECRET")
    alpaca_redirect_uri: str = Field(default="", alias="ALPACA_REDIRECT_URI")
    alpaca_scopes: str = Field(default="", alias="ALPACA_SCOPES")
    alpaca_auth_url: str = Field(default="", alias="ALPACA_AUTH_URL")
    alpaca_token_url: str = Field(default="", alias="ALPACA_TOKEN_URL")
    alpaca_revoke_url: str = Field(default="", alias="ALPACA_REVOKE_URL")
    alpaca_api_base: str = Field(default="https://paper-api.alpaca.markets", alias="ALPACA_API_BASE")

    alpaca_api_key: str = Field(default="", alias="ALPACA_API_KEY")
    alpaca_api_secret: str = Field(default="", alias="ALPACA_API_SECRET")

    robinhood_read_only: bool = Field(default=True, alias="ROBINHOOD_READ_ONLY")


settings = Settings()
