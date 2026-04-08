import math
from datetime import datetime, timezone
from bson import ObjectId
from fastapi import APIRouter, Depends, HTTPException, Query
from motor.motor_asyncio import AsyncIOMotorDatabase
from app.database import get_db
from app.dependencies import get_current_admin
from app.schemas.common import MessageResponse, PageResponse
from app.utils.helpers import to_str_id, to_str_ids

router = APIRouter(dependencies=[Depends(get_current_admin)])


@router.get("/overview")
async def overview(db: AsyncIOMotorDatabase = Depends(get_db)):
    async def sum_by_status(st):
        p = [{"$match": {"status": st}}, {"$group": {"_id": None, "t": {"$sum": "$amount"}}}]
        r = await db.commission_logs.aggregate(p).to_list(length=1)
        return r[0]["t"] if r else 0
    return {
        "total_commission": await sum_by_status("paid") + await sum_by_status("pending") + await sum_by_status("approved"),
        "total_paid": await sum_by_status("paid"),
        "total_pending": await sum_by_status("pending"),
        "total_approved": await sum_by_status("approved"),
        "total_frozen": await sum_by_status("frozen"),
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
        paid_p = [{"$match": {"beneficiary_staff_id": sid, "status": "paid"}}, {"$group": {"_id": None, "t": {"$sum": "$amount"}}}]
        pending_p = [{"$match": {"beneficiary_staff_id": sid, "status": {"$in": ["pending", "approved"]}}}, {"$group": {"_id": None, "t": {"$sum": "$amount"}}}]
        paid_r = await db.commission_logs.aggregate(paid_p).to_list(length=1)
        pending_r = await db.commission_logs.aggregate(pending_p).to_list(length=1)
        item = to_str_id(dict(s))
        item["paid_amount"] = paid_r[0]["t"] if paid_r else 0
        item["pending_amount"] = pending_r[0]["t"] if pending_r else 0
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
    staff_id = ObjectId(payload["staff_id"])
    amount = float(payload["amount"])
    remark = payload.get("remark", "")
    staff = await db.staff_users.find_one({"_id": staff_id})
    if not staff:
        raise HTTPException(status_code=404, detail="Staff not found")

    # Validate: check total approved amount
    total_approved_pipeline = [
        {"$match": {"beneficiary_staff_id": staff_id, "status": "approved"}},
        {"$group": {"_id": None, "total": {"$sum": "$amount"}}},
    ]
    agg = await db.commission_logs.aggregate(total_approved_pipeline).to_list(length=1)
    total_approved = agg[0]["total"] if agg else 0
    if amount > total_approved:
        raise HTTPException(status_code=400, detail=f"Settlement amount {amount} exceeds approved balance {total_approved}")

    remaining = amount
    cursor = db.commission_logs.find(
        {"beneficiary_staff_id": staff_id, "status": "approved"}
    ).sort("created_at", 1)
    now = datetime.now(timezone.utc)
    settled_count = 0
    async for log in cursor:
        if remaining <= 0:
            break
        if log["amount"] > remaining:
            break  # Don't partially settle a single record
        await db.commission_logs.update_one(
            {"_id": log["_id"]},
            {"$set": {"status": "paid", "paid_at": now, "settled_by": admin.get("username", "admin")}},
        )
        remaining -= log["amount"]
        settled_count += 1

    await db.finance_action_logs.insert_one({
        "operator": admin.get("username", "admin"),
        "action": "settle",
        "target_type": "commission",
        "target_id": staff_id,
        "old_status": "approved",
        "new_status": "paid",
        "amount_change": amount,
        "remark": remark,
        "created_at": now,
    })
    return MessageResponse(message=f"Settled {settled_count} commission records")


@router.get("/settlement-records", response_model=PageResponse)
async def settlement_records(
    page: int = Query(1, ge=1), page_size: int = Query(20, ge=1, le=100),
    staff_id: str | None = None,
    db: AsyncIOMotorDatabase = Depends(get_db),
):
    query: dict = {"status": "paid"}
    if staff_id:
        query["beneficiary_staff_id"] = ObjectId(staff_id)
    cursor = db.commission_logs.find(query).sort("paid_at", -1).skip((page - 1) * page_size).limit(page_size)
    items = await cursor.to_list(length=page_size)
    total = await db.commission_logs.count_documents(query)
    return PageResponse(items=to_str_ids(items), total=total, page=page, page_size=page_size,
                        pages=math.ceil(total / page_size) if total else 0)


@router.get("/logs", response_model=PageResponse)
async def finance_logs(
    page: int = Query(1, ge=1), page_size: int = Query(20, ge=1, le=100),
    db: AsyncIOMotorDatabase = Depends(get_db),
):
    cursor = db.finance_action_logs.find().sort("created_at", -1).skip((page - 1) * page_size).limit(page_size)
    items = await cursor.to_list(length=page_size)
    total = await db.finance_action_logs.count_documents({})
    return PageResponse(items=to_str_ids(items), total=total, page=page, page_size=page_size,
                        pages=math.ceil(total / page_size) if total else 0)
