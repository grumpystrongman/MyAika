import hashlib
import math
import os
from typing import List

from ..config import settings

try:
    from sentence_transformers import SentenceTransformer
except Exception:
    SentenceTransformer = None

_model = None


def _hash_embedding(text: str, dim: int) -> List[float]:
    tokens = text.lower().split()
    vec = [0.0] * dim
    if not tokens:
        return vec
    for tok in tokens:
        h = hashlib.sha256(tok.encode("utf-8")).digest()
        for i in range(0, dim, 4):
            idx = int.from_bytes(h[(i // 4) % 8:(i // 4) % 8 + 2], "little", signed=False)
            vec[i] += (idx % 997) / 997.0
    norm = math.sqrt(sum(v * v for v in vec)) or 1.0
    return [v / norm for v in vec]


def _load_model():
    global _model
    if _model is None and SentenceTransformer:
        _model = SentenceTransformer(settings.embeddings_model)
    return _model


def embed_text(text: str) -> List[float]:
    provider = settings.embeddings_provider.lower()
    if provider in {"sentence_transformers", "st"} and SentenceTransformer:
        model = _load_model()
        if model:
            vec = model.encode([text], normalize_embeddings=True)[0]
            return vec.tolist()
    return _hash_embedding(text, settings.embeddings_dim)
