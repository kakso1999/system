import math
from datetime import datetime, timezone

from bson import ObjectId
from fastapi import APIRouter, Depends, HTTPException, Query
from motor.motor_asyncio import AsyncIOMotorDatabase

from app.database import get_db
from app.dependencies import get_current_admin
from app.schemas.common import MessageResponse, PageResponse
from app.schemas.requests import (
    CombinedSettleRequest,
    CommissionRejectRequest,
    ManualSettleRequest,
    SettlementBatchRequest,
    WithdrawalCompleteRequest,
    WithdrawalRejectRequest,
)
from app.services.commission import generate_commission_no
from app.services.withdrawals import (
    fetch_withdrawal_page,
    get_withdrawal_or_404,
    log_finance_action,
    sum_amount_cents,
)
from app.utils.action_log import log_admin_action
from app.utils.csv_export import csv_stream
from app.utils.helpers import to_str_id
from app.utils.money import from_cents, read_cents, to_cents

router = APIRouter(dependencies=[Depends(get_current_admin)])


def parse_object_id(value: str, message: str) -> ObjectId:
    try:
        return ObjectId(value)
    except Exception as exc:
        raise HTTPException(status_code=400, detail=message) from exc


def dedupe_object_ids(values: list[ObjectId]) -> list[ObjectId]:
    items: list[ObjectId] = []
    seen: set[ObjectId] = set()
    for value in values:
        if value in seen:
            continue
        seen.add(value)
        items.append(value)
    return items


def unpaid_settlement_filter() -> dict:
    return {"$or": [{"settlement_status": "unpaid"}, {"settlement_status": {"$exists": False}}]}


def serialize_commission_log(doc: dict) -> dict:
    data = to_str_id(doc)
    data["amount"] = from_cents(read_cents(doc))
    data.pop("amount_cents", None)
    return data


def serialize_finance_log(doc: dict) -> dict:
    data = to_str_id(doc)
    cents = read_cents(doc, cents_key="amount_change_cents", legacy_key="amount_change")
    data["amount_change"] = from_cents(cents)
    data.pop("amount_change_cents", None)
    return data


def serialize_settlement_batch(doc: dict) -> dict:
    data = to_str_id(doc)
    total_commission_cents = int(doc.get("total_commission_cents") or 0)
    return {
        "id": data["id"],
        "admin_id": data.get("admin_id"),
        "note": data.get("note", ""),
        "staff_ids": data.get("staff_ids", []),
        "include_bonus": bool(data.get("include_bonus", True)),
        "status": data.get("status", ""),
        "created_at": data.get("created_at"),
        "completed_at": data.get("completed_at"),
        "total_commission": from_cents(total_commission_cents),
        "total_commission_cents": total_commission_cents,
        "total_bonus_count": int(doc.get("total_bonus_count") or 0),
    }


def build_paid_bonus_log(
    record: dict,
    staff_id: ObjectId,
    amount_cents: int,
    now: datetime,
    batch_id: ObjectId | None,
) -> dict:
    document = {
        "commission_no": generate_commission_no(),
        "claim_id": None,
        "type": "bonus",
        "bonus_record_id": record["_id"],
        "beneficiary_staff_id": staff_id,
        "source_staff_id": staff_id,
        "level": 0,
        "amount_cents": amount_cents,
        "amount": from_cents(amount_cents),
        "status": "paid",
        "created_at": now,
        "paid_at": now,
        "rate": 0.0,
        "vip_level_at_time": 0,
        "currency": "PHP",
        "campaign_id": record.get("campaign_id"),
    }
    if batch_id is not None:
        document["settlement_batch_id"] = batch_id
    return document


