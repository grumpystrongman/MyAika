# Aika Trading Assistant (Monorepo)

Production-oriented trading assistant stack with a FastAPI backend, Celery worker, optional Node streamer, Postgres state, and Qdrant vector storage.

## Structure
- `src/aika_trading/api` FastAPI service
- `src/aika_trading/worker` Celery worker
- `services/streamer` Optional Node.js WebSocket/webhook service
- `docker-compose.yml` Postgres + Redis + Qdrant

## Local development
1) Copy env file
```
cp .env.example .env
```
2) Start dependencies
```
docker compose up -d
```
3) Install Python deps
```
python -m venv .venv
. .venv/bin/activate  # Windows: .venv\Scripts\activate
pip install -e .[dev]
```
4) Run API
```
uvicorn aika_trading.api.main:app --host 0.0.0.0 --port 8088 --reload
```
5) Run worker
```
celery -A aika_trading.worker.app.celery_app worker --loglevel=INFO
```
6) Optional Node streamer
```
cd services/streamer
npm install
npm run dev
```

## OAuth examples

### Python: build authorize URL (Coinbase)
```python
from sqlalchemy.orm import Session
from aika_trading.oauth.state import create_state
from aika_trading.oauth.coinbase import coinbase_oauth
from aika_trading.config import settings

with Session(...) as db:
    state = create_state(db, "coinbase", settings.coinbase_redirect_uri)
    url = coinbase_oauth.build_authorize_url(
        client_id=settings.coinbase_client_id,
        redirect_uri=settings.coinbase_redirect_uri,
        scopes=settings.coinbase_scopes,
        state=state["state"],
        code_challenge=state["code_challenge"],
    )
```

### Node: sample OAuth callback handler (Express)
```js
app.get("/oauth/coinbase/callback", async (req, res) => {
  const { code, state } = req.query;
  // POST to token endpoint with code_verifier stored server-side
  res.json({ ok: true });
});
```

## WebSocket example (Node)
See `services/streamer/index.js` for a Coinbase Advanced Trade WebSocket subscription example.

## Background consumer example (Python)
```python
from aika_trading.worker.tasks import ingest_knowledge

ingest_knowledge.delay({"items": [{"id": "doc-1"}]})
```

## Trade execution pseudocode
```
client submits trade proposal
-> policy engine evaluates risk
-> if approval required: create approval + audit
-> human approves via /approvals
-> execute_trade checks approval + idempotency
-> connector.place_order
-> audit trail persisted
```

## Notes
- All tokens are encrypted at rest using `TOKEN_ENCRYPTION_KEY`.
- All trade actions are deny-by-default and require approval by default.
- Robinhood connector is read-only and marked unsupported.
- Trade outcomes (including losses) can be recorded and embedded into Qdrant for RAG-style recall.
- Embeddings default to lightweight hash vectors; set `EMBEDDINGS_PROVIDER=sentence_transformers` and install `sentence-transformers` for higher-quality vectors.

## Loss learning (RAG)
Record outcomes and query lessons:
```
POST /trades/outcome
POST /trades/lessons/query
```
Losses automatically create a lesson summary and embed it into Qdrant.

## Tests
```
pytest -q
```

## Core quant engine (local)
Paper run (synthetic data, deterministic):
```
python -m aika_trading.core.cli trade run --mode paper --symbols AAPL,BTC-USD --strategy volatility_momentum --timeframe 1h
```

Backtest (synthetic data):
```
python -m aika_trading.core.cli backtest run --symbol AAPL --strategy mean_reversion --timeframe 1h
```

Core API (FastAPI):
- `POST /core/run` run a paper cycle
- `GET /core/dashboard` latest run summary
- `GET /core/trades` recent fills

Safety: live mode is blocked by default. To enable, set `CORE_MODE=live` and `CORE_CONFIRM_LIVE=1` with `CORE_CONFIRM_TOKEN=I_UNDERSTAND_LIVE_TRADING`.
Artifacts: run configs and logs are stored in `aika-trading-assistant/data/core/runs`.

### Backtest grid search + walk-forward
Grid search (pass params as JSON):
```
python -m aika_trading.core.cli backtest grid --symbol AAPL --strategy volatility_momentum --grid "{\"lookback\":[20,50,80]}"
```

Walk-forward:
```
python -m aika_trading.core.cli backtest walk-forward --symbol AAPL --strategy mean_reversion --train 120 --test 40 --step 40
```

Artifacts are saved under `data/core/runs/<run_id>/`.

### Real market data providers
Set `CORE_DATA_SOURCE=alpaca` or `CORE_DATA_SOURCE=ccxt` to switch from synthetic data.
- Alpaca uses `ALPACA_API_KEY`, `ALPACA_API_SECRET`, and `ALPACA_DATA_BASE` (default `https://data.alpaca.markets`).
- CCXT uses `CCXT_EXCHANGE`, `CCXT_API_KEY`, and `CCXT_API_SECRET` (install with `pip install .[ccxt]`).

### Options (beginner-friendly)
API endpoints:
- `POST /core/options/chain` with `{ "symbol": "AAPL", "provider": "synthetic" | "polygon" }`
  - Supports `min_days`, `max_days`, `strike_min`, `strike_max`, `option_type` to filter the chain.
- `POST /core/options/strategy` with `{ "strategy": "covered_call", "params": { ... } }`
- `POST /core/options/scan` with filters for IV rank, delta, POP
- `POST /core/options/backtest` for wheel, covered call, and verticals

If you want real option contracts, set `POLYGON_API_KEY` and choose provider `"polygon"` in the UI.
For live prices, the Polygon snapshot endpoint is used when available. You can override the path via `POLYGON_SNAPSHOT_PATH`.

## Security expectations
- Use strict redirect URIs and rotate keys regularly.
- Never log secrets or tokens.
- Keep human approval required for any trade or transfer.
