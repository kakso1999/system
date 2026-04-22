import math
from datetime import datetime, timezone

from bson import ObjectId
from fastapi import APIRouter, Depends, HTTPException, Query, status
from motor.motor_asyncio import AsyncIOMotorDatabase

from app.database import get_db
from app.dependencies import get_current_admin
from app.schemas.common import PageResponse
from app.schemas.vip import VipLevel1Rates, VipMemberUpdate, VipRulesResponse, VipThresholds
from app.services.commission import get_setting
from app.utils.money import from_cents, read_cents

router = APIRouter(dependencies=[Depends(get_current_admin)])

VIP_LEVEL_LABELS = {
    0: "Regular",
    1: "VIP1",
    2: "VIP2",
    3: "VIP3",
    4: "SuperVIP",
}


def parse_object_id(value: str, field_name: str) -> ObjectId:
    if not ObjectId.is_valid(value):
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=f"Invalid {field_name}")
    return ObjectId(value)


def as_int(value, default: int) -> int:
    try:
        return int(value)
    except (TypeError, ValueError):
        return default


def as_float(value, default: float) -> float:
    try:
        return float(value)
    except (TypeError, ValueError):
        return default


def as_iso_utc(value: datetime | None) -> str | None:
    if value is None:
        return None
    if value.tzinfo is None:
        return value.replace(tzinfo=timezone.utc).isoformat()
    return value.astimezone(timezone.utc).isoformat()


def total_pages(total: int, page_size: int) -> int:
    return math.ceil(total / page_size) if total else 0


def vip_label(level: int) -> str:
    return VIP_LEVEL_LABELS.get(level, f"VIP{level}")


async def get_staff_or_404(db: AsyncIOMotorDatabase, staff_id: str) -> dict:
    staff = await db.staff_users.find_one({"_id": parse_object_id(staff_id, "staff_id")})
    if not staff:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Staff not found")
    return staff


async def get_staff_names(db: AsyncIOMotorDatabase, staff_ids: list[ObjectId]) -> dict[ObjectId, str]:
    unique_ids = list({staff_id for staff_id in staff_ids if isinstance(staff_id, ObjectId)})
    if not unique_ids:
        return {}
    items = await db.staff_users.find({"_id": {"$in": unique_ids}}, {"name": 1}).to_list(length=len(unique_ids))
    return {item["_id"]: str(item.get("name") or "") for item in items}


async def read_int_setting(db: AsyncIOMotorDatabase, key: str, default: int) -> int:
    return as_int(await get_setting(db, key, default), default)


async def read_float_setting(db: AsyncIOMotorDatabase, key: str, default: float) -> float:
    return as_float(await get_setting(db, key, default), default)


def serialize_member(doc: dict) -> dict:
    stats = doc.get("stats") or {}
    return {
        "id": str(doc["_id"]),
        "staff_no": str(doc.get("staff_no") or ""),
        "name": str(doc.get("name") or ""),
        "phone": str(doc.get("phone") or ""),
        "vip_level": as_int(doc.get("vip_level"), 0),
        "total_valid": as_int(stats.get("total_valid"), 0),
        "total_commission": from_cents(read_cents(stats, cents_key="total_commission_cents", legacy_key="total_commission")),
        "updated_at": as_iso_utc(doc.get("updated_at") or doc.get("created_at")),
    }


def serialize_upgrade_log(doc: dict, staff_name: str) -> dict:
    return {
        "id": str(doc["_id"]),
        "staff_id": str(doc.get("staff_id") or ""),
        "staff_name": staff_name,
        "from_level": as_int(doc.get("from_level"), 0),
        "to_level": as_int(doc.get("to_level"), 0),
        "reason": str(doc.get("reason") or doc.get("trigger") or ""),
        "created_at": as_iso_utc(doc.get("created_at")),
    }


async def write_finance_action_log(
    db: AsyncIOMotorDatabase,
    admin: dict,
    *,
    target_id: ObjectId,
    old_level: int,
    new_level: int,
    remark: str,
    created_at: datetime,
) -> None:
    amount_cents = 0
    await db.finance_action_logs.insert_one({
        "admin_id": admin.get("_id"),
        "admin_username": admin.get("username", "admin"),
        "operator": admin.get("username", "admin"),
        "action": "vip_level_update",
        "target_type": "staff",
        "target_id": target_id,
        "old_status": vip_label(old_level),
        "new_status": vip_label(new_level),
        "amount_cents": amount_cents,
        "amount": from_cents(amount_cents),
        "amount_change_cents": amount_cents,
        "amount_change": from_cents(amount_cents),
        "created_at": created_at,
        "remark": remark,
    })


