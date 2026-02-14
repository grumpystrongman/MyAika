from .base import OAuthClient
from ..config import settings


schwab_oauth = OAuthClient(
    provider="schwab",
    auth_url=settings.schwab_auth_url,
    token_url=settings.schwab_token_url,
    revoke_url=settings.schwab_revoke_url,
)