async def settle_bonus_records(
    db: AsyncIOMotorDatabase,
    staff_id: ObjectId,
    now: datetime,
    include_bonus: bool,
    campaign_id: ObjectId | None = None,
    batch_id: ObjectId | None = None,
) -> int:
    if not include_bonus:
        return 0
    bonus_filter = {"staff_id": staff_id, "status": "claimed"}
    if campaign_id is not None:
        bonus_filter["campaign_id"] = campaign_id
    settled = 0
    async for record in db.bonus_claim_records.find(bonus_filter):
        amount_cents = int(record.get("amount_cents") or to_cents(record.get("amount") or 0))
        update_fields = {"status": "settled", "settled_at": now}
        if batch_id is not None:
            update_fields["settlement_batch_id"] = batch_id
        updated = await db.bonus_claim_records.find_one_and_update(
            {"_id": record["_id"], "status": "claimed"},
            {"$set": update_fields},
        )
        if updated is None:
            continue
        await db.commission_logs.insert_one(build_paid_bonus_log(record, staff_id, amount_cents, now, batch_id))
        await db.staff_users.update_one(
            {"_id": staff_id},
            {"$inc": {"stats.total_commission": from_cents(amount_cents), "stats.total_commission_cents": amount_cents}},
        )
        settled += 1
    return settled


async def settle_staff_records(
    db: AsyncIOMotorDatabase,
    staff_id: ObjectId,
    now: datetime,
    include_bonus: bool,
    campaign_id: ObjectId | None = None,
    batch_id: ObjectId | None = None,
) -> dict:
    commission_filter = {"beneficiary_staff_id": staff_id, "status": "approved", "type": "direct"}
    if campaign_id is not None:
        commission_filter["campaign_id"] = campaign_id
    commission_cents = await sum_amount_cents(db.commission_logs, commission_filter)
    commission_update = {"status": "paid", "paid_at": now}
    if batch_id is not None:
        commission_update["settlement_batch_id"] = batch_id
    commission_result = await db.commission_logs.update_many(commission_filter, {"$set": commission_update})
    bonus_count = await settle_bonus_records(db, staff_id, now, include_bonus, campaign_id, batch_id)
    return {
        "commission_count": commission_result.modified_count,
        "commission_cents": commission_cents,
        "bonus_count": bonus_count,
    }


async def update_settlement_batch(
    db: AsyncIOMotorDatabase,
    batch_id: ObjectId,
    status: str,
    completed_at: datetime,
    commission_cents: int,
    bonus_count: int,
) -> None:
    await db.settlement_batches.update_one(
        {"_id": batch_id},
        {
            "$set": {
                "status": status,
                "completed_at": completed_at,
                "total_commission_cents": commission_cents,
                "total_bonus_count": bonus_count,
            }
        },
    )


async def sum_claim_commission(db: AsyncIOMotorDatabase, query: dict) -> float:
    total_cents = 0
    async for claim in db.claims.find(query):
        total_cents += await claim_commission_amount_cents(db, claim)
    return from_cents(total_cents)


async def claim_commission_amount(db: AsyncIOMotorDatabase, claim: dict) -> float:
    return from_cents(await claim_commission_amount_cents(db, claim))


async def claim_commission_amount_cents(db: AsyncIOMotorDatabase, claim: dict) -> int:
    cents_val = claim.get("commission_amount_cents")
    if cents_val is not None:
        try:
            return int(cents_val)
        except (TypeError, ValueError):
            pass
    commission_amount = claim.get("commission_amount")
    if commission_amount is not None:
        return to_cents(commission_amount)
    pipeline = [
        {"$match": {"claim_id": claim["_id"]}},
        {"$group": {"_id": None, "t": {"$sum": "$amount_cents"}}},
    ]
    result = await db.commission_logs.aggregate(pipeline).to_list(length=1)
    if not result:
        return 0
    try:
        return int(result[0]["t"])
    except (TypeError, ValueError):
        return 0


