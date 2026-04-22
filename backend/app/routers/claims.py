import math
from datetime import datetime, timezone
from bson import ObjectId
from fastapi import APIRouter, Depends, HTTPException, Query
from motor.motor_asyncio import AsyncIOMotorDatabase
from pymongo import ReturnDocument
from app.database import get_db
from app.dependencies import get_current_admin
from app.schemas.common import PageResponse
from app.services.withdrawals import log_finance_action
from app.utils.csv_export import csv_stream
from app.utils.helpers import to_str_id
from app.utils.money import from_cents, read_cents

router = APIRouter(dependencies=[Depends(get_current_admin)])


def serialize_claim(doc: dict) -> dict:
    data = to_str_id(doc)
    data["settlement_status"] = data.get("settlement_status") or "unpaid"
    cents = read_cents(doc, cents_key="commission_amount_cents", legacy_key="commission_amount")
    data["commission_amount"] = from_cents(cents)
    data["commission_amount_cents"] = int(cents)
    data["settled_at"] = data.get("settled_at")
    for k in ("campaign_id", "staff_id", "wheel_item_id", "reward_code_id"):
        if isinstance(data.get(k), ObjectId):
            data[k] = str(data[k])
    return data


def parse_object_id(value: str, field_name: str) -> ObjectId:
    if not ObjectId.is_valid(value):
        raise HTTPException(status_code=400, detail=f"Invalid {field_name}")
    return ObjectId(value)


def normalized_settlement_status(claim: dict) -> str:
    return claim.get("settlement_status") or "unpaid"


def settlement_filter(status: str) -> dict:
    if status == "unpaid":
        return {"$or": [{"settlement_status": "unpaid"}, {"settlement_status": {"$exists": False}}]}
    return {"settlement_status": status}


def settlement_response(doc: dict) -> dict:
    claim = serialize_claim(doc)
    return {
        "id": claim["id"],
        "settlement_status": claim["settlement_status"],
        "commission_amount": claim["commission_amount"],
        "settled_at": claim.get("settled_at"),
        "cancelled_at": claim.get("cancelled_at"),
        "cancel_reason": claim.get("cancel_reason"),
        "frozen_at": claim.get("frozen_at"),
    }


@router.get("/", response_model=PageResponse)
async def list_claims(
    page: int = Query(1, ge=1), page_size: int = Query(20, ge=1, le=100),
    campaign_id: str | None = None, staff_id: str | None = None,
    phone: str | None = None, status: str | None = None,
    ip: str | None = None, device_fingerprint: str | None = None,
    prize_type: str | None = None, settlement_status: str | None = Query(None),
    db: AsyncIOMotorDatabase = Depends(get_db),
):
    query: dict = {}
    if campaign_id:
        query["campaign_id"] = parse_object_id(campaign_id, "campaign_id")
    if staff_id:
        query["staff_id"] = parse_object_id(staff_id, "staff_id")
    if phone:
        query["phone"] = {"$regex": phone, "$options": "i"}
    if status:
        query["status"] = status
    if ip:
        query["ip"] = {"$regex": ip, "$options": "i"}
    if device_fingerprint:
        query["device_fingerprint"] = {"$regex": device_fingerprint, "$options": "i"}
    if prize_type:
        query["prize_type"] = prize_type
    if settlement_status:
        query.update(settlement_filter(settlement_status))
    cursor = db.claims.find(query).sort("created_at", -1).skip((page - 1) * page_size).limit(page_size)
    items = await cursor.to_list(length=page_size)
    total = await db.claims.count_documents(query)
    return PageResponse(
        items=[serialize_claim(i) for i in items], total=total,
        page=page, page_size=page_size,
        pages=math.ceil(total / page_size) if total else 0,
    )


@router.get("/export")
async def export_claims(db: AsyncIOMotorDatabase = Depends(get_db)):
    cursor = db.claims.find(
        {},
        {
            "campaign_id": 1,
            "staff_id": 1,
            "phone": 1,
            "prize_type": 1,
            "status": 1,
            "settlement_status": 1,
            "reward_code": 1,
            "created_at": 1,
        },
    ).sort("created_at", -1)

    async def rows():
        async for doc in cursor:
            yield [
                str(doc.get("_id") or ""),
                str(doc.get("campaign_id") or ""),
                str(doc.get("staff_id") or ""),
                doc.get("phone", ""),
                doc.get("prize_type", ""),
                doc.get("status", ""),
                doc.get("settlement_status", ""),
                doc.get("reward_code", ""),
                doc["created_at"].isoformat() if doc.get("created_at") else "",
            ]

    items = [row async for row in rows()]
    return csv_stream(
        items,
        [
            "id",
            "campaign_id",
            "staff_id",
            "phone",
            "prize_type",
            "status",
            "settlement_status",
            "reward_code",
            "created_at",
        ],
        "claims.csv",
    )


