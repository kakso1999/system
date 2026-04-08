from fastapi import APIRouter, Depends, HTTPException, status
from motor.motor_asyncio import AsyncIOMotorDatabase

from app.database import get_db
from app.dependencies import get_current_admin
from app.schemas.common import MessageResponse, TokenResponse
from app.schemas.staff import ChangePasswordRequest, LoginRequest
from app.utils.security import create_access_token, hash_password, verify_password

router = APIRouter()


@router.post("/login", response_model=TokenResponse)
async def login(
    payload: LoginRequest,
    db: AsyncIOMotorDatabase = Depends(get_db),
) -> TokenResponse:
    admin = await db.admins.find_one({"username": payload.username})
    if not admin or not verify_password(payload.password, admin["password_hash"]):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid username or password",
        )
    token = create_access_token({"sub": str(admin["_id"]), "role": "admin"})
    return TokenResponse(access_token=token, role="admin")


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
