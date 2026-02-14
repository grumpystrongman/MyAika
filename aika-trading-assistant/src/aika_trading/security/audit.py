import hashlib
import json
from datetime import datetime
from typing import Any
from sqlalchemy.orm import Session
from ..db.models import AuditEvent


def _canonical(payload: dict[str, Any]) -> str:
    return json.dumps(payload, sort_keys=True, separators=(",", ":"))


def append_audit_event(db: Session, action: str, decision: str, detail: dict[str, Any]) -> AuditEvent:
    prev = db.query(AuditEvent).order_by(AuditEvent.ts.desc()).first()
    prev_hash = prev.hash if prev else ""
    base = {
        "ts": datetime.utcnow().isoformat(),
        "action": action,
        "decision": decision,
        "detail": detail,
        "prev_hash": prev_hash,
    }
    hash_value = hashlib.sha256((prev_hash + _canonical(base)).encode("utf-8")).hexdigest()
    event = AuditEvent(
        action=action,
        decision=decision,
        detail=detail,
        prev_hash=prev_hash,
        hash=hash_value,
    )
    db.add(event)
    db.commit()
    db.refresh(event)
    return event


def verify_audit_chain(db: Session) -> bool:
    rows = db.query(AuditEvent).order_by(AuditEvent.ts.asc()).all()
    prev_hash = ""
    for row in rows:
        base = {
            "ts": row.ts.isoformat(),
            "action": row.action,
            "decision": row.decision,
            "detail": row.detail,
            "prev_hash": row.prev_hash,
        }
        expected = hashlib.sha256((prev_hash + _canonical(base)).encode("utf-8")).hexdigest()
        if expected != row.hash:
            return False
        prev_hash = row.hash
    return True