@router.get("/overview")
async def overview(db: AsyncIOMotorDatabase = Depends(get_db)):
    async def sum_by_status(st):
        return await sum_amount_cents(db.commission_logs, {"status": st})
    paid_cents = await sum_by_status("paid")
    pending_cents = await sum_by_status("pending")
    approved_cents = await sum_by_status("approved")
    frozen_cents = await sum_by_status("frozen")
    return {
        "total_commission": from_cents(paid_cents + pending_cents + approved_cents),
        "total_paid": from_cents(paid_cents),
        "total_pending": from_cents(pending_cents),
        "total_approved": from_cents(approved_cents),
        "total_frozen": from_cents(frozen_cents),
        "settlement_pending": await sum_claim_commission(db, unpaid_settlement_filter()),
        "settlement_paid": await sum_claim_commission(db, {"settlement_status": "paid"}),
        "staff_count": await db.staff_users.count_documents({"status": "active"}),
    }


@router.get("/export/commissions")
async def export_commissions(db: AsyncIOMotorDatabase = Depends(get_db)):
    cursor = db.commission_logs.find(
        {},
        {
            "commission_no": 1,
            "claim_id": 1,
            "beneficiary_staff_id": 1,
            "source_staff_id": 1,
            "level": 1,
            "type": 1,
            "amount_cents": 1,
            "status": 1,
            "created_at": 1,
            "paid_at": 1,
        },
    ).sort("created_at", -1)

    async def rows():
        async for doc in cursor:
            yield [
                doc.get("commission_no", ""),
                str(doc.get("claim_id") or ""),
                str(doc.get("beneficiary_staff_id") or ""),
                str(doc.get("source_staff_id") or ""),
                doc.get("level", ""),
                doc.get("type", ""),
                int(doc.get("amount_cents") or 0) / 100.0,
                doc.get("status", ""),
                doc["created_at"].isoformat() if doc.get("created_at") else "",
                doc["paid_at"].isoformat() if doc.get("paid_at") else "",
            ]

    items = [row async for row in rows()]
    return csv_stream(
        items,
        ["commission_no", "claim_id", "beneficiary", "source", "level", "type", "amount", "status", "created_at", "paid_at"],
        "commissions.csv",
    )


@router.get("/export/withdrawals")
async def export_withdrawals(db: AsyncIOMotorDatabase = Depends(get_db)):
    cursor = db.withdrawal_requests.find(
        {},
        {"staff_id": 1, "amount_cents": 1, "amount": 1, "status": 1, "created_at": 1, "paid_at": 1},
    ).sort("created_at", -1)

    async def rows():
        async for doc in cursor:
            yield [
                str(doc.get("_id") or ""),
                str(doc.get("staff_id") or ""),
                from_cents(int(doc.get("amount_cents") or to_cents(doc.get("amount") or 0))),
                doc.get("status", ""),
                doc["created_at"].isoformat() if doc.get("created_at") else "",
                doc["paid_at"].isoformat() if doc.get("paid_at") else "",
            ]

    items = [row async for row in rows()]
    return csv_stream(
        items,
        ["id", "staff_id", "amount", "status", "created_at", "paid_at"],
        "withdrawals.csv",
    )


@router.get("/staff-performance", response_model=PageResponse)
async def staff_performance(
    page: int = Query(1, ge=1), page_size: int = Query(20, ge=1, le=100),
    db: AsyncIOMotorDatabase = Depends(get_db),
):
    cursor = db.staff_users.find({}, {"password_hash": 0}).sort("stats.total_valid", -1).skip((page - 1) * page_size).limit(page_size)
    items = await cursor.to_list(length=page_size)
    total = await db.staff_users.count_documents({})
    result = []
    for s in items:
        sid = s["_id"]
        paid_cents = await sum_amount_cents(db.commission_logs, {"beneficiary_staff_id": sid, "status": "paid"})
        pending_cents = await sum_amount_cents(db.commission_logs, {"beneficiary_staff_id": sid, "status": {"$in": ["pending", "approved"]}})
        bonus_cents = await sum_amount_cents(db.commission_logs, {"beneficiary_staff_id": sid, "type": "bonus"})
        item = to_str_id(dict(s))
        item["paid_amount"] = from_cents(paid_cents)
        item["pending_amount"] = from_cents(pending_cents)
        item["total_bonus"] = from_cents(bonus_cents)
        # Expose stats.total_commission_cents as the legacy float for UI compatibility.
        stats = dict(item.get("stats") or {})
        stats_cents = stats.get("total_commission_cents")
        if stats_cents is None:
            stats_cents = to_cents(stats.get("total_commission", 0))
        stats["total_commission"] = from_cents(int(stats_cents))
        stats["total_commission_cents"] = int(stats_cents)
        item["stats"] = stats
        item["settlement_pending"] = await sum_claim_commission(
            db,
            {"staff_id": sid, **unpaid_settlement_filter()},
        )
        item["settlement_paid"] = await sum_claim_commission(
            db,
            {"staff_id": sid, "settlement_status": "paid"},
        )
        for k in ("parent_id", "campaign_id"):
            if isinstance(item.get(k), ObjectId):
                item[k] = str(item[k])
        result.append(item)
    return PageResponse(items=result, total=total, page=page, page_size=page_size,
                        pages=math.ceil(total / page_size) if total else 0)


