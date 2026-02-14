from .base import OAuthClient
from ..config import settings


coinbase_oauth = OAuthClient(
    provider="coinbase",
    auth_url=settings.coinbase_auth_url,
    token_url=settings.coinbase_token_url,
    revoke_url=settings.coinbase_revoke_url,
)
