import uuid
from datetime import datetime
from sqlalchemy import Column, String, DateTime, Boolean, Integer, Text, JSON
from sqlalchemy.dialects.postgresql import JSONB
from .session import Base


def now_ts() -> datetime:
    return datetime.utcnow()


class OAuthState(Base):
    __tablename__ = "oauth_states"
    id = Column(String, primary_key=True, default=lambda: str(uuid.uuid4()))
    provider = Column(String, nullable=False)
    state = Column(String, nullable=False, unique=True)
    code_verifier = Column(String, nullable=False)
    redirect_uri = Column(String, nullable=False)
    created_at = Column(DateTime, default=now_ts, nullable=False)
    expires_at = Column(DateTime, nullable=False)


class OAuthToken(Base):
    __tablename__ = "oauth_tokens"
    id = Column(String, primary_key=True, default=lambda: str(uuid.uuid4()))
    provider = Column(String, nullable=False)
    subject_id = Column(String, nullable=True)
    access_token_enc = Column(Text, nullable=False)
    refresh_token_enc = Column(Text, nullable=True)
    scopes = Column(String, nullable=True)
    expires_at = Column(DateTime, nullable=True)
    created_at = Column(DateTime, default=now_ts, nullable=False)
    updated_at = Column(DateTime, default=now_ts, nullable=False)


JSONType = JSON().with_variant(JSONB, "postgresql")


class TradeApproval(Base):
    __tablename__ = "trade_approvals"
    id = Column(String, primary_key=True, default=lambda: str(uuid.uuid4()))
    status = Column(String, nullable=False, default="pending")
    action = Column(String, nullable=False)
    payload = Column(JSONType, nullable=False)
    requested_by = Column(String, nullable=False)
    approved_by = Column(String, nullable=True)
    approved_at = Column(DateTime, nullable=True)
    signature = Column(Text, nullable=False)
    created_at = Column(DateTime, default=now_ts, nullable=False)


class AuditEvent(Base):
    __tablename__ = "audit_events"
    id = Column(String, primary_key=True, default=lambda: str(uuid.uuid4()))
    ts = Column(DateTime, default=now_ts, nullable=False)
    action = Column(String, nullable=False)
    decision = Column(String, nullable=False)
    detail = Column(JSONType, nullable=False)
    prev_hash = Column(String, nullable=True)
    hash = Column(String, nullable=False)


class Strategy(Base):
    __tablename__ = "strategies"
    id = Column(String, primary_key=True, default=lambda: str(uuid.uuid4()))
    name = Column(String, nullable=False)
    version = Column(String, nullable=False)
    spec = Column(JSONType, nullable=False)
    created_at = Column(DateTime, default=now_ts, nullable=False)


class Order(Base):
    __tablename__ = "orders"
    id = Column(String, primary_key=True, default=lambda: str(uuid.uuid4()))
    strategy_id = Column(String, nullable=True)
    broker = Column(String, nullable=False)
    symbol = Column(String, nullable=False)
    side = Column(String, nullable=False)
    quantity = Column(String, nullable=False)
    status = Column(String, nullable=False, default="proposed")
    idempotency_key = Column(String, nullable=True, unique=True)
    external_id = Column(String, nullable=True)
    created_at = Column(DateTime, default=now_ts, nullable=False)
    updated_at = Column(DateTime, default=now_ts, nullable=False)


class ConnectorBudget(Base):
    __tablename__ = "connector_budgets"
    id = Column(String, primary_key=True, default=lambda: str(uuid.uuid4()))
    connector = Column(String, nullable=False, unique=True)
    max_per_minute = Column(Integer, nullable=False, default=120)
    enabled = Column(Boolean, nullable=False, default=True)
    updated_at = Column(DateTime, default=now_ts, nullable=False)


class TradeOutcome(Base):
    __tablename__ = "trade_outcomes"
    id = Column(String, primary_key=True, default=lambda: str(uuid.uuid4()))
    order_id = Column(String, nullable=True)
    broker = Column(String, nullable=False)
    symbol = Column(String, nullable=False)
    side = Column(String, nullable=False)
    quantity = Column(String, nullable=False)
    entry_price = Column(String, nullable=True)
    exit_price = Column(String, nullable=True)
    pnl = Column(String, nullable=True)
    pnl_pct = Column(String, nullable=True)
    fees = Column(String, nullable=True)
    holding_period_sec = Column(Integer, nullable=True)
    notes = Column(Text, nullable=True)
    outcome = Column(JSONType, nullable=True)
    created_at = Column(DateTime, default=now_ts, nullable=False)


class LossLesson(Base):
    __tablename__ = "loss_lessons"
    id = Column(String, primary_key=True, default=lambda: str(uuid.uuid4()))
    outcome_id = Column(String, nullable=False)
    summary = Column(Text, nullable=False)
    tags = Column(JSONType, nullable=True)
    created_at = Column(DateTime, default=now_ts, nullable=False)