@router.post("/manual-settle")
async def manual_settle(
    payload: ManualSettleRequest,
    admin: dict = Depends(get_current_admin),
    db: AsyncIOMotorDatabase = Depends(get_db),
):
    staff_id = parse_object_id(payload.staff_id or "", "Invalid staff id")
    try:
        amount = float(payload.amount)
    except Exception as exc:
        raise HTTPException(status_code=400, detail="Invalid amount") from exc
    if not math.isfinite(amount) or amount < 0:
        raise HTTPException(status_code=400, detail="Settlement amount must be greater than or equal to 0")
    amount_cents = to_cents(amount)
    remark = payload.remark
    staff = await db.staff_users.find_one({"_id": staff_id})
    if not staff:
        raise HTTPException(status_code=404, detail="Staff not found")

    claims = await db.claims.find(
        {"staff_id": staff_id, **unpaid_settlement_filter()}
    ).sort("created_at", 1).to_list(length=100000)

    settle_claim_ids: list[ObjectId] = []
    settled_cents = 0
    for claim in claims:
        settle_claim_ids.append(claim["_id"])
        settled_cents += await claim_commission_amount_cents(db, claim)

    if amount_cents > settled_cents:
        raise HTTPException(
            status_code=400,
            detail=f"Settlement amount {amount} exceeds approved balance {from_cents(settled_cents)}",
        )
    if amount_cents != settled_cents:
        raise HTTPException(status_code=400, detail="Settlement amount must match full approved commission records")
    if not settle_claim_ids:
        raise HTTPException(status_code=400, detail="No approved commission records to settle")

    now = datetime.now(timezone.utc)
    approved_logs = await db.commission_logs.find(
        {"claim_id": {"$in": settle_claim_ids}, "status": "approved"},
        {"_id": 1},
    ).to_list(length=None)
    expected_log_ids = [log["_id"] for log in approved_logs]
    claim_update_result = await db.claims.update_many(
        {"_id": {"$in": settle_claim_ids}, **unpaid_settlement_filter()},
        {"$set": {"settlement_status": "paid", "settled_at": now}},
    )
    if claim_update_result.modified_count != len(settle_claim_ids):
        raise HTTPException(status_code=409, detail="Settlement conflict, please retry")
    try:
        if expected_log_ids:
            log_update_result = await db.commission_logs.update_many(
                {"_id": {"$in": expected_log_ids}, "status": "approved"},
                {"$set": {"status": "paid", "paid_at": now, "settled_by": admin.get("username", "admin")}},
            )
            if log_update_result.modified_count != len(expected_log_ids):
                raise RuntimeError("commission_logs modified count mismatch")
    except Exception as exc:
        await db.claims.update_many(
            {"_id": {"$in": settle_claim_ids}, "settlement_status": "paid", "settled_at": now},
            {"$set": {"settlement_status": "unpaid"}, "$unset": {"settled_at": ""}},
        )
        raise HTTPException(status_code=500, detail="Settlement commit failed; rolled back") from exc

    await log_finance_action(
        db,
        admin=admin,
        action="settle",
        target_type="claim",
        target_id=staff_id,
        old_status="unpaid",
        new_status="paid",
        amount=from_cents(settled_cents),
        remark=remark,
    )
    await log_admin_action(
        db,
        admin["_id"],
        "settlement.manual",
        "staff",
        staff_id,
        {"claim_count": len(settle_claim_ids), "amount": from_cents(settled_cents), "remark": remark},
    )
    return MessageResponse(message=f"Settled {len(settle_claim_ids)} claim records")


