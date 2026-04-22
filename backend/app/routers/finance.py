import math
from datetime import datetime, timezone
from bson import ObjectId
from fastapi import APIRouter, Depends, HTTPException, Query
from motor.motor_asyncio import AsyncIOMotorDatabase
from app.database import get_db
from app.dependencies import get_current_admin
from app.schemas.common import MessageResponse, PageResponse
from app.services.commission import generate_commission_no
from app.services.withdrawals import (
    fetch_withdrawal_page,
    get_withdrawal_or_404,
    log_finance_action,
    sum_amount_cents,
)
from app.utils.helpers import to_str_id, to_str_ids
from app.utils.money import from_cents, read_cents, to_cents

router = APIRouter(dependencies=[Depends(get_current_admin)])


def parse_object_id(value: str, message: str) -> ObjectId:
    try:
        return ObjectId(value)
    except Exception as exc:
        raise HTTPException(status_code=400, detail=message) from exc


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
    payload: dict,
    admin: dict = Depends(get_current_admin),
    db: AsyncIOMotorDatabase = Depends(get_db),
):
    staff_id = parse_object_id(payload.get("staff_id", ""), "Invalid staff id")
    try:
        amount = float(payload["amount"])
    except Exception as exc:
        raise HTTPException(status_code=400, detail="Invalid amount") from exc
    if not math.isfinite(amount) or amount < 0:
        raise HTTPException(status_code=400, detail="Settlement amount must be greater than or equal to 0")
    amount_cents = to_cents(amount)
    remark = payload.get("remark", "")
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
    return MessageResponse(message=f"Settled {len(settle_claim_ids)} claim records")


@router.post("/combined-settle", response_model=MessageResponse)
async def combined_settle(
    payload: dict,
    db: AsyncIOMotorDatabase = Depends(get_db),
) -> MessageResponse:
    """Settle direct commissions and, optionally, claimed bonus records for one staff."""
    staff_id = payload.get("staff_id")
    if not staff_id or not ObjectId.is_valid(staff_id):
        raise HTTPException(status_code=400, detail="staff_id required")
    sid = ObjectId(staff_id)
    cid = None
    if payload.get("campaign_id"):
        if not ObjectId.is_valid(payload["campaign_id"]):
            raise HTTPException(status_code=400, detail="Invalid campaign_id")
        cid = ObjectId(payload["campaign_id"])
    include_bonus = bool(payload.get("include_bonus", True))

    now = datetime.now(timezone.utc)
    commission_filter = {"beneficiary_staff_id": sid, "status": "approved", "type": "direct"}
    if cid is not None:
        commission_filter["campaign_id"] = cid
    comm_result = await db.commission_logs.update_many(
        commission_filter,
        {"$set": {"status": "paid", "paid_at": now}},
    )

    bonus_count = 0
    if include_bonus:
        bonus_filter = {"staff_id": sid, "status": "claimed"}
        if cid is not None:
            bonus_filter["campaign_id"] = cid
        async for rec in db.bonus_claim_records.find(bonus_filter):
            amount_cents = int(rec.get("amount_cents") or to_cents(rec.get("amount") or 0))
            flip = await db.bonus_claim_records.find_one_and_update(
                {"_id": rec["_id"], "status": "claimed"},
                {"$set": {"status": "settled", "settled_at": now}},
            )
            if flip is None:
                continue
            await db.commission_logs.insert_one({
                "commission_no": generate_commission_no(),
                "claim_id": None,
                "type": "bonus",
                "bonus_record_id": rec["_id"],
                "beneficiary_staff_id": sid,
                "source_staff_id": sid,
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
                {"_id": sid},
                {"$inc": {
                    "stats.total_commission": from_cents(amount_cents),
                    "stats.total_commission_cents": amount_cents,
                }},
            )
            bonus_count += 1
    return MessageResponse(
        message=f"Settled {comm_result.modified_count} commissions and {bonus_count} bonus records"
    )


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
    return MessageResponse(message="Commission approved")


@router.put("/commission/{commission_id}/reject", response_model=MessageResponse)
async def reject_commission(
    commission_id: str,
    payload: dict,
    admin: dict = Depends(get_current_admin),
    db: AsyncIOMotorDatabase = Depends(get_db),
):
    oid = parse_object_id(commission_id, "Invalid commission id")
    commission = await db.commission_logs.find_one({"_id": oid})
    if not commission:
        raise HTTPException(status_code=404, detail="Commission not found")
    if commission.get("status") != "pending":
        raise HTTPException(status_code=400, detail="Only pending commissions can be rejected")
    reason = payload.get("reason", "").strip()
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
    return MessageResponse(message="Withdrawal request approved")


@router.put("/withdrawal-requests/{request_id}/reject", response_model=MessageResponse)
async def reject_withdrawal(
    request_id: str,
    payload: dict,
    admin: dict = Depends(get_current_admin),
    db: AsyncIOMotorDatabase = Depends(get_db),
) -> MessageResponse:
    oid = parse_object_id(request_id, "Invalid withdrawal request id")
    withdrawal = await get_withdrawal_or_404(db, oid)
    if withdrawal.get("status") != "pending":
        raise HTTPException(status_code=400, detail="Only pending withdrawal requests can be rejected")
    reason = str(payload.get("reason", "")).strip()
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
    return MessageResponse(message="Withdrawal request rejected")


@router.put("/withdrawal-requests/{request_id}/complete", response_model=MessageResponse)
async def complete_withdrawal(
    request_id: str,
    payload: dict,
    admin: dict = Depends(get_current_admin),
    db: AsyncIOMotorDatabase = Depends(get_db),
) -> MessageResponse:
    oid = parse_object_id(request_id, "Invalid withdrawal request id")
    withdrawal = await get_withdrawal_or_404(db, oid)
    if withdrawal.get("status") != "approved":
        raise HTTPException(status_code=400, detail="Only approved withdrawal requests can be completed")
    transaction_no = str(payload.get("transaction_no", "")).strip()
    if not transaction_no:
        raise HTTPException(status_code=400, detail="Transaction number is required")
    remark = str(payload.get("remark", "")).strip()
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
