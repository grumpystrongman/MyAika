from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from ..deps import get_db
from ...security.approvals import approve, reject
from ...db.models import TradeApproval

router = APIRouter(prefix="/approvals", tags=["approvals"])


@router.get("")
def list_approvals(db: Session = Depends(get_db)):
    rows = db.query(TradeApproval).order_by(TradeApproval.created_at.desc()).all()
    return {"approvals": rows}


@router.post("/{approval_id}/approve")
def approve_approval(approval_id: str, db: Session = Depends(get_db)):
    record = approve(db, approval_id, "admin")
    if not record:
        raise HTTPException(status_code=404, detail="approval_not_found")
    return {"approval": record}


@router.post("/{approval_id}/reject")
def reject_approval(approval_id: str, db: Session = Depends(get_db)):
    record = reject(db, approval_id, "admin")
    if not record:
        raise HTTPException(status_code=404, detail="approval_not_found")
    return {"approval": record}
