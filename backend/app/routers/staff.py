import math
import re
from datetime import datetime, timezone

from bson import ObjectId
from fastapi import APIRouter, Depends, HTTPException, Query, status
from motor.motor_asyncio import AsyncIOMotorDatabase
from pymongo import ReturnDocument
from pymongo.errors import DuplicateKeyError

from app.database import get_db
from app.dependencies import get_current_admin
from app.routers.staff_auth import (
    build_staff_document,
    create_relation_records,
    ensure_unique_staff_fields,
    generate_invite_code,
    generate_staff_no,
)
from app.schemas.common import MessageResponse, PageResponse
from app.schemas.staff import (
    StaffCreateRequest,
    StaffDetail,
    StaffResetPasswordRequest,
    StaffStatus,
    StaffStatusUpdateRequest,
    StaffUpdateRequest,
)
from app.utils.helpers import to_str_id, to_str_ids
from app.utils.security import hash_password

router = APIRouter(dependencies=[Depends(get_current_admin)])


def parse_object_id(value: str, field_name: str) -> ObjectId:
    if not ObjectId.is_valid(value):
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=f"Invalid {field_name}")
    return ObjectId(value)


def serialize_staff(doc: dict) -> dict:
    data = to_str_id(doc)
    data.pop("password_hash", None)
    for key in ("parent_id", "campaign_id"):
        if isinstance(data.get(key), ObjectId):
            data[key] = str(data[key])
    return data


async def get_staff_or_404(db: AsyncIOMotorDatabase, staff_id: str) -> dict:
    staff = await db.staff_users.find_one({"_id": parse_object_id(staff_id, "staff_id")})
    if not staff:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Staff not found")
    return staff


async def validate_campaign(
    db: AsyncIOMotorDatabase,
    campaign_id: str | None,
) -> ObjectId | None:
    if campaign_id is None:
        return None
    campaign_obj_id = parse_object_id(campaign_id, "campaign_id")
    if not await db.campaigns.find_one({"_id": campaign_obj_id}):
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Campaign not found")
    return campaign_obj_id


async def count_direct_children(db: AsyncIOMotorDatabase, staff_id: ObjectId) -> int:
    return await db.staff_relations.count_documents({"ancestor_id": staff_id, "level": 1})


async def document_exists(collection, query: dict) -> bool:
    return await collection.find_one(query, {"_id": 1}) is not None


async def get_delete_blockers(db: AsyncIOMotorDatabase, staff_obj_id: ObjectId) -> list[str]:
    blockers: list[str] = []
    has_team_members = await document_exists(db.staff_users, {"parent_id": staff_obj_id})
    if not has_team_members:
        has_team_members = await document_exists(db.staff_relations, {"ancestor_id": staff_obj_id})
    if has_team_members:
        blockers.append("team members")

    checks = [
        ("claims", db.claims, {"staff_id": staff_obj_id}),
        ("commission logs", db.commission_logs, {"$or": [{"source_staff_id": staff_obj_id}, {"beneficiary_staff_id": staff_obj_id}]}),
        ("reward codes", db.reward_codes, {"staff_id": staff_obj_id}),
        ("scan logs", db.scan_logs, {"staff_id": staff_obj_id}),
        ("withdrawal requests", db.withdrawal_requests, {"staff_id": staff_obj_id}),
        ("team rewards", db.team_rewards, {"staff_id": staff_obj_id}),
        ("VIP upgrade logs", db.vip_upgrade_logs, {"staff_id": staff_obj_id}),
    ]
    for label, collection, query in checks:
        if await document_exists(collection, query):
            blockers.append(label)
    return blockers


async def ensure_staff_can_be_deleted(db: AsyncIOMotorDatabase, staff_obj_id: ObjectId) -> None:
    blockers = await get_delete_blockers(db, staff_obj_id)
    if blockers:
        joined = ", ".join(blockers)
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Cannot delete staff with related {joined}",
        )


async def delete_staff_dependencies(db: AsyncIOMotorDatabase, staff_obj_id: ObjectId) -> None:
    await db.staff_payout_accounts.delete_many({"staff_id": staff_obj_id})
    await db.staff_relations.delete_many(
        {"$or": [{"staff_id": staff_obj_id}, {"ancestor_id": staff_obj_id}]}
    )


@router.get("/", response_model=PageResponse)
async def list_staff(
    page: int = Query(1, ge=1),
    page_size: int = Query(20, ge=1, le=100),
    status_value: StaffStatus | None = Query(None, alias="status"),
    search: str | None = None,
    db: AsyncIOMotorDatabase = Depends(get_db),
) -> PageResponse:
    query: dict = {"status": status_value} if status_value else {}
    if search:
        pattern = {"$regex": re.escape(search), "$options": "i"}
        query["$or"] = [{"name": pattern}, {"phone": pattern}, {"staff_no": pattern}]
    projection = {"password_hash": 0, "updated_at": 0}
    cursor = db.staff_users.find(query, projection).sort("created_at", -1).skip((page - 1) * page_size).limit(page_size)
    items = await cursor.to_list(length=page_size)
    total = await db.staff_users.count_documents(query)
    return PageResponse(
        items=to_str_ids(items),
        total=total,
        page=page,
        page_size=page_size,
        pages=math.ceil(total / page_size) if total else 0,
    )