@router.post("/combined-settle", response_model=MessageResponse)
async def combined_settle(
    payload: CombinedSettleRequest,
    current_admin: dict = Depends(get_current_admin),
    db: AsyncIOMotorDatabase = Depends(get_db),
) -> MessageResponse:
    """Settle direct commissions and, optionally, claimed bonus records for one staff."""
    staff_id = payload.staff_id
    if not staff_id or not ObjectId.is_valid(staff_id):
        raise HTTPException(status_code=400, detail="staff_id required")
    sid = ObjectId(staff_id)
    cid = None
    if payload.campaign_id:
        if not ObjectId.is_valid(payload.campaign_id):
            raise HTTPException(status_code=400, detail="Invalid campaign_id")
        cid = ObjectId(payload.campaign_id)
    include_bonus = bool(payload.include_bonus)
    now = datetime.now(timezone.utc)
    settlement = await settle_staff_records(db, sid, now, include_bonus, cid)
    await log_admin_action(
        db,
        current_admin["_id"],
        "settlement.combined",
        "staff",
        sid,
        {
            "campaign_id": str(cid) if cid else None,
            "include_bonus": include_bonus,
            "commission_count": settlement["commission_count"],
            "commission_amount": from_cents(settlement["commission_cents"]),
            "bonus_count": settlement["bonus_count"],
        },
    )
    return MessageResponse(
        message=f"Settled {settlement['commission_count']} commissions and {settlement['bonus_count']} bonus records"
    )


@router.post("/settlement-batch", response_model=MessageResponse)
async def create_settlement_batch(
    payload: SettlementBatchRequest,
    current_admin: dict = Depends(get_current_admin),
    db: AsyncIOMotorDatabase = Depends(get_db),
):
    """Generate a settlement batch across multiple staff at once."""
    staff_ids = [ObjectId(value) for value in (payload.staff_ids or []) if ObjectId.is_valid(value)]
    if not staff_ids:
        raise HTTPException(status_code=400, detail="staff_ids required")
    unique_staff_ids = dedupe_object_ids(staff_ids)
    include_bonus = bool(payload.include_bonus)
    note = str(payload.note or "")[:500]
    now = datetime.now(timezone.utc)
    batch = {
        "admin_id": current_admin["_id"],
        "note": note,
        "staff_ids": unique_staff_ids,
        "include_bonus": include_bonus,
        "status": "pending",
        "created_at": now,
        "completed_at": None,
        "total_commission_cents": 0,
        "total_bonus_count": 0,
    }
    batch_result = await db.settlement_batches.insert_one(batch)
    commission_count = 0
    commission_cents = 0
    bonus_count = 0
    try:
        for staff_id in unique_staff_ids:
            settlement = await settle_staff_records(
                db,
                staff_id,
                now,
                include_bonus,
                batch_id=batch_result.inserted_id,
            )
            commission_count += settlement["commission_count"]
            commission_cents += settlement["commission_cents"]
            bonus_count += settlement["bonus_count"]
    except Exception:
        await update_settlement_batch(
            db,
            batch_result.inserted_id,
            "failed",
            datetime.now(timezone.utc),
            commission_cents,
            bonus_count,
        )
        raise
    await update_settlement_batch(
        db,
        batch_result.inserted_id,
        "completed",
        now,
        commission_cents,
        bonus_count,
    )
    await log_admin_action(
        db,
        current_admin["_id"],
        "settlement.batch",
        "settlement_batch",
        batch_result.inserted_id,
        {
            "staff_count": len(unique_staff_ids),
            "include_bonus": include_bonus,
            "note": note,
            "commission_count": commission_count,
            "commission_amount": from_cents(commission_cents),
            "bonus_count": bonus_count,
        },
    )
    return MessageResponse(message=f"Batch settled {commission_count} commissions and {bonus_count} bonus")


