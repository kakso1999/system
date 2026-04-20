import random
import string
from datetime import datetime, timezone

from bson import ObjectId
from bson.errors import InvalidId
from fastapi import APIRouter, Depends, HTTPException, status
from motor.motor_asyncio import AsyncIOMotorDatabase
from pymongo.errors import DuplicateKeyError

from app.database import get_db
from app.dependencies import get_current_staff
from app.routers.user_flow import validate_phone
from app.schemas.common import MessageResponse, TokenResponse, RefreshRequest
from app.schemas.staff import (
    ChangePasswordRequest,
    LoginRequest,
    StaffRegisterRequest,
)
from app.utils.security import create_access_token, create_refresh_token, decode_token, hash_password, verify_password

router = APIRouter()

STAFF_STATS_TEMPLATE = {
    "total_scans": 0,
    "total_valid": 0,
    "total_commission": 0.0,
    "team_size": 0,
    "level1_count": 0,
    "level2_count": 0,
    "level3_count": 0,
}


async def ensure_unique_staff_fields(
    db: AsyncIOMotorDatabase,
    username: str,
    phone: str,
    exclude_id: ObjectId | None = None,
) -> None:
    username_query = {"username": username}
    phone_query = {"phone": phone}
    if exclude_id:
        username_query["_id"] = {"$ne": exclude_id}
        phone_query["_id"] = {"$ne": exclude_id}
    if await db.staff_users.find_one(username_query):
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="Username already exists")
    if await db.staff_users.find_one(phone_query):
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="Phone already exists")


async def generate_invite_code(db: AsyncIOMotorDatabase) -> str:
    alphabet = string.ascii_uppercase + string.digits
    for _ in range(10):
        code = "".join(random.choices(alphabet, k=6))
        if not await db.staff_users.find_one({"invite_code": code}):
            return code
    raise HTTPException(status_code=status.HTTP_500_INTERNAL_SERVER_ERROR, detail="Failed to generate invite code")


def generate_staff_no() -> str:
    return f"S{datetime.now(timezone.utc).strftime('%Y%m%d%H%M%S%f')[:-3]}"


def build_staff_document(
    *,
    name: str,
    phone: str,
    username: str,
    password: str,
    invite_code: str,
    staff_no: str,
    created_at: datetime,
    status_value: str,
    parent_id: ObjectId | None = None,
    campaign_id: ObjectId | None = None,
) -> dict:
    return {
        "staff_no": staff_no,
        "name": name,
        "phone": phone,
        "username": username,
        "password_hash": hash_password(password),
        "status": status_value,
        "vip_level": 0,
        "invite_code": invite_code,
        "parent_id": parent_id,
        "campaign_id": campaign_id,
        "stats": STAFF_STATS_TEMPLATE.copy(),
        "created_at": created_at,
        "updated_at": created_at,
    }


async def create_relation_records(
    db: AsyncIOMotorDatabase,
    staff_id: ObjectId,
    parent_id: ObjectId | None,
    created_at: datetime,
) -> list[dict]:
    if not parent_id:
        return []
    relations = [{"staff_id": staff_id, "ancestor_id": parent_id, "level": 1, "created_at": created_at}]
    cursor = db.staff_relations.find({"staff_id": parent_id, "level": {"$lte": 2}})
    async for item in cursor:
        relations.append(
            {
                "staff_id": staff_id,
                "ancestor_id": item["ancestor_id"],
                "level": item["level"] + 1,
                "created_at": created_at,
            }
        )
    await db.staff_relations.insert_many(relations)
    for item in relations:
        await db.staff_users.update_one(
            {"_id": item["ancestor_id"]},
            {"$inc": {"stats.team_size": 1, f"stats.level{item['level']}_count": 1}},
        )
    return relations


@router.post("/login", response_model=TokenResponse)
async def login(
    payload: LoginRequest,
    db: AsyncIOMotorDatabase = Depends(get_db),
) -> TokenResponse:
    staff = await db.staff_users.find_one({"username": payload.username})
    if not staff or not verify_password(payload.password, staff["password_hash"]):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid username or password",
        )
    if staff.get("status") != "active":
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Account is not active")
    now = datetime.now(timezone.utc)
    await db.staff_users.update_one(
        {"_id": staff["_id"]},
        {"$set": {"last_login_at": now, "updated_at": now}},
    )
    token = create_access_token({"sub": str(staff["_id"]), "role": "staff"})
    refresh = create_refresh_token({"sub": str(staff["_id"]), "role": "staff"})
    return TokenResponse(access_token=token, refresh_token=refresh, role="staff")


@router.post("/refresh", response_model=TokenResponse)
async def refresh(
    payload: RefreshRequest,
    db: AsyncIOMotorDatabase = Depends(get_db),
) -> TokenResponse:
    data = decode_token(payload.refresh_token)
    if not data or data.get("role") != "staff":
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid refresh token")
    subject = data.get("sub")
    if not isinstance(subject, str) or not subject:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid refresh token")
    try:
        staff_id = ObjectId(subject)
    except (InvalidId, TypeError):
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid refresh token")
    staff = await db.staff_users.find_one({"_id": staff_id})
    if not staff or staff.get("status") != "active":
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Staff not found or inactive")
    token = create_access_token({"sub": str(staff["_id"]), "role": "staff"})
    refresh_tok = create_refresh_token({"sub": str(staff["_id"]), "role": "staff"})
    return TokenResponse(access_token=token, refresh_token=refresh_tok, role="staff")


@router.post("/register", response_model=MessageResponse)
async def register(
    payload: StaffRegisterRequest,
    db: AsyncIOMotorDatabase = Depends(get_db),
) -> MessageResponse:
    phone = validate_phone(payload.phone)
    await ensure_unique_staff_fields(db, payload.username, phone)
    parent = None
    if payload.invite_code:
        parent = await db.staff_users.find_one({"invite_code": payload.invite_code.upper()})
        if not parent:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Invite code not found")
    if await db.staff_registration_applications.find_one(
        {"username": payload.username, "status": {"$in": ["pending", "approved"]}},
        {"_id": 1},
    ):
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="Username already applied")
    if await db.staff_registration_applications.find_one(
        {"phone": phone, "status": {"$in": ["pending", "approved"]}},
        {"_id": 1},
    ):
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="Phone already applied")
    created_at = datetime.now(timezone.utc)
    document = {
        "name": payload.name,
        "phone": phone,
        "username": payload.username,
        "password_hash": hash_password(payload.password),
        "invite_code": payload.invite_code.upper() if payload.invite_code else None,
        "status": "pending",
        "rejection_reason": "",
        "applied_at": created_at,
        "reviewed_at": None,
        "reviewed_by_admin_id": None,
        "approved_staff_id": None,
    }
    try:
        await db.staff_registration_applications.insert_one(document)
    except DuplicateKeyError as exc:
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="Username or phone already applied") from exc
    return MessageResponse(message="Registration submitted, pending admin approval")


@router.post("/password", response_model=MessageResponse)
async def change_password(
    payload: ChangePasswordRequest,
    current_staff: dict = Depends(get_current_staff),
    db: AsyncIOMotorDatabase = Depends(get_db),
) -> MessageResponse:
    if not verify_password(payload.old_password, current_staff["password_hash"]):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Old password is incorrect",
        )
    await db.staff_users.update_one(
        {"_id": current_staff["_id"]},
        {
            "$set": {
                "password_hash": hash_password(payload.new_password),
                "updated_at": datetime.now(timezone.utc),
            }
        },
    )
    return MessageResponse(message="Password updated successfully")