@router.post("/", response_model=StaffDetail, status_code=status.HTTP_201_CREATED)
async def create_staff(
    payload: StaffCreateRequest,
    db: AsyncIOMotorDatabase = Depends(get_db),
) -> StaffDetail:
    await ensure_unique_staff_fields(db, payload.username, payload.phone)
    parent_id = parse_object_id(payload.parent_id, "parent_id") if payload.parent_id else None
    if parent_id and not await db.staff_users.find_one({"_id": parent_id}):
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Parent staff not found")
    created_at = datetime.now(timezone.utc)
    document = build_staff_document(
        name=payload.name,
        phone=payload.phone,
        username=payload.username,
        password=payload.password,
        invite_code=await generate_invite_code(db),
        staff_no=generate_staff_no(),
        created_at=created_at,
        status_value="active",
        parent_id=parent_id,
        campaign_id=await validate_campaign(db, payload.campaign_id),
    )
    try:
        result = await db.staff_users.insert_one(document)
        await create_relation_records(db, result.inserted_id, parent_id, created_at)
    except DuplicateKeyError as exc:
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="Username, phone, or invite code already exists") from exc
    document["_id"] = result.inserted_id
    return StaffDetail.model_validate(serialize_staff(document))


@router.get("/tree")
async def staff_tree(db: AsyncIOMotorDatabase = Depends(get_db)):
    top_level = await db.staff_users.find(
        {"$or": [{"parent_id": None}, {"parent_id": {"$exists": False}}]},
        {"password_hash": 0},
    ).sort("created_at", -1).to_list(length=500)

    result = []
    for staff in top_level:
        node = serialize_staff(dict(staff))
        node["children_count"] = await count_direct_children(db, staff["_id"])
        result.append(node)
    return result


@router.get("/{staff_id}/children")
async def staff_children(
    staff_id: str,
    db: AsyncIOMotorDatabase = Depends(get_db),
):
    ancestor_id = parse_object_id(staff_id, "staff_id")
    relations = await db.staff_relations.find(
        {"ancestor_id": ancestor_id, "level": 1}
    ).to_list(length=500)

    children = []
    for relation in relations:
        member = await db.staff_users.find_one({"_id": relation["staff_id"]}, {"password_hash": 0})
        if not member:
            continue
        node = serialize_staff(dict(member))
        node["children_count"] = await count_direct_children(db, relation["staff_id"])
        children.append(node)
    return children


@router.get("/{staff_id}", response_model=StaffDetail)
async def get_staff_detail(
    staff_id: str,
    db: AsyncIOMotorDatabase = Depends(get_db),
) -> StaffDetail:
    return StaffDetail.model_validate(serialize_staff(await get_staff_or_404(db, staff_id)))


@router.put("/{staff_id}", response_model=StaffDetail)
async def update_staff(
    staff_id: str,
    payload: StaffUpdateRequest,
    db: AsyncIOMotorDatabase = Depends(get_db),
) -> StaffDetail:
    staff = await get_staff_or_404(db, staff_id)
    if payload.phone and await db.staff_users.find_one({"phone": payload.phone, "_id": {"$ne": staff["_id"]}}):
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="Phone already exists")
    updates = {}
    if "name" in payload.model_fields_set:
        updates["name"] = payload.name
    if "phone" in payload.model_fields_set:
        updates["phone"] = payload.phone
    if "status" in payload.model_fields_set:
        updates["status"] = payload.status
    if "campaign_id" in payload.model_fields_set:
        updates["campaign_id"] = await validate_campaign(db, payload.campaign_id)
    if not updates:
        return StaffDetail.model_validate(serialize_staff(staff))
    updates["updated_at"] = datetime.now(timezone.utc)
    updated = await db.staff_users.find_one_and_update(
        {"_id": staff["_id"]},
        {"$set": updates},
        return_document=ReturnDocument.AFTER,
    )
    return StaffDetail.model_validate(serialize_staff(updated))


@router.put("/{staff_id}/status", response_model=MessageResponse)
async def update_staff_status(
    staff_id: str,
    payload: StaffStatusUpdateRequest,
    db: AsyncIOMotorDatabase = Depends(get_db),
) -> MessageResponse:
    staff = await get_staff_or_404(db, staff_id)
    await db.staff_users.update_one(
        {"_id": staff["_id"]},
        {"$set": {"status": payload.status, "updated_at": datetime.now(timezone.utc)}},
    )
    return MessageResponse(message="Staff status updated successfully")


@router.put("/{staff_id}/reset-password", response_model=MessageResponse)
async def reset_staff_password(
    staff_id: str,
    payload: StaffResetPasswordRequest,
    db: AsyncIOMotorDatabase = Depends(get_db),
) -> MessageResponse:
    staff = await get_staff_or_404(db, staff_id)
    await db.staff_users.update_one(
        {"_id": staff["_id"]},
        {
            "$set": {
                "password_hash": hash_password(payload.new_password),
                "updated_at": datetime.now(timezone.utc),
            }
        },
    )
    return MessageResponse(message="Password reset successfully")


@router.delete("/{staff_id}", response_model=MessageResponse)
async def delete_staff(
    staff_id: str,
    db: AsyncIOMotorDatabase = Depends(get_db),
) -> MessageResponse:
    staff = await get_staff_or_404(db, staff_id)
    await ensure_staff_can_be_deleted(db, staff["_id"])
    await delete_staff_dependencies(db, staff["_id"])
    await db.staff_users.delete_one({"_id": staff["_id"]})
    return MessageResponse(message="Staff deleted successfully")