@router.get("/settlement-batches")
async def list_settlement_batches(db: AsyncIOMotorDatabase = Depends(get_db)):
    cursor = db.settlement_batches.find().sort("created_at", -1).limit(100)
    items = await cursor.to_list(length=100)
    return [serialize_settlement_batch(item) for item in items]


@router.get("/reconciliation")
async def reconciliation(db: AsyncIOMotorDatabase = Depends(get_db)):
    payable = await sum_amount_cents(db.commission_logs, {"status": "approved"})
    paid = await sum_amount_cents(db.commission_logs, {"status": "paid"})
    frozen = await sum_amount_cents(db.commission_logs, {"status": "rejected"})
    bonus_pending = await db.bonus_claim_records.count_documents({"status": "claimed"})
    anomalies: list[str] = []
    async for claim in db.claims.find({"status": "success"}, {"_id": 1}).limit(10000):
        has_commission = await db.commission_logs.find_one({"claim_id": claim["_id"]}, {"_id": 1})
        if not has_commission:
            anomalies.append(str(claim["_id"]))
    return {
        "payable_cents": payable,
        "paid_cents": paid,
        "frozen_cents": frozen,
        "bonus_pending_count": bonus_pending,
        "anomaly_count": len(anomalies),
        "anomaly_sample": anomalies[:20],
    }


@router.get("/settlement-records", response_model=PageResponse)
async def settlement_records(
    page: int = Query(1, ge=1), page_size: int = Query(20, ge=1, le=100),
    staff_id: str | None = None,
    db: AsyncIOMotorDatabase = Depends(get_db),
):
    query: dict = {"status": "paid"}
    if staff_id:
        query["beneficiary_staff_id"] = parse_object_id(staff_id, "staff_id")
    cursor = db.commission_logs.find(query).sort("paid_at", -1).skip((page - 1) * page_size).limit(page_size)
    items = await cursor.to_list(length=page_size)
    total = await db.commission_logs.count_documents(query)
    return PageResponse(items=[serialize_commission_log(item) for item in items], total=total, page=page, page_size=page_size,
                        pages=math.ceil(total / page_size) if total else 0)


@router.get("/logs", response_model=PageResponse)
async def finance_logs(
    page: int = Query(1, ge=1), page_size: int = Query(20, ge=1, le=100),
    db: AsyncIOMotorDatabase = Depends(get_db),
):
    cursor = db.finance_action_logs.find().sort("created_at", -1).skip((page - 1) * page_size).limit(page_size)
    items = await cursor.to_list(length=page_size)
    total = await db.finance_action_logs.count_documents({})
    return PageResponse(items=[serialize_finance_log(item) for item in items], total=total, page=page, page_size=page_size,
                        pages=math.ceil(total / page_size) if total else 0)


@router.put("/commission/{commission_id}/approve", response_model=MessageResponse)
async def approve_commission(
    commission_id: str,
    admin: dict = Depends(get_current_admin),
    db: AsyncIOMotorDatabase = Depends(get_db),
):
    oid = parse_object_id(commission_id, "Invalid commission id")
    commission = await db.commission_logs.find_one({"_id": oid})
    if not commission:
        raise HTTPException(status_code=404, detail="Commission not found")
    if commission.get("status") != "pending":
        raise HTTPException(status_code=400, detail="Only pending commissions can be approved")
    update_result = await db.commission_logs.update_one(
        {"_id": oid, "status": "pending"},
        {"$set": {"status": "approved", "approved_at": datetime.now(timezone.utc)}},
    )
    if not update_result.modified_count:
        raise HTTPException(status_code=409, detail="Commission status changed, please retry")
    await log_finance_action(
        db,
        admin=admin,
        action="approve",
        target_type="commission",
        target_id=oid,
        old_status="pending",
        new_status="approved",
        amount=from_cents(read_cents(commission)),
        remark="",
    )
    await log_admin_action(
        db,
        admin["_id"],
        "commission.approve",
        "commission",
        oid,
        {"from": "pending", "to": "approved"},
    )
    return MessageResponse(message="Commission approved")


