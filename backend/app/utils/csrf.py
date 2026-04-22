"""CSRF token helpers for cookie-authenticated mutating endpoints.

Pattern: after login, the server sets a non-HttpOnly cookie `gr_csrf`
containing a random token. On every POST/PUT/DELETE/PATCH, the frontend
reads that cookie and sends the value in an `X-CSRF-Token` header. The
server compares header vs cookie; mismatch -> 403.

Using double-submit cookie pattern: server never stores the token, just
verifies header == cookie. Safe because HttpOnly access token + cookie
`gr_csrf` (non-HttpOnly) + Origin+Referer attacker can't synchronously
forge both header and cookie cross-origin.
"""
from __future__ import annotations

import secrets
from typing import Optional

from fastapi import Cookie, Header, HTTPException, Request, Response, status

from app.config import get_settings

CSRF_COOKIE_NAME = "gr_csrf"
CSRF_HEADER_NAME = "X-CSRF-Token"


def generate_csrf_token() -> str:
    return secrets.token_urlsafe(32)


def _csrf_cookie_kwargs() -> dict:
    settings = get_settings()
    samesite = settings.COOKIE_SAMESITE.lower()
    if samesite not in {"lax", "strict", "none"}:
        samesite = "lax"
    return {
        # non-HttpOnly on purpose: frontend JS must read it to echo in header
        "httponly": False,
        "secure": bool(settings.COOKIE_SECURE),
        "samesite": samesite,
        "path": "/",
    }


def set_csrf_cookie(response: Response, token: Optional[str] = None) -> str:
    token = token or generate_csrf_token()
    kwargs = _csrf_cookie_kwargs()
    response.set_cookie(
        key=CSRF_COOKIE_NAME,
        value=token,
        max_age=24 * 60 * 60,
        **kwargs,
    )
    return token


def clear_csrf_cookie(response: Response) -> None:
    kwargs = _csrf_cookie_kwargs()
    response.set_cookie(key=CSRF_COOKIE_NAME, value="", max_age=0, **kwargs)


async def require_csrf(
    request: Request,
    x_csrf_token: Optional[str] = Header(None, alias=CSRF_HEADER_NAME),
    gr_csrf: Optional[str] = Cookie(None, alias=CSRF_COOKIE_NAME),
) -> None:
    """FastAPI dependency enforcing CSRF double-submit.

    Only enforces on state-changing methods (POST/PUT/PATCH/DELETE) AND
    only when the request carries a session cookie (indicating cookie auth).
    Bearer-only clients are exempt — they already can't be CSRF'd.
    """
    method = request.method.upper()
    if method in ("GET", "HEAD", "OPTIONS"):
        return
    has_session_cookie = any(
        request.cookies.get(name) for name in ("gr_admin_token", "gr_staff_token", "gr_admin_refresh", "gr_staff_refresh")
    )
    if not has_session_cookie:
        return
    if not x_csrf_token or not gr_csrf:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail={"code": "csrf_required"})
    if not secrets.compare_digest(x_csrf_token, gr_csrf):
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail={"code": "csrf_invalid"})
