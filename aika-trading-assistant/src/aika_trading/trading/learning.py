import re
from typing import Any
from sqlalchemy.orm import Session
from qdrant_client.http import models

from ..db.models import TradeOutcome, LossLesson
from ..knowledge.vector_store import KnowledgeStore
from ..knowledge.embeddings import embed_text

LOSS_TAGS = {
    "slippage": ["slippage", "spread", "liquidity"],
    "late_entry": ["late", "chased", "fomo"],
    "early_exit": ["early exit", "took profit early"],
    "overleveraged": ["leverage", "margin", "overleveraged"],
    "news": ["news", "headline", "earnings"],
    "volatility": ["volatility", "choppy", "whipsaw"],
    "position_size": ["oversized", "position size", "too big"],
}


def _extract_tags(text: str) -> list[str]:
    lower = text.lower()
    tags = []
    for tag, hints in LOSS_TAGS.items():
        if any(h in lower for h in hints):
            tags.append(tag)
    if re.search(r"stop[-\s]?loss", lower):
        tags.append("stop_loss")
    return sorted(set(tags))


def record_trade_outcome(db: Session, payload: dict[str, Any]) -> TradeOutcome:
    outcome = TradeOutcome(
        order_id=payload.get("order_id"),
        broker=payload.get("broker", "unknown"),
        symbol=payload.get("symbol", ""),
        side=payload.get("side", ""),
        quantity=str(payload.get("quantity", "")),
        entry_price=str(payload.get("entry_price")) if payload.get("entry_price") is not None else None,
        exit_price=str(payload.get("exit_price")) if payload.get("exit_price") is not None else None,
        pnl=str(payload.get("pnl")) if payload.get("pnl") is not None else None,
        pnl_pct=str(payload.get("pnl_pct")) if payload.get("pnl_pct") is not None else None,
        fees=str(payload.get("fees")) if payload.get("fees") is not None else None,
        holding_period_sec=payload.get("holding_period_sec"),
        notes=payload.get("notes"),
        outcome=payload.get("outcome"),
    )
    db.add(outcome)
    db.commit()
    db.refresh(outcome)
    return outcome


def create_loss_lesson(db: Session, outcome: TradeOutcome) -> LossLesson | None:
    try:
        pnl = float(outcome.pnl) if outcome.pnl is not None else 0.0
    except Exception:
        pnl = 0.0
    if pnl >= 0:
        return None
    notes = outcome.notes or ""
    summary = (
        f"Loss on {outcome.symbol} {outcome.side} {outcome.quantity}. "
        f"PnL {outcome.pnl}. Notes: {notes}"
    )
    tags = _extract_tags(summary)
    lesson = LossLesson(outcome_id=outcome.id, summary=summary, tags=tags)
    db.add(lesson)
    db.commit()
    db.refresh(lesson)

    try:
        store = KnowledgeStore()
        store.ensure_collection()
        vector = embed_text(summary)
        store.upsert([
            models.PointStruct(
                id=lesson.id,
                vector=vector,
                payload={
                    "type": "loss_lesson",
                    "outcome_id": outcome.id,
                    "symbol": outcome.symbol,
                    "side": outcome.side,
                    "pnl": outcome.pnl,
                    "summary": summary,
                    "tags": tags,
                }
            )
        ])
    except Exception:
        # Qdrant unavailable; keep lesson persisted in Postgres only.
        pass

    return lesson


def query_loss_lessons(question: str, limit: int = 5) -> list[dict[str, Any]]:
    try:
        store = KnowledgeStore()
        store.ensure_collection()
        vector = embed_text(question)
        results = store.query(vector, limit=limit)
        return [r for r in results if r.get("type") == "loss_lesson"]
    except Exception:
        return []