@router.put("/commission/{commission_id}/reject", response_model=MessageResponse)
async def reject_commission(
    commission_id: str,
    payload: CommissionRejectRequest,
    admin: dict = Depends(get_current_admin),
    db: AsyncIOMotorDatabase = Depends(get_db),
):
    oid = parse_object_id(commission_id, "Invalid commission id")
    commission = await db.commission_logs.find_one({"_id": oid})
    if not commission:
        raise HTTPException(status_code=404, detail="Commission not found")
    if commission.get("status") != "pending":
        raise HTTPException(status_code=400, detail="Only pending commissions can be rejected")
    reason = payload.reason.strip()
    update_result = await db.commission_logs.update_one(
        {"_id": oid, "status": "pending"},
        {"$set": {"status": "rejected", "rejected_at": datetime.now(timezone.utc), "reject_reason": reason}},
    )
    if not update_result.modified_count:
        raise HTTPException(status_code=409, detail="Commission status changed, please retry")
    await log_finance_action(
        db,
        admin=admin,
        action="reject",
        target_type="commission",
        target_id=oid,
        old_status="pending",
        new_status="rejected",
        amount=from_cents(read_cents(commission)),
        remark=reason,
    )
    await log_admin_action(
        db,
        admin["_id"],
        "commission.reject",
        "commission",
        oid,
        {"from": "pending", "to": "rejected", "reason": reason},
    )
    return MessageResponse(message="Commission rejected")


@router.get("/commissions", response_model=PageResponse)
async def commissions(
    page: int = Query(1, ge=1),
    page_size: int = Query(20, ge=1, le=100),
    status: str | None = None,
    staff_id: str | None = None,
    level: int | None = None,
    type: str | None = None,
    db: AsyncIOMotorDatabase = Depends(get_db),
):
    query: dict = {}
    if status:
        query["status"] = status
    if staff_id:
        query["beneficiary_staff_id"] = parse_object_id(staff_id, "Invalid staff id")
    if level is not None:
        query["level"] = level
    if type:
        query["type"] = type
    cursor = db.commission_logs.find(query).sort("created_at", -1).skip((page - 1) * page_size).limit(page_size)
    items = await cursor.to_list(length=page_size)
    total = await db.commission_logs.count_documents(query)
    return PageResponse(items=[serialize_commission_log(item) for item in items], total=total, page=page, page_size=page_size,
                        pages=math.ceil(total / page_size) if total else 0)


@router.get("/withdrawal-requests", response_model=PageResponse)
async def admin_list_withdrawals(
    page: int = Query(1, ge=1),
    page_size: int = Query(20, ge=1, le=100),
    status: str | None = None,
    staff_id: str | None = None,
    db: AsyncIOMotorDatabase = Depends(get_db),
) -> PageResponse:
    query: dict = {}
    if status:
        query["status"] = status
    if staff_id:
        query["staff_id"] = parse_object_id(staff_id, "Invalid staff id")
    return PageResponse(**await fetch_withdrawal_page(db, query=query, page=page, page_size=page_size, include_staff=True))


