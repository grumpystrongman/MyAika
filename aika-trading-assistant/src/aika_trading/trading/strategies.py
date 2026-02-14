from sqlalchemy.orm import Session
from ..db.models import Strategy


def register_strategy(db: Session, name: str, version: str, spec: dict) -> Strategy:
    record = Strategy(name=name, version=version, spec=spec)
    db.add(record)
    db.commit()
    db.refresh(record)
    return record


def list_strategies(db: Session) -> list[Strategy]:
    return db.query(Strategy).order_by(Strategy.created_at.desc()).all()
