import hashlib
import hmac
import secrets
from datetime import datetime, timezone

from app.config import get_settings


def generate_token_signature(staff_id: str, qr_version: int) -> str:
    """HMAC-SHA256 with JWT_SECRET_KEY as key."""
    settings = get_settings()
    ts_ms = int(datetime.now(timezone.utc).timestamp() * 1000)
    msg = f"{staff_id}:{qr_version}:{ts_ms}".encode("utf-8")
    key = settings.JWT_SECRET_KEY.encode("utf-8")
    return hmac.new(key, msg, hashlib.sha256).hexdigest()


def generate_pin() -> str:
    """Return 3-digit PIN, zero-padded."""
    return f"{secrets.randbelow(1000):03d}"


def generate_session_token() -> str:
    return secrets.token_hex(32)
