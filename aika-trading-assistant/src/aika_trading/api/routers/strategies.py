from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session
from ..deps import get_db
from ...trading.strategies import register_strategy, list_strategies

router = APIRouter(prefix="/strategies", tags=["strategies"])


@router.get("")
def list_all(db: Session = Depends(get_db)):
    return {"strategies": list_strategies(db)}


@router.post("")
def register(payload: dict, db: Session = Depends(get_db)):
    record = register_strategy(db, payload.get("name", ""), payload.get("version", ""), payload)
    return {"strategy": record}
