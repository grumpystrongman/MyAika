from datetime import datetime, timezone
from sqlalchemy.orm import Session
from ..db.models import TradeApproval
from .policy import sign_approval


def create_approval(db: Session, action: str, payload: dict, requested_by: str) -> TradeApproval:
    approval = TradeApproval(
        action=action,
        payload=payload,
        requested_by=requested_by,
        status="pending",
        signature="",
    )
    db.add(approval)
    db.commit()
    db.refresh(approval)
    approval.signature = sign_approval(approval.id, payload)
    db.add(approval)
    db.commit()
    db.refresh(approval)
    return approval


def approve(db: Session, approval_id: str, approved_by: str) -> TradeApproval | None:
    record = db.query(TradeApproval).filter_by(id=approval_id).first()
    if not record:
        return None
    record.status = "approved"
    record.approved_by = approved_by
    record.approved_at = datetime.now(timezone.utc)
    db.add(record)
    db.commit()
    db.refresh(record)
    return record


def reject(db: Session, approval_id: str, approved_by: str) -> TradeApproval | None:
    record = db.query(TradeApproval).filter_by(id=approval_id).first()
    if not record:
        return None
    record.status = "rejected"
    record.approved_by = approved_by
    record.approved_at = datetime.now(timezone.utc)
    db.add(record)
    db.commit()
    db.refresh(record)
    return record
