from datetime import datetime, timezone

from fastapi import APIRouter, Cookie, Depends, HTTPException, Request, Response, status
from motor.motor_asyncio import AsyncIOMotorDatabase
from bson import ObjectId
from bson.errors import InvalidId

from app.config import get_settings
from app.database import get_db
from app.dependencies import get_current_admin
from app.schemas.common import MessageResponse, TokenResponse, RefreshRequest
from app.schemas.staff import ChangePasswordRequest, LoginRequest
from app.utils.auth_cookies import clear_auth_cookies, refresh_cookie_name, set_auth_cookies
from app.utils.security import create_access_token, create_refresh_token, decode_token, hash_password, verify_password

router = APIRouter()


@router.post("/login", response_model=TokenResponse)
async def login(
    payload: LoginRequest,
    response: Response,
    db: AsyncIOMotorDatabase = Depends(get_db),
) -> TokenResponse:
    admin = await db.admins.find_one({"username": payload.username})
    if not admin or not verify_password(payload.password, admin["password_hash"]):
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
        {"$set": {"password_hash": hash_password(payload.new_password)}},
    )
    return MessageResponse(message="Password updated successfully")


@router.post("/logout", response_model=MessageResponse)
async def logout(response: Response) -> MessageResponse:
    clear_auth_cookies(response, "admin")
    return MessageResponse(message="Logged out")
