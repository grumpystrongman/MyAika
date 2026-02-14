from celery import Celery
from ..config import settings

celery_app = Celery(
    "aika_trading",
    broker=settings.redis_url,
    backend=settings.redis_url,
    include=["aika_trading.worker.tasks"],
)

celery_app.conf.update(
    task_serializer="json",
    accept_content=["json"],
    result_serializer="json",
    timezone="UTC",
    enable_utc=True,
)
