from __future__ import annotations

from datetime import datetime, timezone
from typing import Any

from bson import ObjectId
from fastapi import HTTPException, status
from motor.motor_asyncio import AsyncIOMotorDatabase
from pymongo import ReturnDocument

from app.schemas.manual_commission import (
    ManualCommissionAdjust,
    ManualCommissionCancel,
    ManualCommissionCreate,
)
from app.services.commission import generate_commission_no, get_setting
from app.utils.money import from_cents, read_cents, to_cents

ADJUSTABLE_STATUSES = {"pending", "approved", "pending_redeem"}

def parse_object_id(value: str, field_name: str) -> ObjectId:
    if not ObjectId.is_valid(value):
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=f"Invalid {field_name}")
    return ObjectId(value)


def clean_remark(value: str, field_name: str = "remark") -> str:
    remark = value.strip()
    if not remark:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=f"{field_name} is required")
    return remark

def serialize_value(value: Any) -> Any:
    if isinstance(value, ObjectId):
        return str(value)
    if isinstance(value, datetime):
        current = value if value.tzinfo else value.replace(tzinfo=timezone.utc)
        return current.astimezone(timezone.utc).isoformat()
    if isinstance(value, dict):
        return {key: serialize_value(item) for key, item in value.items()}
    if isinstance(value, list):
        return [serialize_value(item) for item in value]
    return value


def serialize_commission_log(doc: dict) -> dict:
    data = serialize_value(doc)
    data["id"] = str(doc["_id"])
    data.pop("_id", None)
    data["amount"] = from_cents(read_cents(doc))
    data.pop("amount_cents", None)
    return data


async def require_document(
    db: AsyncIOMotorDatabase,
    collection_name: str,
    object_id: ObjectId,
    detail: str,
) -> dict:
    document = await getattr(db, collection_name).find_one({"_id": object_id})
    if not document:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=detail)
    return document


async def resolve_optional_id(
    db: AsyncIOMotorDatabase,
    collection_name: str,
    value: str | None,
    field_name: str,
    detail: str,
) -> ObjectId | None:
    if not value:
        return None
    object_id = parse_object_id(value, field_name)
    await require_document(db, collection_name, object_id, detail)
    return object_id


async def apply_staff_commission_delta(
    db: AsyncIOMotorDatabase,
    staff_id: ObjectId,
    delta_cents: int,
) -> None:
    if delta_cents == 0:
        return
    await db.staff_users.update_one(
        {"_id": staff_id},
        {"$inc": {
            "stats.total_commission": from_cents(delta_cents),
            "stats.total_commission_cents": delta_cents,
        }},
    )


async def append_finance_action_log(
    db: AsyncIOMotorDatabase,
    *,
    admin: dict,
    action: str,
    target_id: ObjectId,
    old_status: str,
    new_status: str,
    amount_cents: int,
    balance_delta_cents: int,
    remark: str,
) -> None:
    await db.finance_action_logs.insert_one({
        "admin_id": admin["_id"],
        "admin_username": admin.get("username", "admin"),
        "operator": admin.get("username", "admin"),
        "action": action,
        "target_type": "commission",
        "target_id": target_id,
        "old_status": old_status,
        "new_status": new_status,
        "amount_cents": amount_cents,
        "amount_change": from_cents(balance_delta_cents),
        "amount_change_cents": balance_delta_cents,
        "created_at": datetime.now(timezone.utc),
        "remark": remark,
    })


async def get_manual_commission_or_404(
    db: AsyncIOMotorDatabase,
    commission_id: str,
) -> dict:
    object_id = parse_object_id(commission_id, "commission_id")
    commission = await db.commission_logs.find_one({"_id": object_id, "type": "manual"})
    if not commission:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Manual commission not found")
    return commission


async def resolve_create_dependencies(
    db: AsyncIOMotorDatabase,
    payload: ManualCommissionCreate,
) -> tuple[int, dict, ObjectId | None, ObjectId | None, ObjectId | None]:
    amount_cents = to_cents(payload.amount)
    if amount_cents <= 0:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="amount must be greater than 0")
    beneficiary_id = parse_object_id(payload.beneficiary_staff_id, "beneficiary_staff_id")
    beneficiary = await require_document(db, "staff_users", beneficiary_id, "Beneficiary staff not found")
    claim_id = await resolve_optional_id(db, "claims", payload.claim_id, "claim_id", "Claim not found")
    source_staff_id = await resolve_optional_id(
        db, "staff_users", payload.source_staff_id, "source_staff_id", "Source staff not found"
    )
    campaign_id = await resolve_optional_id(db, "campaigns", payload.campaign_id, "campaign_id", "Campaign not found")
    return amount_cents, beneficiary, claim_id, source_staff_id, campaign_id


def build_manual_commission_document(
    payload: ManualCommissionCreate,
    *,
    beneficiary: dict,
    claim_id: ObjectId | None,
    source_staff_id: ObjectId | None,
    campaign_id: ObjectId | None,
    admin_id: ObjectId,
    amount_cents: int,
    status_value: str,
    now: datetime,
    remark: str,
) -> dict:
    document = {
        "commission_no": generate_commission_no(),
        "type": "manual",
        "status": status_value,
        "level": payload.level,
        "amount": from_cents(amount_cents),
        "amount_cents": amount_cents,
        "currency": "PHP",
        "rate": 0.0,
        "vip_level_at_time": int(beneficiary.get("vip_level", 0)),
        "beneficiary_staff_id": beneficiary["_id"],
        "created_by": admin_id,
        "created_at": now,
        "remark": remark,
    }
    if status_value == "approved":
        document["approved_at"] = now
    if claim_id is not None:
        document["claim_id"] = claim_id
    if source_staff_id is not None:
        document["source_staff_id"] = source_staff_id
    if campaign_id is not None:
        document["campaign_id"] = campaign_id
    return document


