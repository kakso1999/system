import re
from datetime import date, datetime, timezone

from bson import ObjectId
from fastapi import APIRouter, Depends, HTTPException, Query, status
from motor.motor_asyncio import AsyncIOMotorDatabase
from pymongo import ReturnDocument
from pymongo.errors import DuplicateKeyError

from app.database import get_db
from app.dependencies import get_current_staff, get_super_admin
from app.schemas.bonus import (
    BonusClaimRequest,
    BonusClaimRecordListResponse,
    BonusClaimRecordResponse,
    BonusClaimResponse,
    BonusRecordStatus,
    BonusRuleListResponse,
    BonusRuleResponse,
    BonusRuleUpsertRequest,
    BonusTodayResponse,
    DailyBonusSettlementListResponse,
    DailyBonusSettlementResponse,
    SuccessResponse,
)
from app.services.bonus import (
    create_bonus_commission_log,
    get_bonus_claim_context,
    get_today_bonus_progress,
    insert_bonus_claim_record,
    sorted_tiers,
)
from app.services.commission import generate_commission_no
from app.utils.helpers import to_str_id
from app.utils.money import from_cents, read_cents, to_cents

router = APIRouter(dependencies=[Depends(get_super_admin)])
promoter_router = APIRouter()
DATE_RE = re.compile(r"^\d{4}-\d{2}-\d{2}$")


def parse_object_id(value: str, field_name: str) -> ObjectId:
    if not ObjectId.is_valid(value):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Invalid {field_name}",
        )
    return ObjectId(value)


def parse_optional_object_id(value: str | None, field_name: str) -> ObjectId | None:
    if value is None:
        return None
    return parse_object_id(value, field_name)


def validate_date_filter(value: str | None, field_name: str) -> str | None:
    if value is None:
        return None
    if not DATE_RE.match(value):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Invalid {field_name}",
        )
    try:
        date.fromisoformat(value)
    except ValueError as exc:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Invalid {field_name}",
        ) from exc
    return value


def build_list_query(
    date_from: str | None,
    date_to: str | None,
    staff_id: str | None,
) -> dict:
    query: dict = {}
    start = validate_date_filter(date_from, "date_from")
    end = validate_date_filter(date_to, "date_to")
    if start or end:
        query["date"] = {}
        if start:
            query["date"]["$gte"] = start
        if end:
            query["date"]["$lte"] = end
    if staff_id:
        query["staff_id"] = parse_object_id(staff_id, "staff_id")
    return query


async def fetch_staff_names(
    db: AsyncIOMotorDatabase,
    staff_ids: list[ObjectId],
) -> dict[str, str | None]:
    if not staff_ids:
        return {}
    docs = await db.staff_users.find(
        {"_id": {"$in": staff_ids}},
        {"name": 1},
    ).to_list(length=len(staff_ids))
    return {str(doc["_id"]): doc.get("name") for doc in docs}


def serialize_bonus_rule(
    doc: dict,
    staff_name: str | None = None,
) -> dict:
    data = to_str_id(doc)
    return {
        "id": data["id"],
        "staff_id": data.get("staff_id"),
        "staff_name": staff_name,
        "tiers": sorted_tiers(data.get("tiers", [])),
        "enabled": data.get("enabled", True),
        "created_at": data["created_at"],
        "updated_at": data["updated_at"],
    }


def serialize_bonus_record(doc: dict) -> dict:
    data = to_str_id(doc)
    cents = read_cents(doc)
    return {
        "id": data["id"],
        "staff_id": data["staff_id"],
        "date": data["date"],
        "tier_threshold": data["tier_threshold"],
        "amount": from_cents(cents),
        "valid_count_at_claim": data["valid_count_at_claim"],
        "status": data["status"],
        "created_at": data["created_at"],
    }


def serialize_bonus_settlement(doc: dict) -> dict:
    data = to_str_id(doc)
    cents = read_cents(doc, cents_key="total_bonus_cents", legacy_key="total_bonus")
    return {
        "id": data["id"],
        "staff_id": data["staff_id"],
        "date": data["date"],
        "total_valid": data["total_valid"],
        "total_bonus": from_cents(cents),
        "created_at": data["created_at"],
    }