@router.get("/rules", response_model=VipRulesResponse)
async def get_vip_rules(db: AsyncIOMotorDatabase = Depends(get_db)) -> VipRulesResponse:
    thresholds = VipThresholds(
        vip1=await read_int_setting(db, "vip1_threshold", 10),
        vip2=await read_int_setting(db, "vip2_threshold", 100),
        vip3=await read_int_setting(db, "vip3_threshold", 1000),
        svip=await read_int_setting(db, "svip_threshold", 10000),
    )
    level1_rates = VipLevel1Rates(
        default=await read_float_setting(db, "commission_level1_default", 1.0),
        vip1=await read_float_setting(db, "commission_vip1", 1.0),
        vip2=await read_float_setting(db, "commission_vip2", 1.0),
        vip3=await read_float_setting(db, "commission_vip3", 1.0),
        svip=await read_float_setting(db, "commission_svip", 1.0),
    )
    return VipRulesResponse(
        thresholds=thresholds,
        level1_rates=level1_rates,
        level2_rate=await read_float_setting(db, "commission_level2", 0.3),
        level3_rate=await read_float_setting(db, "commission_level3", 0.1),
    )


@router.get("/members", response_model=PageResponse)
async def list_vip_members(
    level: int | None = Query(None, ge=0, le=4),
    page: int = Query(1, ge=1),
    page_size: int = Query(20, ge=1, le=100),
    db: AsyncIOMotorDatabase = Depends(get_db),
) -> PageResponse:
    query = {"vip_level": level} if level is not None else {}
    projection = {"staff_no": 1, "name": 1, "phone": 1, "vip_level": 1, "stats": 1, "created_at": 1, "updated_at": 1}
    cursor = db.staff_users.find(query, projection).sort("created_at", -1).skip((page - 1) * page_size).limit(page_size)
    items = await cursor.to_list(length=page_size)
    total = await db.staff_users.count_documents(query)
    return PageResponse(
        items=[serialize_member(item) for item in items],
        total=total,
        page=page,
        page_size=page_size,
        pages=total_pages(total, page_size),
    )


@router.get("/upgrade-logs", response_model=PageResponse)
async def list_upgrade_logs(
    staff_id: str | None = None,
    page: int = Query(1, ge=1),
    page_size: int = Query(20, ge=1, le=100),
    db: AsyncIOMotorDatabase = Depends(get_db),
) -> PageResponse:
    query = {"staff_id": parse_object_id(staff_id, "staff_id")} if staff_id else {}
    cursor = db.vip_upgrade_logs.find(query).sort("created_at", -1).skip((page - 1) * page_size).limit(page_size)
    items = await cursor.to_list(length=page_size)
    names = await get_staff_names(db, [item.get("staff_id") for item in items])
    total = await db.vip_upgrade_logs.count_documents(query)
    return PageResponse(
        items=[serialize_upgrade_log(item, names.get(item.get("staff_id"), "")) for item in items],
        total=total,
        page=page,
        page_size=page_size,
        pages=total_pages(total, page_size),
    )


@router.put("/members/{staff_id}")
async def update_vip_member(
    staff_id: str,
    payload: VipMemberUpdate,
    current_admin: dict = Depends(get_current_admin),
    db: AsyncIOMotorDatabase = Depends(get_db),
):
    staff = await get_staff_or_404(db, staff_id)
    now = datetime.now(timezone.utc)
    old_level = as_int(staff.get("vip_level"), 0)
    remark = (payload.remark or "").strip()
    await db.staff_users.update_one(
        {"_id": staff["_id"]},
        {"$set": {"vip_level": payload.vip_level, "updated_at": now}},
    )
    await db.vip_upgrade_logs.insert_one({
        "staff_id": staff["_id"],
        "from_level": old_level,
        "to_level": payload.vip_level,
        "reason": "manual",
        "trigger": "manual",
        "admin_id": current_admin.get("_id"),
        "admin_username": current_admin.get("username", "admin"),
        "remark": remark or None,
        "created_at": now,
    })
    await write_finance_action_log(
        db,
        current_admin,
        target_id=staff["_id"],
        old_level=old_level,
        new_level=payload.vip_level,
        remark=remark,
        created_at=now,
    )
    return {"id": str(staff["_id"]), "vip_level": payload.vip_level}
