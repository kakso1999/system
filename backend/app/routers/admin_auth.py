from datetime import datetime, timedelta, timezone

from fastapi import APIRouter, Cookie, Depends, HTTPException, Request, Response, status
from motor.motor_asyncio import AsyncIOMotorDatabase
from bson import ObjectId
from bson.errors import InvalidId

from app.config import get_settings
from app.database import get_db
from app.dependencies import get_current_admin
from app.schemas.common import MessageResponse, TokenResponse, RefreshRequest
from app.schemas.staff import ChangePasswordRequest, LoginRequest
from app.utils.auth_cookies import (
    access_cookie_name,
    clear_auth_cookies,
    refresh_cookie_name,
    set_auth_cookies,
    set_csrf_cookie,
)
from app.utils.csrf import clear_csrf_cookie
from app.utils.request_ip import extract_client_ip
from app.utils.security import create_access_token, create_refresh_token, decode_token, hash_password, verify_password
from app.utils.token_revocation import is_revoked, revoke

router = APIRouter()


async def _enforce_login_throttle(db, ip: str, username: str, role: str) -> None:
    """Throttle login attempts. Mirrors PIN verify pattern from user_flow.py."""
    now = datetime.now(timezone.utc)
    window = now - timedelta(minutes=5)
    per_ip = await db.risk_logs.count_documents({
        "ip": ip,
        "type": f"{role}_login_fail",
        "created_at": {"$gte": window},
    })
    if per_ip >= 30:
        raise HTTPException(
            status_code=status.HTTP_429_TOO_MANY_REQUESTS,
            detail={"code": "rate_limited", "message": "Too many login attempts, try again later."},
        )
    per_user = await db.risk_logs.count_documents({
        "username": username,
        "type": f"{role}_login_fail",
        "created_at": {"$gte": window},
    })
    if per_user >= 10:
        raise HTTPException(
            status_code=status.HTTP_429_TOO_MANY_REQUESTS,
            detail={"code": "rate_limited", "message": "Account temporarily locked due to failed login attempts."},
        )


async def _record_login_failure(db, ip: str, username: str, role: str) -> None:
    await db.risk_logs.insert_one({
        "ip": ip,
        "type": f"{role}_login_fail",
        "username": username,
        "created_at": datetime.now(timezone.utc),
    })


def _extract_bearer_token(request: Request) -> str | None:
    auth_header = request.headers.get("authorization", "")
    scheme, _, token = auth_header.partition(" ")
    if scheme.lower() != "bearer":
        return None
    token = token.strip()
    return token or None


def _extract_logout_tokens(request: Request) -> list[str]:
    tokens: list[str] = []
    for raw in (
        _extract_bearer_token(request),
        request.cookies.get(access_cookie_name("admin")),
        request.cookies.get(refresh_cookie_name("admin")),
    ):
        if raw and raw not in tokens:
            tokens.append(raw)
    return tokens


@router.post("/login", response_model=TokenResponse)
async def login(
    payload: LoginRequest,
    request: Request,
    response: Response,
    db: AsyncIOMotorDatabase = Depends(get_db),
) -> TokenResponse:
    ip = extract_client_ip(request)
    await _enforce_login_throttle(db, ip, payload.username, "admin")
    admin = await db.admins.find_one({"username": payload.username})
    if not admin or not verify_password(payload.password, admin["password_hash"]):
        await _record_login_failure(db, ip, payload.username, "admin")
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid username or password",
        )
    if admin.get("status") == "disabled":
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Account disabled")
    now = datetime.now(timezone.utc)
    await db.admins.update_one({"_id": admin["_id"]}, {"$set": {"last_login_at": now}})
    token = create_access_token({"sub": str(admin["_id"]), "role": "admin"})
    refresh = create_refresh_token({"sub": str(admin["_id"]), "role": "admin"})
    set_auth_cookies(response, "admin", token, refresh)
    set_csrf_cookie(response)
    return TokenResponse(
        access_token=token,
        refresh_token=refresh,
        role="admin",
        must_change_password=admin.get("must_change_password", False),
    )


@router.post("/refresh", response_model=TokenResponse)
async def refresh(
    response: Response,
    payload: RefreshRequest | None = None,
    gr_admin_refresh: str | None = Cookie(None),
    db: AsyncIOMotorDatabase = Depends(get_db),
) -> TokenResponse:
    raw_refresh = gr_admin_refresh or (payload.refresh_token if payload else None)
    if not raw_refresh:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Missing refresh token")
    data = decode_token(raw_refresh)
    if not data or data.get("role") != "admin":
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid refresh token")
    if await is_revoked(db, data.get("jti")):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail={"code": "token_revoked"},
        )
    subject = data.get("sub")
    if not isinstance(subject, str) or not subject:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid refresh token")
    try:
        admin_id = ObjectId(subject)
    except (InvalidId, TypeError):
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid refresh token")
    admin = await db.admins.find_one({"_id": admin_id})
    if not admin:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Admin not found")
    token = create_access_token({"sub": str(admin["_id"]), "role": "admin"})
    refresh_tok = create_refresh_token({"sub": str(admin["_id"]), "role": "admin"})
    set_auth_cookies(response, "admin", token, refresh_tok)
    set_csrf_cookie(response)
    return TokenResponse(access_token=token, refresh_token=refresh_tok, role="admin")


@router.post("/password", response_model=MessageResponse)
async def change_password(
    payload: ChangePasswordRequest,
    current_admin: dict = Depends(get_current_admin),
    db: AsyncIOMotorDatabase = Depends(get_db),
) -> MessageResponse:
    if not verify_password(payload.old_password, current_admin["password_hash"]):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Old password is incorrect",
        )
    await db.admins.update_one(
        {"_id": current_admin["_id"]},
        {"$set": {"password_hash": hash_password(payload.new_password), "must_change_password": False}},
    )
    return MessageResponse(message="Password updated successfully")


@router.post("/logout", response_model=MessageResponse)
async def logout(
    response: Response,
    request: Request,
    current_admin: dict = Depends(get_current_admin),
    db: AsyncIOMotorDatabase = Depends(get_db),
) -> MessageResponse:
    for raw_token in _extract_logout_tokens(request):
        payload = decode_token(raw_token)
        if payload:
            await revoke(db, payload.get("jti"), payload.get("exp"))
    await db.admins.update_one(
        {"_id": current_admin["_id"]},
        {"$set": {"last_logout_at": datetime.now(timezone.utc)}},
    )
    clear_auth_cookies(response, "admin")
    clear_csrf_cookie(response)
    return MessageResponse(message="Logged out")
