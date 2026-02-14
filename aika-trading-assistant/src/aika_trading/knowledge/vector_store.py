from typing import Any
from qdrant_client import QdrantClient
from qdrant_client.http import models
from ..config import settings


class KnowledgeStore:
    def __init__(self) -> None:
        self.client = QdrantClient(url=settings.qdrant_url, api_key=settings.qdrant_api_key or None)
        self.collection = settings.qdrant_collection

    def ensure_collection(self, vector_size: int | None = None) -> None:
        size = vector_size or settings.embeddings_dim
        collections = self.client.get_collections().collections
        if any(c.name == self.collection for c in collections):
            return
        self.client.create_collection(
            collection_name=self.collection,
            vectors_config=models.VectorParams(size=size, distance=models.Distance.COSINE),
        )

    def upsert(self, points: list[models.PointStruct]) -> None:
        self.client.upsert(collection_name=self.collection, points=points)

    def query(self, vector: list[float], limit: int = 5) -> list[dict[str, Any]]:
        results = self.client.search(collection_name=self.collection, query_vector=vector, limit=limit)
        return [r.payload or {} for r in results]
