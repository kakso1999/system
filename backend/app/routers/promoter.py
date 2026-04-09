import math
from datetime import datetime, timezone
from bson import ObjectId
from fastapi import APIRouter, Depends, HTTPException, Query
from motor.motor_asyncio import AsyncIOMotorDatabase
from app.database import get_db
from app.dependencies import get_current_staff
from app.utils.helpers import to_str_id, to_str_ids

router = APIRouter()


async def get_setting(db, key: str, default=None):
    doc = await db.system_settings.find_one({"key": key})
    return doc["value"] if doc else default


def parse_object_id(value: str, message: str) -> ObjectId:
    try:
        return ObjectId(value)
    except Exception as exc:
        raise HTTPException(status_code=400, detail=message) from exc


async def load_thresholds(db):
    return [
        {"level": 1, "threshold": int(await get_setting(db, "vip_threshold_1", 10)), "label": "VIP1"},
        {"level": 2, "threshold": int(await get_setting(db, "vip_threshold_2", 100)), "label": "VIP2"},
        {"level": 3, "threshold": int(await get_setting(db, "vip_threshold_3", 1000)), "label": "VIP3"},
        {"level": 4, "threshold": int(await get_setting(db, "vip_threshold_svip", 10000)), "label": "SVIP"},
    ]


async def calculate_team_total(db, staff_id: ObjectId, own_total: int) -> int:
    total = own_total
    cursor = db.staff_relations.find({"ancestor_id": staff_id}, {"staff_id": 1})
    async for relation in cursor:
        member = await db.staff_users.find_one({"_id": relation["staff_id"]}, {"stats.total_valid": 1})
        total += int((member or {}).get("stats", {}).get("total_valid", 0))
    return total


@router.get("/home")
async def home(
    current_staff: dict = Depends(get_current_staff),
    db: AsyncIOMotorDatabase = Depends(get_db),
):
    staff = current_staff
    sid = staff["_id"]
    today_start = datetime.now(timezone.utc).replace(hour=0, minute=0, second=0, microsecond=0)
    today_scans = await db.scan_logs.count_documents({"staff_id": sid, "created_at": {"$gte": today_start}})
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


@router.get("/payout-accounts")
async def payout_accounts(
    current_staff: dict = Depends(get_current_staff),
    db: AsyncIOMotorDatabase = Depends(get_db),
):
    items = await db.staff_payout_accounts.find({"staff_id": current_staff["_id"]}).sort("created_at", -1).to_list(length=100)
    return {"items": to_str_ids(items)}


@router.post("/payout-accounts")
async def add_payout_account(
    payload: dict,
    current_staff: dict = Depends(get_current_staff),
    db: AsyncIOMotorDatabase = Depends(get_db),
):
    now = datetime.now(timezone.utc)
    has_default = await db.staff_payout_accounts.find_one({"staff_id": current_staff["_id"], "is_default": True})
    document = {
        "staff_id": current_staff["_id"],
        "type": payload.get("type", ""),
        "account_name": payload.get("account_name", ""),
        "account_number": payload.get("account_number", ""),
        "bank_name": payload.get("bank_name", ""),
        "is_default": not bool(has_default),
        "created_at": now,
        "updated_at": now,
    }
    result = await db.staff_payout_accounts.insert_one(document)
    document["_id"] = result.inserted_id
    return to_str_id(document)


@router.put("/payout-accounts/{account_id}")
async def update_payout_account(
    account_id: str,
    payload: dict,
    current_staff: dict = Depends(get_current_staff),
    db: AsyncIOMotorDatabase = Depends(get_db),
):
    oid = parse_object_id(account_id, "Invalid account id")
    update_data = {
        "type": payload.get("type", ""),
        "account_name": payload.get("account_name", ""),
        "account_number": payload.get("account_number", ""),
        "bank_name": payload.get("bank_name", ""),
        "updated_at": datetime.now(timezone.utc),
    }
    result = await db.staff_payout_accounts.update_one({"_id": oid, "staff_id": current_staff["_id"]}, {"$set": update_data})
    if not result.matched_count:
        raise HTTPException(status_code=404, detail="Payout account not found")
    account = await db.staff_payout_accounts.find_one({"_id": oid})
    return to_str_id(account)


