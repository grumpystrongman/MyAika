from cryptography.fernet import Fernet, InvalidToken
from ..config import settings


class EncryptionError(RuntimeError):
    pass


def _get_fernet() -> Fernet:
    if not settings.token_encryption_key:
        raise EncryptionError("TOKEN_ENCRYPTION_KEY is required")
    return Fernet(settings.token_encryption_key.encode("utf-8"))


def encrypt_value(value: str) -> str:
    if value is None:
        return ""
    token = _get_fernet().encrypt(value.encode("utf-8"))
    return token.decode("utf-8")


def decrypt_value(value: str) -> str:
    if not value:
        return ""
    try:
        raw = _get_fernet().decrypt(value.encode("utf-8"))
        return raw.decode("utf-8")
    except InvalidToken as exc:
        raise EncryptionError("invalid_encryption_token") from exc