@router.post("/{claim_id}/cancel")
async def cancel_claim(
    claim_id: str,
    payload: dict,
    admin: dict = Depends(get_current_admin),
    db: AsyncIOMotorDatabase = Depends(get_db),
):
    oid = parse_object_id(claim_id, "claim_id")
    claim = await db.claims.find_one({"_id": oid})
    if not claim:
        raise HTTPException(status_code=404, detail="Claim not found")
    reason = str(payload.get("reason", "")).strip()
    if not reason:
        raise HTTPException(status_code=400, detail="Cancel reason is required")
    allowed_sources = ["pending_redeem", "unpaid", "frozen"]
    updated = await db.claims.find_one_and_update(
        {"_id": oid, "settlement_status": {"$in": allowed_sources}},
        {"$set": {"settlement_status": "cancelled", "cancelled_at": datetime.now(timezone.utc), "cancel_reason": reason}},
        return_document=ReturnDocument.AFTER,
    )
    if updated is None:
        existing = await db.claims.find_one({"_id": oid})
        if existing is None:
            raise HTTPException(status_code=404, detail="claim_not_found")
        raise HTTPException(status_code=400, detail="invalid_transition")
    if updated is not None:
        await db.commission_logs.update_many(
            {"claim_id": oid, "status": {"$in": ["pending", "approved"]}},
            {"$set": {"status": "cancelled", "cancelled_at": datetime.now(timezone.utc), "cancel_reason": reason}},
        )
    await log_finance_action(
        db,
        admin=admin,
        action="cancel",
        target_type="claim",
        target_id=oid,
        old_status=normalized_settlement_status(claim),
        new_status="cancelled",
        amount=from_cents(read_cents(updated, cents_key="commission_amount_cents", legacy_key="commission_amount")),
        remark=reason,
    )
    return settlement_response(updated)


@router.post("/{claim_id}/freeze")
async def freeze_claim(
    claim_id: str,
    admin: dict = Depends(get_current_admin),
    db: AsyncIOMotorDatabase = Depends(get_db),
):
    oid = parse_object_id(claim_id, "claim_id")
    claim = await db.claims.find_one({"_id": oid})
    if not claim:
        raise HTTPException(status_code=404, detail="Claim not found")
    if normalized_settlement_status(claim) != "unpaid":
        raise HTTPException(status_code=400, detail="invalid_transition")
    updated = await db.claims.find_one_and_update(
        {"_id": oid, **settlement_filter("unpaid")},
        {"$set": {"settlement_status": "frozen", "frozen_at": datetime.now(timezone.utc)}},
        return_document=ReturnDocument.AFTER,
    )
    if not updated:
        raise HTTPException(status_code=409, detail="Claim status changed, please retry")
    await log_finance_action(
        db,
        admin=admin,
        action="freeze",
        target_type="claim",
        target_id=oid,
        old_status="unpaid",
        new_status="frozen",
        amount=from_cents(read_cents(updated, cents_key="commission_amount_cents", legacy_key="commission_amount")),
        remark="",
    )
    return settlement_response(updated)


@router.post("/{claim_id}/unfreeze")
async def unfreeze_claim(
    claim_id: str,
    admin: dict = Depends(get_current_admin),
    db: AsyncIOMotorDatabase = Depends(get_db),
):
    oid = parse_object_id(claim_id, "claim_id")
    claim = await db.claims.find_one({"_id": oid})
    if not claim:
        raise HTTPException(status_code=404, detail="Claim not found")
    if normalized_settlement_status(claim) != "frozen":
        raise HTTPException(status_code=400, detail="invalid_transition")
    updated = await db.claims.find_one_and_update(
        {"_id": oid, "settlement_status": "frozen"},
        {"$set": {"settlement_status": "unpaid", "frozen_at": None}},
        return_document=ReturnDocument.AFTER,
    )
    if not updated:
        raise HTTPException(status_code=409, detail="Claim status changed, please retry")
    await log_finance_action(
        db,
        admin=admin,
        action="unfreeze",
        target_type="claim",
        target_id=oid,
        old_status="frozen",
        new_status="unpaid",
        amount=from_cents(read_cents(updated, cents_key="commission_amount_cents", legacy_key="commission_amount")),
        remark="",
    )
    return settlement_response(updated)


@router.get("/{claim_id}")
async def get_claim(claim_id: str, db: AsyncIOMotorDatabase = Depends(get_db)):
    claim = await db.claims.find_one({"_id": parse_object_id(claim_id, "claim_id")})
    if not claim:
        raise HTTPException(status_code=404, detail="Claim not found")
    return serialize_claim(claim)