async def create_manual_commission_entry(
    db: AsyncIOMotorDatabase,
    payload: ManualCommissionCreate,
    admin: dict,
) -> dict:
    remark = clean_remark(payload.remark)
    amount_cents, beneficiary, claim_id, source_staff_id, campaign_id = await resolve_create_dependencies(db, payload)
    require_audit = bool(await get_setting(db, "manual_commission_require_audit", False))
    status_value = "pending" if require_audit else "approved"
    document = build_manual_commission_document(
        payload,
        beneficiary=beneficiary,
        claim_id=claim_id,
        source_staff_id=source_staff_id,
        campaign_id=campaign_id,
        admin_id=admin["_id"],
        amount_cents=amount_cents,
        status_value=status_value,
        now=datetime.now(timezone.utc),
        remark=remark,
    )
    result = await db.commission_logs.insert_one(document)
    document["_id"] = result.inserted_id
    if status_value == "approved":
        await apply_staff_commission_delta(db, beneficiary["_id"], amount_cents)
    await append_finance_action_log(
        db,
        admin=admin,
        action="manual_commission_create",
        target_id=result.inserted_id,
        old_status="",
        new_status=status_value,
        amount_cents=amount_cents,
        balance_delta_cents=amount_cents if status_value == "approved" else 0,
        remark=remark,
    )
    serialized = serialize_commission_log(document)
    return {"id": serialized["id"], "commission_no": serialized["commission_no"], "amount_cents": amount_cents, "status": serialized["status"]}


async def adjust_manual_commission_entry(
    db: AsyncIOMotorDatabase,
    commission_id: str,
    payload: ManualCommissionAdjust,
    admin: dict,
) -> dict:
    commission = await get_manual_commission_or_404(db, commission_id)
    old_status = str(commission.get("status") or "")
    if old_status not in ADJUSTABLE_STATUSES:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Manual commission cannot be adjusted")
    remark = clean_remark(payload.remark)
    new_cents = to_cents(payload.new_amount)
    history_entry = {
        "old_cents": read_cents(commission),
        "new_cents": new_cents,
        "remark": remark,
        "admin_id": admin["_id"],
        "at": datetime.now(timezone.utc),
    }
    updated = await db.commission_logs.find_one_and_update(
        {"_id": commission["_id"], "type": "manual", "status": old_status},
        {"$set": {"amount": from_cents(new_cents), "amount_cents": new_cents}, "$push": {"adjust_history": history_entry}},
        return_document=ReturnDocument.AFTER,
    )
    if updated is None:
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="Commission status changed, please retry")
    return await finalize_adjustment(db, updated, commission, admin, old_status, new_cents, remark)

async def finalize_adjustment(
    db: AsyncIOMotorDatabase,
    updated: dict,
    commission: dict,
    admin: dict,
    old_status: str,
    new_cents: int,
    remark: str,
) -> dict:
    old_cents = read_cents(commission)
    delta_cents = new_cents - old_cents
    if old_status == "approved":
        await apply_staff_commission_delta(db, commission["beneficiary_staff_id"], delta_cents)
    await append_finance_action_log(
        db,
        admin=admin,
        action="manual_commission_adjust",
        target_id=commission["_id"],
        old_status=old_status,
        new_status=old_status,
        amount_cents=new_cents,
        balance_delta_cents=delta_cents if old_status == "approved" else 0,
        remark=remark,
    )
    serialized = serialize_commission_log(updated)
    return {"id": serialized["id"], "amount_cents": new_cents, "delta_cents": delta_cents}


async def cancel_manual_commission_entry(
    db: AsyncIOMotorDatabase,
    commission_id: str,
    payload: ManualCommissionCancel,
    admin: dict,
) -> dict:
    commission = await get_manual_commission_or_404(db, commission_id)
    old_status = str(commission.get("status") or "")
    if old_status == "paid":
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Paid commissions cannot be cancelled")
    if old_status == "cancelled":
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Commission already cancelled")
    remark = clean_remark(payload.remark)
    updated = await db.commission_logs.find_one_and_update(
        {"_id": commission["_id"], "type": "manual", "status": old_status},
        {"$set": {"status": "cancelled", "cancelled_at": datetime.now(timezone.utc), "cancel_reason": remark}},
        return_document=ReturnDocument.AFTER,
    )
    if updated is None:
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="Commission status changed, please retry")
    return await finalize_cancellation(db, updated, commission, admin, old_status, remark)

async def finalize_cancellation(
    db: AsyncIOMotorDatabase,
    updated: dict,
    commission: dict,
    admin: dict,
    old_status: str,
    remark: str,
) -> dict:
    amount_cents = read_cents(commission)
    if old_status == "approved":
        await apply_staff_commission_delta(db, commission["beneficiary_staff_id"], -amount_cents)
    await append_finance_action_log(
        db,
        admin=admin,
        action="manual_commission_cancel",
        target_id=commission["_id"],
        old_status=old_status,
        new_status="cancelled",
        amount_cents=amount_cents,
        balance_delta_cents=-amount_cents if old_status == "approved" else 0,
        remark=remark,
    )
    serialized = serialize_commission_log(updated)
    return {"id": serialized["id"], "status": serialized["status"]}
