import math
from datetime import datetime, timezone

from bson import ObjectId
from fastapi import APIRouter, Depends, HTTPException, Query, status
from motor.motor_asyncio import AsyncIOMotorDatabase
from pymongo import ReturnDocument
from pymongo.errors import DuplicateKeyError

from app.database import get_db
from app.dependencies import get_super_admin
from app.schemas.admin import (
    AdminCreateRequest,
    AdminListItem,
    AdminListResponse,
    AdminResetPasswordRequest,
    AdminStatusRequest,
    AdminUpdateRequest,
)
from app.schemas.common import MessageResponse
from app.utils.action_log import log_admin_action
from app.utils.helpers import to_str_id
from app.utils.security import hash_password

router = APIRouter(dependencies=[Depends(get_super_admin)])


def parse_admin_id(value: str) -> ObjectId:
    if not ObjectId.is_valid(value):
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Invalid admin_id")
    return ObjectId(value)


def serialize_admin(doc: dict) -> dict:
    data = to_str_id(doc)
    return {
        "id": data["id"],
        "username": data["username"],
        "display_name": data["display_name"],
        "role": data["role"],
        "status": data["status"],
        "must_change_password": data["must_change_password"],
        "last_login_at": data.get("last_login_at"),
        "created_at": data["created_at"],
        "updated_at": data["updated_at"],
    }


async def get_admin_or_404(db: AsyncIOMotorDatabase, admin_id: str) -> dict:
    admin = await db.admins.find_one({"_id": parse_admin_id(admin_id)})
    if not admin:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Admin not found")
    return admin


async def _count_active_super_admins(
    db: AsyncIOMotorDatabase,
    exclude_id: ObjectId | None = None,
) -> int:
    query: dict = {"role": "super_admin", "status": "active"}
    if exclude_id is not None:
        query["_id"] = {"$ne": exclude_id}
    return await db.admins.count_documents(query)


def ensure_not_self(target_admin: dict, current_admin: dict, detail: str) -> None:
    if target_admin["_id"] == current_admin["_id"]:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=detail)


async def ensure_active_super_admin_remains(
    db: AsyncIOMotorDatabase,
    target_admin: dict,
    action: str,
) -> None:
    if target_admin.get("role") != "super_admin":
        return
    if target_admin.get("status") != "active":
        return
    if await _count_active_super_admins(db, exclude_id=target_admin["_id"]) == 0:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Cannot {action} the last active super admin",
        )


async def ensure_username_available(db: AsyncIOMotorDatabase, username: str) -> None:
    if await db.admins.find_one({"username": username}, {"_id": 1}):
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="Username already exists")


def build_admin_document(payload: AdminCreateRequest, current_admin: dict, now: datetime) -> dict:
    return {
        "username": payload.username,
        "password_hash": hash_password(payload.password),
        "display_name": payload.display_name,
        "role": payload.role,
        "status": payload.status,
        "must_change_password": payload.must_change_password,
        "last_login_at": None,
        "created_by_admin_id": current_admin["_id"],
        "created_at": now,
        "updated_at": now,
    }


@router.get("/", response_model=AdminListResponse)
async def list_admins(
    page: int = Query(1, ge=1),
    page_size: int = Query(20, ge=1, le=100),
    db: AsyncIOMotorDatabase = Depends(get_db),
) -> AdminListResponse:
    cursor = db.admins.find({}, {"password_hash": 0}).sort("created_at", -1).skip((page - 1) * page_size).limit(page_size)
    docs = await cursor.to_list(length=page_size)
    items = [AdminListItem.model_validate(serialize_admin(doc)) for doc in docs]
    total = await db.admins.count_documents({})
    return AdminListResponse(
        items=items,
        total=total,
        page=page,
        page_size=page_size,
        pages=math.ceil(total / page_size) if total else 0,
    )


@router.post("/", response_model=AdminListItem, status_code=status.HTTP_201_CREATED)
async def create_admin(
    payload: AdminCreateRequest,
    current_admin: dict = Depends(get_super_admin),
    db: AsyncIOMotorDatabase = Depends(get_db),
) -> AdminListItem:
    await ensure_username_available(db, payload.username)
    now = datetime.now(timezone.utc)
    document = build_admin_document(payload, current_admin, now)
    try:
        result = await db.admins.insert_one(document)
    except DuplicateKeyError as exc:
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="Username already exists") from exc
    await log_admin_action(
        db,
        current_admin["_id"],
        "admin.create",
        "admin",
        result.inserted_id,
        {
            "username": payload.username,
            "role": payload.role,
            "status": payload.status,
        },
    )
    document["_id"] = result.inserted_id
    return AdminListItem.model_validate(serialize_admin(document))


