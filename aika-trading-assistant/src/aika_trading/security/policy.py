from dataclasses import dataclass
from datetime import datetime
from typing import Any
import time
import json
import hmac
import hashlib
import redis

from ..config import settings
from ..db.models import ConnectorBudget
from ..db.session import SessionLocal


@dataclass
class PolicyDecision:
    decision: str
    reason: str
    risk_score: int
    requires_approval: bool


class PolicyEngine:
    def __init__(self) -> None:
        self._redis = None
        if settings.redis_url:
            try:
                self._redis = redis.Redis.from_url(settings.redis_url)
                self._redis.ping()
            except Exception:
                self._redis = None

    def _budget_key(self, connector: str) -> str:
        window = int(time.time() // 60)
        return f"budget:{connector}:{window}"

    def _get_budget_limit(self, connector: str) -> int:
        with SessionLocal() as db:
            row = db.query(ConnectorBudget).filter_by(connector=connector).first()
            if row and row.enabled:
                return row.max_per_minute
        return settings.policy_connector_budget_per_min

    def _budget_allows(self, connector: str) -> bool:
        limit = self._get_budget_limit(connector)
        if limit <= 0:
            return False
        if not self._redis:
            return True
        key = self._budget_key(connector)
        current = self._redis.incr(key)
        if current == 1:
            self._redis.expire(key, 60)
        return current <= limit

    def evaluate_trade(self, action: str, payload: dict[str, Any]) -> PolicyDecision:
        requires_approval = settings.policy_default_requires_approval
        risk = 30
        reason = "policy_default"

        if action in {"trade.place", "trade.cancel", "trade.modify"}:
            risk += 30
            reason = "trade_action"

        if payload.get("notional"):
            risk += 10
        if payload.get("leverage"):
            risk += 20

        connector = payload.get("broker", "unknown")
        if connector and not self._budget_allows(connector):
            return PolicyDecision("deny", "connector_budget_exceeded", risk, True)

        if risk >= settings.policy_risk_threshold:
            requires_approval = True

        decision = "require_approval" if requires_approval else "allow"
        return PolicyDecision(decision, reason, risk, requires_approval)


def sign_approval(approval_id: str, payload: dict[str, Any]) -> str:
    if not settings.approval_signing_key:
        raise RuntimeError("APPROVAL_SIGNING_KEY is required")
    msg = json.dumps({"id": approval_id, "payload": payload}, sort_keys=True).encode("utf-8")
    return hmac.new(settings.approval_signing_key.encode("utf-8"), msg, hashlib.sha256).hexdigest()