@router.delete("/payout-accounts/{account_id}")
async def delete_payout_account(
    account_id: str,
    current_staff: dict = Depends(get_current_staff),
    db: AsyncIOMotorDatabase = Depends(get_db),
):
    oid = parse_object_id(account_id, "Invalid account id")
    account = await db.staff_payout_accounts.find_one({"_id": oid, "staff_id": current_staff["_id"]})
    if not account:
        raise HTTPException(status_code=404, detail="Payout account not found")
    await db.staff_payout_accounts.delete_one({"_id": oid})
    if account.get("is_default"):
        replacement = await db.staff_payout_accounts.find_one({"staff_id": current_staff["_id"]}, sort=[("created_at", 1)])
        if replacement:
            await db.staff_payout_accounts.update_one({"_id": replacement["_id"]}, {"$set": {"is_default": True, "updated_at": datetime.now(timezone.utc)}})
    return {"message": "Payout account deleted"}


@router.put("/payout-accounts/{account_id}/default")
async def set_default_payout_account(
    account_id: str,
    current_staff: dict = Depends(get_current_staff),
    db: AsyncIOMotorDatabase = Depends(get_db),
):
    oid = parse_object_id(account_id, "Invalid account id")
    account = await db.staff_payout_accounts.find_one({"_id": oid, "staff_id": current_staff["_id"]})
    if not account:
        raise HTTPException(status_code=404, detail="Payout account not found")
    now = datetime.now(timezone.utc)
    await db.staff_payout_accounts.update_many({"staff_id": current_staff["_id"]}, {"$set": {"is_default": False, "updated_at": now}})
    await db.staff_payout_accounts.update_one({"_id": oid}, {"$set": {"is_default": True, "updated_at": now}})
    updated = await db.staff_payout_accounts.find_one({"_id": oid})
    return to_str_id(updated)


@router.get("/vip-progress")
async def vip_progress(
    current_staff: dict = Depends(get_current_staff),
    db: AsyncIOMotorDatabase = Depends(get_db),
):
    total_valid = int(current_staff.get("stats", {}).get("total_valid", 0))
    thresholds = await load_thresholds(db)
    next_threshold = next((item["threshold"] for item in thresholds if total_valid < item["threshold"]), None)
    needed = max(next_threshold - total_valid, 0) if next_threshold is not None else 0
    return {
        "current_level": int(current_staff.get("vip_level", 0)),
        "total_valid": total_valid,
        "thresholds": thresholds,
        "next_threshold": next_threshold,
        "needed": needed,
    }


@router.get("/team-rewards")
async def team_rewards(
    current_staff: dict = Depends(get_current_staff),
    db: AsyncIOMotorDatabase = Depends(get_db),
):
    own_total = int(current_staff.get("stats", {}).get("total_valid", 0))
    team_total = await calculate_team_total(db, current_staff["_id"], own_total)
    reward_items = await db.team_rewards.find({"staff_id": current_staff["_id"]}).sort("created_at", -1).to_list(length=100)
    reward_map = {item["milestone"]: item for item in reward_items}
    milestones = []
    for key in ("team_reward_100", "team_reward_1000", "team_reward_10000"):
        threshold = int(await get_setting(db, f"{key}_threshold", 0))
        amount = float(await get_setting(db, key, 0))
        awarded = reward_map.get(key)
        milestones.append({
            "threshold": threshold,
            "amount": amount,
            "awarded": bool(awarded),
            "awarded_at": awarded["created_at"].isoformat() if awarded else None,
        })
    return {"team_total": team_total, "milestones": milestones, "rewards": to_str_ids(reward_items)}