@router.put("/{admin_id}", response_model=AdminListItem)
async def update_admin(
    admin_id: str,
    payload: AdminUpdateRequest,
    current_admin: dict = Depends(get_super_admin),
    db: AsyncIOMotorDatabase = Depends(get_db),
) -> AdminListItem:
    admin = await get_admin_or_404(db, admin_id)
    if admin["_id"] == current_admin["_id"] and "role" in payload.model_fields_set:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Cannot modify own account via this endpoint")
    if payload.role == "admin":
        await ensure_active_super_admin_remains(db, admin, "demote")
    updates = {}
    if "display_name" in payload.model_fields_set:
        updates["display_name"] = payload.display_name
    if "role" in payload.model_fields_set:
        updates["role"] = payload.role
    if not updates:
        return AdminListItem.model_validate(serialize_admin(admin))
    updates["updated_at"] = datetime.now(timezone.utc)
    updated = await db.admins.find_one_and_update(
        {"_id": admin["_id"]},
        {"$set": updates},
        return_document=ReturnDocument.AFTER,
    )
    await log_admin_action(
        db,
        current_admin["_id"],
        "admin.update",
        "admin",
        admin["_id"],
        {"fields": [field for field in updates if field != "updated_at"]},
    )
    return AdminListItem.model_validate(serialize_admin(updated))


@router.put("/{admin_id}/status", response_model=MessageResponse)
async def update_admin_status(
    admin_id: str,
    payload: AdminStatusRequest,
    current_admin: dict = Depends(get_super_admin),
    db: AsyncIOMotorDatabase = Depends(get_db),
) -> MessageResponse:
    admin = await get_admin_or_404(db, admin_id)
    ensure_not_self(admin, current_admin, "Cannot modify own account via this endpoint")
    if payload.status == "disabled":
        await ensure_active_super_admin_remains(db, admin, "disable")
    await db.admins.update_one(
        {"_id": admin["_id"]},
        {"$set": {"status": payload.status, "updated_at": datetime.now(timezone.utc)}},
    )
    await log_admin_action(
        db,
        current_admin["_id"],
        "admin.update_status",
        "admin",
        admin["_id"],
        {"from": admin.get("status"), "to": payload.status},
    )
    return MessageResponse(message="Admin status updated successfully")


@router.put("/{admin_id}/reset-password", response_model=MessageResponse)
async def reset_admin_password(
    admin_id: str,
    payload: AdminResetPasswordRequest,
    current_admin: dict = Depends(get_super_admin),
    db: AsyncIOMotorDatabase = Depends(get_db),
) -> MessageResponse:
    admin = await get_admin_or_404(db, admin_id)
    await db.admins.update_one(
        {"_id": admin["_id"]},
        {
            "$set": {
                "password_hash": hash_password(payload.new_password),
                "must_change_password": True,
                "updated_at": datetime.now(timezone.utc),
            }
        },
    )
    await log_admin_action(
        db,
        current_admin["_id"],
        "admin.reset_password",
        "admin",
        admin["_id"],
        {"username": admin.get("username", "")},
    )
    return MessageResponse(message="Password reset successfully")


@router.delete("/{admin_id}", response_model=MessageResponse)
async def delete_admin(
    admin_id: str,
    confirm: bool = Query(False),
    current_admin: dict = Depends(get_super_admin),
    db: AsyncIOMotorDatabase = Depends(get_db),
) -> MessageResponse:
    if not confirm:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="confirm=true is required")
    admin = await get_admin_or_404(db, admin_id)
    ensure_not_self(admin, current_admin, "Cannot delete own account")
    await ensure_active_super_admin_remains(db, admin, "delete")
    await db.admins.delete_one({"_id": admin["_id"]})
    await log_admin_action(
        db,
        current_admin["_id"],
        "admin.delete",
        "admin",
        admin["_id"],
        {"username": admin.get("username", ""), "role": admin.get("role", "")},
    )
    return MessageResponse(message="Admin deleted successfully")
