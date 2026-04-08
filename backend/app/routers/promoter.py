import math
from datetime import datetime, timezone
from bson import ObjectId
from fastapi import APIRouter, Depends, Query
from motor.motor_asyncio import AsyncIOMotorDatabase
from app.database import get_db
from app.dependencies import get_current_staff
from app.utils.helpers import to_str_id

router = APIRouter()


@router.get("/home")
async def home(
    current_staff: dict = Depends(get_current_staff),
    db: AsyncIOMotorDatabase = Depends(get_db),
):
    staff = current_staff
    sid = staff["_id"]
    today_start = datetime.now(timezone.utc).replace(hour=0, minute=0, second=0, microsecond=0)
    today_scans = await db.claims.count_documents({"staff_id": sid, "created_at": {"$gte": today_start}})
    today_valid = await db.claims.count_documents({"staff_id": sid, "status": "success", "created_at": {"$gte": today_start}})

    pipeline = [
        {"$match": {"beneficiary_staff_id": sid, "created_at": {"$gte": today_start}}},
        {"$group": {"_id": None, "total": {"$sum": "$amount"}}},
    ]
    agg = await db.commission_logs.aggregate(pipeline).to_list(length=1)
    today_commission = agg[0]["total"] if agg else 0

    settled = 0
    pending = 0
    available = 0
    for st, field in [("paid", "settled"), ("pending", "pending"), ("approved", "available")]:
        p = [{"$match": {"beneficiary_staff_id": sid, "status": st}}, {"$group": {"_id": None, "t": {"$sum": "$amount"}}}]
        r = await db.commission_logs.aggregate(p).to_list(length=1)
        val = r[0]["t"] if r else 0
        if field == "settled":
            settled = val
        elif field == "pending":
            pending = val
        else:
            available = val

    s = to_str_id(dict(staff))
    s.pop("password_hash", None)
    for k in ("parent_id", "campaign_id"):
        if isinstance(s.get(k), ObjectId):
            s[k] = str(s[k])

    return {
        "staff": s,
        "today": {"scans": today_scans, "valid_claims": today_valid, "commission": today_commission},
        "settlement": {"available": available, "settled": settled, "pending": pending},
    }


@router.get("/qrcode")
async def qrcode(current_staff: dict = Depends(get_current_staff)):
    return {
        "qr_data": f"/welcome/{current_staff['invite_code']}",
        "invite_code": current_staff["invite_code"],
        "staff_no": current_staff["staff_no"],
    }


@router.get("/team")
async def team(
    level: str | None = None, page: int = Query(1, ge=1), page_size: int = Query(20, ge=1, le=100),
    current_staff: dict = Depends(get_current_staff),
    db: AsyncIOMotorDatabase = Depends(get_db),
):
    query: dict = {"ancestor_id": current_staff["_id"]}
    if level and level != "all":
        query["level"] = int(level)
    relations = await db.staff_relations.find(query).skip((page - 1) * page_size).limit(page_size).to_list(length=page_size)
    total = await db.staff_relations.count_documents(query)
    members = []
    for rel in relations:
        member = await db.staff_users.find_one({"_id": rel["staff_id"]}, {"password_hash": 0})
        if member:
            m = to_str_id(dict(member))
            m["level"] = rel["level"]
            members.append(m)
    return {"items": members, "total": total, "page": page, "page_size": page_size,
            "pages": math.ceil(total / page_size) if total else 0}


@router.get("/commission")
async def commission(
    page: int = Query(1, ge=1), page_size: int = Query(20, ge=1, le=100),
    level: int | None = None,
    current_staff: dict = Depends(get_current_staff),
    db: AsyncIOMotorDatabase = Depends(get_db),
):
    query: dict = {"beneficiary_staff_id": current_staff["_id"]}
    if level:
        query["level"] = level
    cursor = db.commission_logs.find(query).sort("created_at", -1).skip((page - 1) * page_size).limit(page_size)
    items = await cursor.to_list(length=page_size)
    total = await db.commission_logs.count_documents(query)
    from app.utils.helpers import to_str_ids
    return {"items": to_str_ids(items), "total": total, "page": page, "page_size": page_size,
            "pages": math.ceil(total / page_size) if total else 0}
