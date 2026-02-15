import os

from cryptography.fernet import Fernet


os.environ.setdefault("DATABASE_URL", "sqlite:///./test.db")
os.environ.setdefault("ASYNC_DATABASE_URL", "sqlite:///./test.db")
os.environ.setdefault("REDIS_URL", "")
os.environ.setdefault("TOKEN_ENCRYPTION_KEY", Fernet.generate_key().decode("utf-8"))
os.environ.setdefault("APPROVAL_SIGNING_KEY", "test-signing-key")