@router.put("/withdrawal-requests/{request_id}/approve", response_model=MessageResponse)
async def approve_withdrawal(
    request_id: str,
    admin: dict = Depends(get_current_admin),
    db: AsyncIOMotorDatabase = Depends(get_db),
) -> MessageResponse:
    oid = parse_object_id(request_id, "Invalid withdrawal request id")
    withdrawal = await get_withdrawal_or_404(db, oid)
    if withdrawal.get("status") != "pending":
        raise HTTPException(status_code=400, detail="Only pending withdrawal requests can be approved")
    update_result = await db.withdrawal_requests.update_one(
        {"_id": oid, "status": "pending"},
        {"$set": {"status": "approved", "reviewed_at": datetime.now(timezone.utc), "reviewed_by": admin.get("username", "admin")}},
    )
    if not update_result.modified_count:
        raise HTTPException(status_code=409, detail="Withdrawal status changed, please retry")
    await log_finance_action(
        db, admin=admin, action="approve", target_type="withdrawal", target_id=oid,
        old_status="pending", new_status="approved", amount=from_cents(read_cents(withdrawal)), remark=""
    )
    await log_admin_action(
        db,
        admin["_id"],
        "withdrawal.approve",
        "withdrawal",
        oid,
        {"from": "pending", "to": "approved"},
    )
    return MessageResponse(message="Withdrawal request approved")


@router.put("/withdrawal-requests/{request_id}/reject", response_model=MessageResponse)
async def reject_withdrawal(
    request_id: str,
    payload: WithdrawalRejectRequest,
    admin: dict = Depends(get_current_admin),
    db: AsyncIOMotorDatabase = Depends(get_db),
) -> MessageResponse:
    oid = parse_object_id(request_id, "Invalid withdrawal request id")
    withdrawal = await get_withdrawal_or_404(db, oid)
    if withdrawal.get("status") != "pending":
        raise HTTPException(status_code=400, detail="Only pending withdrawal requests can be rejected")
    reason = str(payload.reason).strip()
    if not reason:
        raise HTTPException(status_code=400, detail="Reject reason is required")
    update_result = await db.withdrawal_requests.update_one(
        {"_id": oid, "status": "pending"},
        {"$set": {"status": "rejected", "reject_reason": reason, "reviewed_at": datetime.now(timezone.utc), "reviewed_by": admin.get("username", "admin")}},
    )
    if not update_result.modified_count:
        raise HTTPException(status_code=409, detail="Withdrawal status changed, please retry")
    await log_finance_action(
        db, admin=admin, action="reject", target_type="withdrawal", target_id=oid,
        old_status="pending", new_status="rejected", amount=from_cents(read_cents(withdrawal)), remark=reason
    )
    await log_admin_action(
        db,
        admin["_id"],
        "withdrawal.reject",
        "withdrawal",
        oid,
        {"from": "pending", "to": "rejected", "reason": reason},
    )
    return MessageResponse(message="Withdrawal request rejected")


@router.put("/withdrawal-requests/{request_id}/complete", response_model=MessageResponse)
async def complete_withdrawal(
    request_id: str,
    payload: WithdrawalCompleteRequest,
    admin: dict = Depends(get_current_admin),
    db: AsyncIOMotorDatabase = Depends(get_db),
) -> MessageResponse:
    oid = parse_object_id(request_id, "Invalid withdrawal request id")
    withdrawal = await get_withdrawal_or_404(db, oid)
    if withdrawal.get("status") != "approved":
        raise HTTPException(status_code=400, detail="Only approved withdrawal requests can be completed")
    transaction_no = str(payload.transaction_no).strip()
    if not transaction_no:
        raise HTTPException(status_code=400, detail="Transaction number is required")
    remark = str(payload.remark).strip()
    update_result = await db.withdrawal_requests.update_one(
        {"_id": oid, "status": "approved"},
        {"$set": {"status": "paid", "transaction_no": transaction_no, "remark": remark or None, "paid_at": datetime.now(timezone.utc), "paid_by": admin.get("username", "admin")}},
    )
    if not update_result.modified_count:
        raise HTTPException(status_code=409, detail="Withdrawal status changed, please retry")
    await log_finance_action(
        db, admin=admin, action="complete", target_type="withdrawal", target_id=oid,
        old_status="approved", new_status="paid", amount=from_cents(read_cents(withdrawal)), remark=remark or transaction_no
    )
    return MessageResponse(message="Withdrawal request completed")
