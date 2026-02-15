from fastapi import FastAPI, Request
from fastapi.responses import JSONResponse
from fastapi.middleware.cors import CORSMiddleware
import time

from ..config import settings
from ..logging import setup_logging
from ..db.session import init_db
from .routers import health, oauth, trades, approvals, strategies, knowledge, core_router

setup_logging()
init_db()

app = FastAPI(title=settings.app_name)

origins = [o.strip() for o in settings.api_cors_origins.split(",") if o.strip()] if settings.api_cors_origins else ["*"]
app.add_middleware(
    CORSMiddleware,
    allow_origins=origins,
    allow_credentials=True,
    allow_methods=["*"] ,
    allow_headers=["*"]
)

_rate = {}

@app.middleware("http")
async def rate_limit(request: Request, call_next):
    key = request.client.host if request.client else "unknown"
    now = time.time()
    window = settings.rate_limit_window_seconds
    limit = settings.rate_limit_requests
    bucket = _rate.get(key, [])
    bucket = [t for t in bucket if now - t < window]
    if len(bucket) >= limit:
        return JSONResponse(status_code=429, content={"error": "rate_limit"})
    bucket.append(now)
    _rate[key] = bucket
    return await call_next(request)

app.include_router(health.router)
app.include_router(oauth.router)
app.include_router(trades.router)
app.include_router(approvals.router)
app.include_router(strategies.router)
app.include_router(knowledge.router)
app.include_router(core_router.router)