@router.get("/rules", response_model=BonusRuleListResponse)
async def list_bonus_rules(
    db: AsyncIOMotorDatabase = Depends(get_db),
) -> BonusRuleListResponse:
    docs = await db.staff_bonus_rules.find().sort("updated_at", -1).to_list(length=1000)
    staff_ids = [doc["staff_id"] for doc in docs if doc.get("staff_id")]
    staff_names = await fetch_staff_names(db, staff_ids)
    items = [
        BonusRuleResponse.model_validate(
            serialize_bonus_rule(doc, staff_names.get(str(doc.get("staff_id"))))
        )
        for doc in docs
    ]
    global_default = next((item for item in items if item.staff_id is None), None)
    return BonusRuleListResponse(items=items, global_default=global_default)


@router.post("/rules", response_model=BonusRuleResponse)
async def upsert_bonus_rule(
    payload: BonusRuleUpsertRequest,
    current_admin: dict = Depends(get_super_admin),
    db: AsyncIOMotorDatabase = Depends(get_db),
) -> BonusRuleResponse:
    staff_id = parse_optional_object_id(payload.staff_id, "staff_id")
    staff = None
    if staff_id is not None:
        staff = await db.staff_users.find_one({"_id": staff_id}, {"name": 1})
        if not staff:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Staff not found")

    now = datetime.now(timezone.utc)
    query = {"staff_id": staff_id}
    updates = {
        "tiers": sorted_tiers([tier.model_dump() for tier in payload.tiers]),
        "enabled": payload.enabled,
        "updated_at": now,
    }
    try:
        doc = await db.staff_bonus_rules.find_one_and_update(
            query,
            {
                "$set": updates,
                "$setOnInsert": {
                    "staff_id": staff_id,
                    "created_at": now,
                    "created_by_admin_id": current_admin.get("_id"),
                },
            },
            upsert=True,
            return_document=ReturnDocument.AFTER,
        )
    except DuplicateKeyError as exc:
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="bonus_rule_conflict") from exc
    return BonusRuleResponse.model_validate(serialize_bonus_rule(doc, staff.get("name") if staff else None))


@router.delete("/rules/{rule_id}", response_model=SuccessResponse)
async def delete_bonus_rule(
    rule_id: str,
    db: AsyncIOMotorDatabase = Depends(get_db),
) -> SuccessResponse:
    rule = await db.staff_bonus_rules.find_one({"_id": parse_object_id(rule_id, "rule_id")})
    if not rule:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Bonus rule not found")
    if rule.get("staff_id") is None:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="cannot_delete_global_default")
    await db.staff_bonus_rules.delete_one({"_id": rule["_id"]})
    return SuccessResponse(success=True)


@router.get("/settlements", response_model=DailyBonusSettlementListResponse)
async def list_bonus_settlements(
    date_from: str | None = None,
    date_to: str | None = None,
    staff_id: str | None = None,
    page: int = Query(1, ge=1),
    page_size: int = Query(20, ge=1, le=100),
    db: AsyncIOMotorDatabase = Depends(get_db),
) -> DailyBonusSettlementListResponse:
    query = build_list_query(date_from, date_to, staff_id)
    cursor = db.daily_bonus_settlements.find(query)
    cursor = cursor.sort([("date", -1), ("created_at", -1)])
    docs = await cursor.skip((page - 1) * page_size).limit(page_size).to_list(length=page_size)
    total = await db.daily_bonus_settlements.count_documents(query)
    items = [DailyBonusSettlementResponse.model_validate(serialize_bonus_settlement(doc)) for doc in docs]
    return DailyBonusSettlementListResponse(items=items, total=total, page=page, page_size=page_size)


@router.get("/records", response_model=BonusClaimRecordListResponse)
async def list_bonus_records(
    date_from: str | None = None,
    date_to: str | None = None,
    staff_id: str | None = None,
    status_value: BonusRecordStatus | None = Query(None, alias="status"),
    page: int = Query(1, ge=1),
    page_size: int = Query(20, ge=1, le=100),
    db: AsyncIOMotorDatabase = Depends(get_db),
) -> BonusClaimRecordListResponse:
    query = build_list_query(date_from, date_to, staff_id)
    if status_value:
        query["status"] = status_value
    cursor = db.bonus_claim_records.find(query).sort("created_at", -1)
    docs = await cursor.skip((page - 1) * page_size).limit(page_size).to_list(length=page_size)
    total = await db.bonus_claim_records.count_documents(query)
    items = [BonusClaimRecordResponse.model_validate(serialize_bonus_record(doc)) for doc in docs]
    return BonusClaimRecordListResponse(items=items, total=total, page=page, page_size=page_size)


