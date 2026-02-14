import hashlib
import json
from sqlalchemy.orm import Session
from ..db.models import Order
from ..security.policy import PolicyEngine
from ..security.approvals import create_approval
from ..security.audit import append_audit_event
from ..connectors.base import BrokerConnector


def _idempotency_key(payload: dict) -> str:
    raw = json.dumps(payload, sort_keys=True).encode("utf-8")
    return hashlib.sha256(raw).hexdigest()


def propose_trade(db: Session, policy: PolicyEngine, payload: dict, requested_by: str) -> dict:
    decision = policy.evaluate_trade("trade.place", payload)
    order_key = payload.get("idempotency_key") or _idempotency_key(payload)
    existing = db.query(Order).filter_by(idempotency_key=order_key).first()
    if existing:
        return {"status": "duplicate", "order_id": existing.id}

    order = Order(
        broker=payload.get("broker", "unknown"),
        symbol=payload.get("symbol", ""),
        side=payload.get("side", ""),
        quantity=str(payload.get("quantity", "")),
        status="pending_approval" if decision.requires_approval else "approved",
        idempotency_key=order_key,
    )
    db.add(order)
    db.commit()
    db.refresh(order)

    append_audit_event(db, "trade.place", decision.decision, {"order_id": order.id, "risk": decision.risk_score})

    approval = None
    if decision.requires_approval:
        approval = create_approval(db, "trade.place", payload, requested_by)
    return {"decision": decision.decision, "order_id": order.id, "approval": approval}


def execute_trade(db: Session, connector: BrokerConnector, order_id: str, payload: dict) -> dict:
    order = db.query(Order).filter_by(id=order_id).first()
    if not order:
        raise RuntimeError("order_not_found")
    if order.status == "executed":
        return {"status": "executed", "external_id": order.external_id}
    result = connector.place_order(payload)
    order.status = "executed"
    order.external_id = result.get("order_id") or result.get("id")
    db.add(order)
    db.commit()
    append_audit_event(db, "trade.execute", "allow", {"order_id": order.id})
    return {"status": "executed", "external_id": order.external_id}
