from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from ..deps import get_db
from ...security.policy import PolicyEngine
from ...security.approvals import create_approval
from ...security.audit import append_audit_event
from ...security.token_store import get_token
from ...connectors.coinbase import CoinbaseClient
from ...connectors.alpaca import AlpacaConnector
from ...connectors.schwab import SchwabConnector
from ...trading.execution import propose_trade, execute_trade
from ...trading.learning import record_trade_outcome, create_loss_lesson, query_loss_lessons
from ...db.models import TradeApproval

router = APIRouter(prefix="/trades", tags=["trades"])
policy = PolicyEngine()


def _connector_from_payload(db: Session, payload: dict):
    broker = payload.get("broker")
    subject = payload.get("subject", "local")
    if broker == "coinbase":
        token = get_token(db, "coinbase", subject)
        if not token:
            raise HTTPException(status_code=404, detail="coinbase_token_missing")
        return CoinbaseClient(token["access_token"])
    if broker == "schwab":
        token = get_token(db, "schwab", subject)
        if not token:
            raise HTTPException(status_code=404, detail="schwab_token_missing")
        return SchwabConnector(token["access_token"])
    if broker == "alpaca":
        return AlpacaConnector()
    raise HTTPException(status_code=400, detail="unknown_broker")


@router.post("/propose")
def propose(payload: dict, db: Session = Depends(get_db)):
    requested_by = payload.get("requested_by", "local")
    decision = policy.evaluate_trade("trade.place", payload)
    result = propose_trade(db, policy, payload, requested_by)
    return {
        "decision": decision.decision,
        "order_id": result.get("order_id"),
        "approval": result.get("approval").id if result.get("approval") else None,
    }


@router.post("/execute")
def execute(payload: dict, db: Session = Depends(get_db)):
    order_id = payload.get("order_id")
    approval_id = payload.get("approval_id")
    if not order_id:
        raise HTTPException(status_code=400, detail="order_id_required")
    if not approval_id:
        raise HTTPException(status_code=400, detail="approval_id_required")

    approval = db.query(TradeApproval).filter_by(id=approval_id).first()
    if not approval or approval.status != "approved":
        raise HTTPException(status_code=403, detail="approval_not_granted")

    connector = _connector_from_payload(db, payload)
    result = execute_trade(db, connector, order_id, payload)
    append_audit_event(db, "trade.execute", "allow", {"order_id": order_id, "approval_id": approval_id})
    return result


@router.post("/outcome")
def record_outcome(payload: dict, db: Session = Depends(get_db)):
    outcome = record_trade_outcome(db, payload)
    lesson = create_loss_lesson(db, outcome)
    return {
        "outcome_id": outcome.id,
        "lesson_id": lesson.id if lesson else None,
        "lesson_summary": lesson.summary if lesson else None
    }


@router.post("/lessons/query")
def lessons_query(payload: dict):
    question = payload.get("question", "")
    if not question:
        raise HTTPException(status_code=400, detail="question_required")
    limit = int(payload.get("limit") or 5)
    lessons = query_loss_lessons(question, limit=limit)
    return {"lessons": lessons}


@router.post("/positions")
def positions(payload: dict, db: Session = Depends(get_db)):
    connector = _connector_from_payload(db, payload)
    return {"positions": connector.get_positions()}


@router.post("/account")
def account(payload: dict, db: Session = Depends(get_db)):
    connector = _connector_from_payload(db, payload)
    return connector.get_account()


@router.post("/cancel")
def cancel(payload: dict, db: Session = Depends(get_db)):
    order_id = payload.get("order_id")
    if not order_id:
        raise HTTPException(status_code=400, detail="order_id_required")
    connector = _connector_from_payload(db, payload)
    result = connector.cancel_order(order_id)
    append_audit_event(db, "trade.cancel", "allow", {"order_id": order_id})
    return result
