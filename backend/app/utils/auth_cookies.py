"""HttpOnly auth-cookie helpers for admin & staff sessions.

Cookie names follow `gr_{role}_token` (access JWT) and `gr_{role}_refresh`
(refresh JWT). Both are HttpOnly; Secure + SameSite come from config so dev
can run on plain HTTP while prod enforces Secure.
"""
from __future__ import annotations

from typing import Literal

from fastapi import Response

from app.config import get_settings
from app.utils.csrf import CSRF_COOKIE_NAME, clear_csrf_cookie, set_csrf_cookie

Role = Literal["admin", "staff"]

ACCESS_COOKIE_TEMPLATE = "gr_{role}_token"
REFRESH_COOKIE_TEMPLATE = "gr_{role}_refresh"


def access_cookie_name(role: Role) -> str:
    return ACCESS_COOKIE_TEMPLATE.format(role=role)


def refresh_cookie_name(role: Role) -> str:
    return REFRESH_COOKIE_TEMPLATE.format(role=role)


def _cookie_kwargs() -> dict:
    settings = get_settings()
    samesite = settings.COOKIE_SAMESITE.lower()
    if samesite not in {"lax", "strict", "none"}:
        samesite = "lax"
    return {
        "httponly": True,
        "secure": bool(settings.COOKIE_SECURE),
        "samesite": samesite,
        "path": "/",
    }


def set_auth_cookies(
    response: Response,
    role: Role,
    access_token: str,
    refresh_token: str | None,
) -> None:
    """Write access + refresh HttpOnly cookies on the response."""
    settings = get_settings()
    base = _cookie_kwargs()
    response.set_cookie(
        key=access_cookie_name(role),
        value=access_token,
        max_age=settings.ACCESS_TOKEN_EXPIRE_MINUTES * 60,
        **base,
    )
    if refresh_token:
        response.set_cookie(
            key=refresh_cookie_name(role),
            value=refresh_token,
            max_age=settings.REFRESH_TOKEN_EXPIRE_DAYS * 24 * 60 * 60,
            **base,
        )


def clear_auth_cookies(response: Response, role: Role) -> None:
    """Remove access + refresh cookies by re-setting with Max-Age=0."""
    base = _cookie_kwargs()
    for key in (access_cookie_name(role), refresh_cookie_name(role)):
        response.set_cookie(key=key, value="", max_age=0, **base)
    clear_csrf_cookie(response)