@router.post("/settle-batch", response_model=SuccessResponse)
async def settle_bonus_batch(
    payload: dict,
    db: AsyncIOMotorDatabase = Depends(get_db),
) -> SuccessResponse:
    """Mark claimed bonus records as settled and write matching paid bonus commission logs."""
    ids = payload.get("record_ids") or []
    if not isinstance(ids, list) or not ids:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="record_ids required")
    oids: list[ObjectId] = []
    for rid in ids:
        if not ObjectId.is_valid(rid):
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=f"Invalid record_id {rid}")
        oids.append(ObjectId(rid))

    now = datetime.now(timezone.utc)
    settled = 0
    async for rec in db.bonus_claim_records.find({"_id": {"$in": oids}, "status": "claimed"}):
        amount_cents = int(rec.get("amount_cents") or to_cents(rec.get("amount") or 0))
        result = await db.bonus_claim_records.find_one_and_update(
            {"_id": rec["_id"], "status": "claimed"},
            {"$set": {"status": "settled", "settled_at": now}},
            return_document=ReturnDocument.AFTER,
        )
        if result is None:
            continue
        await db.commission_logs.insert_one({
            "commission_no": generate_commission_no(),
            "claim_id": None,
            "type": "bonus",
            "bonus_record_id": rec["_id"],
            "beneficiary_staff_id": rec["staff_id"],
            "source_staff_id": rec["staff_id"],
            "level": 0,
            "amount_cents": amount_cents,
            "amount": from_cents(amount_cents),
            "status": "paid",
            "created_at": now,
            "paid_at": now,
            "rate": 0.0,
            "vip_level_at_time": 0,
            "currency": "PHP",
            "campaign_id": rec.get("campaign_id"),
        })
        await db.staff_users.update_one(
            {"_id": rec["staff_id"]},
            {"$inc": {
                "stats.total_commission": from_cents(amount_cents),
                "stats.total_commission_cents": amount_cents,
            }},
        )
        settled += 1
    return SuccessResponse(success=bool(settled))


async def promoter_bonus_progress_stub():
    raise NotImplementedError("Promoter bonus progress belongs to Wave 2 Task G2.")


async def promoter_bonus_claim_stub():
    raise NotImplementedError("Promoter bonus claim belongs to Wave 2 Task G2.")


@promoter_router.get("/today", response_model=BonusTodayResponse)
async def get_promoter_bonus_today(
    current_staff: dict = Depends(get_current_staff),
    db: AsyncIOMotorDatabase = Depends(get_db),
) -> BonusTodayResponse:
    progress = await get_today_bonus_progress(db, current_staff["_id"])
    return BonusTodayResponse.model_validate(progress)


@promoter_router.post("/claim", response_model=BonusClaimResponse)
async def claim_promoter_bonus(
    payload: BonusClaimRequest,
    current_staff: dict = Depends(get_current_staff),
    db: AsyncIOMotorDatabase = Depends(get_db),
) -> BonusClaimResponse:
    try:
        date_str, valid_count, rule, tier = await get_bonus_claim_context(
            db,
            current_staff["_id"],
            payload.tier_threshold,
        )
    except ValueError as exc:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(exc)) from exc

    now = datetime.now(timezone.utc)
    try:
        record = await insert_bonus_claim_record(
            db,
            current_staff["_id"],
            date_str,
            rule,
            tier,
            valid_count,
            now,
        )
    except DuplicateKeyError as exc:
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="already_claimed") from exc

    amount_cents = int(record.get("amount_cents") or to_cents(record.get("amount")))
    await create_bonus_commission_log(db, current_staff, record["_id"], amount_cents, now)
    return BonusClaimResponse.model_validate(serialize_bonus_record(record))


@promoter_router.get("/history", response_model=BonusClaimRecordListResponse)
async def list_promoter_bonus_history(
    date_from: str | None = None,
    date_to: str | None = None,
    page: int = Query(1, ge=1),
    page_size: int = Query(20, ge=1, le=100),
    current_staff: dict = Depends(get_current_staff),
    db: AsyncIOMotorDatabase = Depends(get_db),
) -> BonusClaimRecordListResponse:
    query = build_list_query(date_from, date_to, None)
    query["staff_id"] = current_staff["_id"]
    cursor = db.bonus_claim_records.find(query).sort("created_at", -1)
    docs = await cursor.skip((page - 1) * page_size).limit(page_size).to_list(length=page_size)
    total = await db.bonus_claim_records.count_documents(query)
    items = [BonusClaimRecordResponse.model_validate(serialize_bonus_record(doc)) for doc in docs]
    return BonusClaimRecordListResponse(items=items, total=total, page=page, page_size=page_size)
