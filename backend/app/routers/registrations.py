import logging
import re
from datetime import datetime, timezone

from bson import ObjectId
from fastapi import APIRouter, Depends, HTTPException, Query, status
from motor.motor_asyncio import AsyncIOMotorDatabase
from pymongo.errors import DuplicateKeyError

from app.database import get_db
from app.dependencies import get_current_admin
from app.routers.staff_auth import (
    STAFF_STATS_TEMPLATE,
    create_relation_records,
    generate_invite_code,
    generate_staff_no,
)
from app.schemas.registration import (
    RegistrationApplicationListResponse,
    RegistrationApplicationResponse,
    RejectRequest,
)
from app.utils.helpers import to_str_id

logger = logging.getLogger(__name__)
router = APIRouter(dependencies=[Depends(get_current_admin)])


def parse_object_id(value: str, field_name: str) -> ObjectId:
    if not ObjectId.is_valid(value):
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=f"Invalid {field_name}")
    return ObjectId(value)


def build_approved_staff_document(application: dict, parent: dict | None, invite_code: str, staff_no: str, now: datetime) -> dict:
    return {
        "staff_no": staff_no,
        "name": application["name"],
        "phone": application["phone"],
        "username": application["username"],
        "password_hash": application["password_hash"],
        "status": "active",
        "vip_level": 0,
        "invite_code": invite_code,
        "parent_id": parent["_id"] if parent else None,
        "campaign_id": parent.get("campaign_id") if parent else None,
        "stats": STAFF_STATS_TEMPLATE.copy(),
        "created_at": now,
        "updated_at": now,
    }


async def get_application_or_404(db: AsyncIOMotorDatabase, application_id: str) -> dict:
    application = await db.staff_registration_applications.find_one({"_id": parse_object_id(application_id, "application_id")})
    if not application:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Registration application not found")
    return application


async def resolve_referrer_staff(db: AsyncIOMotorDatabase, invite_code: str | None) -> dict | None:
    if not invite_code:
        return None
    return await db.staff_users.find_one({"invite_code": invite_code})


def serialize_application(doc: dict, referrer: dict | None) -> RegistrationApplicationResponse:
    data = to_str_id(doc)
    payload = {
        "id": data["id"],
        "name": data["name"],
        "phone": data["phone"],
        "username": data["username"],
        "invite_code": data.get("invite_code"),
        "referrer_staff": None,
        "status": data["status"],
        "rejection_reason": data.get("rejection_reason", ""),
        "applied_at": data["applied_at"],
        "reviewed_at": data.get("reviewed_at"),
        "reviewed_by_admin_id": data.get("reviewed_by_admin_id"),
        "approved_staff_id": data.get("approved_staff_id"),
    }
    if referrer:
        payload["referrer_staff"] = {
            "id": str(referrer["_id"]),
            "name": referrer.get("name", ""),
            "staff_no": referrer.get("staff_no", ""),
        }
    return RegistrationApplicationResponse.model_validate(payload)


@router.get("/", response_model=RegistrationApplicationListResponse)
async def list_registrations(
    status_value: str | None = Query(None, alias="status"),
    page: int = Query(1, ge=1),
    page_size: int = Query(20, ge=1, le=100),
    q: str | None = None,
    db: AsyncIOMotorDatabase = Depends(get_db),
) -> RegistrationApplicationListResponse:
    if status_value and status_value not in {"pending", "approved", "rejected"}:
        raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail="Invalid status")
    query: dict = {"status": status_value} if status_value else {}
    if q:
        pattern = {"$regex": re.escape(q), "$options": "i"}
        query["$or"] = [{"name": pattern}, {"phone": pattern}, {"username": pattern}]
    cursor = db.staff_registration_applications.find(query).sort("applied_at", -1).skip((page - 1) * page_size).limit(page_size)
    items = await cursor.to_list(length=page_size)
    invite_codes = sorted({item.get("invite_code") for item in items if item.get("invite_code")})
    referrer_map = {
        doc["invite_code"]: doc
        for doc in await db.staff_users.find(
            {"invite_code": {"$in": invite_codes}},
            {"name": 1, "staff_no": 1, "invite_code": 1},
        ).to_list(length=len(invite_codes) or 1)
    }
    return RegistrationApplicationListResponse(
        items=[serialize_application(item, referrer_map.get(item.get("invite_code"))) for item in items],
        total=await db.staff_registration_applications.count_documents(query),
        page=page,
        page_size=page_size,
    )


@router.get("/pending-count")
async def get_pending_registration_count(
    db: AsyncIOMotorDatabase = Depends(get_db),
) -> dict[str, int]:
    return {"count": await db.staff_registration_applications.count_documents({"status": "pending"})}


@router.post("/{application_id}/approve", response_model=RegistrationApplicationResponse)
async def approve_registration(
    application_id: str,
    current_admin: dict = Depends(get_current_admin),
    db: AsyncIOMotorDatabase = Depends(get_db),
) -> RegistrationApplicationResponse:
    application = await get_application_or_404(db, application_id)
    if application.get("status") != "pending":
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="not_pending")
    if await db.staff_users.find_one({"username": application["username"]}, {"_id": 1}):
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="Username already exists")
    if await db.staff_users.find_one({"phone": application["phone"]}, {"_id": 1}):
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="Phone already exists")
    parent = await resolve_referrer_staff(db, application.get("invite_code"))
    if application.get("invite_code") and not parent:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="referrer_missing")
    now = datetime.now(timezone.utc)
    staff_document = build_approved_staff_document(
        application,
        parent,
        await generate_invite_code(db),
        generate_staff_no(),
        now,
    )
    try:
        result = await db.staff_users.insert_one(staff_document)
        await create_relation_records(db, result.inserted_id, staff_document["parent_id"], now)
    except (DuplicateKeyError, Exception) as exc:
        logger.exception("Failed to approve registration application %s", application_id)
        if isinstance(exc, DuplicateKeyError):
            raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="Username, phone, or invite code already exists") from exc
        raise HTTPException(status_code=status.HTTP_500_INTERNAL_SERVER_ERROR, detail="Failed to approve registration") from exc
    await db.staff_registration_applications.update_one(
        {"_id": application["_id"]},
        {
            "$set": {
                "status": "approved",
                "approved_staff_id": result.inserted_id,
                "reviewed_at": now,
                "reviewed_by_admin_id": current_admin["_id"],
                "rejection_reason": "",
            }
        },
    )
    updated = await db.staff_registration_applications.find_one({"_id": application["_id"]})
    return serialize_application(updated, parent)


@router.post("/{application_id}/reject", response_model=RegistrationApplicationResponse)
async def reject_registration(
    application_id: str,
    payload: RejectRequest,
    current_admin: dict = Depends(get_current_admin),
    db: AsyncIOMotorDatabase = Depends(get_db),
) -> RegistrationApplicationResponse:
    application = await get_application_or_404(db, application_id)
    if application.get("status") != "pending":
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="not_pending")
    now = datetime.now(timezone.utc)
    await db.staff_registration_applications.update_one(
        {"_id": application["_id"]},
        {
            "$set": {
                "status": "rejected",
                "rejection_reason": payload.reason,
                "reviewed_at": now,
                "reviewed_by_admin_id": current_admin["_id"],
                "approved_staff_id": None,
            }
        },
    )
    updated = await db.staff_registration_applications.find_one({"_id": application["_id"]})
    return serialize_application(updated, await resolve_referrer_staff(db, updated.get("invite_code")))
