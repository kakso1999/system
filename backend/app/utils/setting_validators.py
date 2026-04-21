"""Per-key validation for system_settings PUT writes.

Keys with no registered validator are accepted as-is (backward compatibility
with the long list of settings seeded in main.py). Keys with a registered
validator enforce type + range + scheme constraints so bad admin input can't
crash the runtime or enable stored-XSS via dangerous URL schemes.
"""
from __future__ import annotations

from typing import Any, Callable
from urllib.parse import urlparse

from fastapi import HTTPException, status


def _bool(raw: Any) -> bool:
    if isinstance(raw, bool):
        return raw
    raise HTTPException(status_code=422, detail="Value must be true or false")


def _str_optional(max_len: int = 500) -> Callable[[Any], str]:
    def _v(raw: Any) -> str:
        if raw is None:
            return ""
        if not isinstance(raw, str):
            raise HTTPException(status_code=422, detail="Value must be a string")
        if len(raw) > max_len:
            raise HTTPException(status_code=422, detail=f"Value exceeds {max_len} characters")
        return raw.strip()

    return _v


def _int_range(min_value: int, max_value: int) -> Callable[[Any], int]:
    def _v(raw: Any) -> int:
        if isinstance(raw, bool):
            raise HTTPException(status_code=422, detail="Value must be an integer, not a boolean")
        try:
            coerced = int(raw)
        except (TypeError, ValueError):
            raise HTTPException(status_code=422, detail="Value must be an integer")
        if coerced < min_value or coerced > max_value:
            raise HTTPException(
                status_code=422,
                detail=f"Value must be between {min_value} and {max_value}",
            )
        return coerced

    return _v


def _float_range(min_value: float, max_value: float) -> Callable[[Any], float]:
    def _v(raw: Any) -> float:
        if isinstance(raw, bool):
            raise HTTPException(status_code=422, detail="Value must be numeric, not a boolean")
        try:
            coerced = float(raw)
        except (TypeError, ValueError):
            raise HTTPException(status_code=422, detail="Value must be numeric")
        if coerced < min_value or coerced > max_value:
            raise HTTPException(
                status_code=422,
                detail=f"Value must be between {min_value} and {max_value}",
            )
        return coerced

    return _v


_SAFE_SCHEMES = {"http", "https"}


def _safe_url_optional(raw: Any) -> str:
    if raw is None:
        return ""
    if not isinstance(raw, str):
        raise HTTPException(status_code=422, detail="URL must be a string")
    value = raw.strip()
    if value == "":
        return ""
    if len(value) > 500:
        raise HTTPException(status_code=422, detail="URL exceeds 500 characters")
    parsed = urlparse(value)
    if parsed.scheme.lower() not in _SAFE_SCHEMES:
        raise HTTPException(status_code=422, detail="URL scheme must be http or https")
    if not parsed.netloc:
        raise HTTPException(status_code=422, detail="URL must include a host")
    return value


_VALIDATORS: dict[str, Callable[[Any], Any]] = {
    "project_name": _str_optional(120),
    "activity_title": _str_optional(120),
    "activity_desc": _str_optional(500),
    "default_redirect_url": _safe_url_optional,
    "customer_service_enabled": _bool,
    "customer_service_whatsapp": _safe_url_optional,
    "customer_service_telegram": _safe_url_optional,
    "sms_cooldown_sec": _int_range(0, 3600),
    "phone_daily_limit": _int_range(1, 1000),
    "ip_daily_limit": _int_range(1, 10000),
    "ip_window_min": _int_range(1, 1440),
    "live_qr_enabled": _bool,
    "live_pin_max_fails": _int_range(1, 100),
    "live_qr_expires_sec": _int_range(30, 86400),
    "promo_session_expires_min": _int_range(1, 1440),
    "risk_phone_unique": _bool,
    "risk_ip_unique": _bool,
    "risk_device_unique": _bool,
    "sms_verification": _bool,
}


def validate_setting_value(key: str, raw_value: Any) -> Any:
    validator = _VALIDATORS.get(key)
    if validator is None:
        return raw_value
    return validator(raw_value)
