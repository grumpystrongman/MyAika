from .base import OAuthClient
from ..config import settings


alpaca_oauth = OAuthClient(
    provider="alpaca",
    auth_url=settings.alpaca_auth_url,
    token_url=settings.alpaca_token_url,
    revoke_url=settings.alpaca_revoke_url,
)
