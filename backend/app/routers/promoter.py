import math
from datetime import datetime, timedelta, timezone
from bson import ObjectId
from fastapi import APIRouter, Depends, HTTPException, Query
from motor.motor_asyncio import AsyncIOMotorDatabase
from pymongo import ReturnDocument
from app.database import get_db
from app.dependencies import get_current_staff
from app.schemas.common import PageResponse
from app.services.withdrawals import (
    create_withdrawal_request,
    fetch_withdrawal_page,
    get_payout_account_or_404,
    get_withdrawal_balance_snapshot,
)
from app.utils.datetime import get_day_start_utc
from app.schemas.staff import WorkPauseRequest
from app.utils.helpers import to_str_id, to_str_ids
from app.utils.live_token import generate_pin, generate_token_signature

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
    today_start = get_day_start_utc()
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
        try:
            query["level"] = int(level)
        except ValueError as exc:
            raise HTTPException(status_code=400, detail="Invalid level filter") from exc
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
    status: str | None = None,
    commission_type: str | None = Query(None, alias="type"),
    current_staff: dict = Depends(get_current_staff),
    db: AsyncIOMotorDatabase = Depends(get_db),
):
    query: dict = {"beneficiary_staff_id": current_staff["_id"]}
    if level:
        query["level"] = level
    if status:
        query["status"] = status
    if commission_type:
        query["type"] = commission_type
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


@router.post("/withdrawal-requests")
async def create_withdrawal(
    payload: dict,
    current_staff: dict = Depends(get_current_staff),
    db: AsyncIOMotorDatabase = Depends(get_db),
):
    try:
        amount = float(payload.get("amount", 0))
    except (TypeError, ValueError) as exc:
        raise HTTPException(status_code=400, detail="Invalid amount") from exc
    if not math.isfinite(amount):
        raise HTTPException(status_code=400, detail="Invalid amount")
    if amount <= 0:
        raise HTTPException(status_code=400, detail="Withdrawal amount must be greater than 0")
    payout_account_id = parse_object_id(payload.get("payout_account_id", ""), "Invalid payout account id")
    balance = await get_withdrawal_balance_snapshot(db, current_staff["_id"])
    if amount > max(balance["available"], 0):
        raise HTTPException(status_code=400, detail="Withdrawal amount exceeds available balance")
    payout_account = await get_payout_account_or_404(db, current_staff["_id"], payout_account_id)
    return to_str_id(
        await create_withdrawal_request(
            db,
            staff_id=current_staff["_id"],
            amount=amount,
            payout_account=payout_account,
        )
    )


@router.get("/withdrawal-requests", response_model=PageResponse)
async def list_withdrawals(
    page: int = Query(1, ge=1),
    page_size: int = Query(20, ge=1, le=100),
    status: str | None = None,
    current_staff: dict = Depends(get_current_staff),
    db: AsyncIOMotorDatabase = Depends(get_db),
) -> PageResponse:
    query: dict = {"staff_id": current_staff["_id"]}
    if status:
        query["status"] = status
    return PageResponse(**await fetch_withdrawal_page(db, query=query, page=page, page_size=page_size, include_staff=False))


@router.get("/withdrawal-balance")
async def withdrawal_balance(
    current_staff: dict = Depends(get_current_staff),
    db: AsyncIOMotorDatabase = Depends(get_db),
):
    return await get_withdrawal_balance_snapshot(db, current_staff["_id"])


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


async def _enforce_live_qr_rate_limit(db: AsyncIOMotorDatabase, staff_id: ObjectId, now: datetime) -> None:
    one_min_ago = now - timedelta(seconds=60)
    recent = await db.promo_live_tokens.count_documents({
        "staff_id": staff_id,
        "created_at": {"$gte": one_min_ago},
    })
    if recent >= 10:
        raise HTTPException(status_code=429, detail="too_many_refresh")


async def _increment_qr_version(db: AsyncIOMotorDatabase, staff_id: ObjectId) -> int:
    updated = await db.staff_users.find_one_and_update(
        {"_id": staff_id},
        {"$inc": {"qr_version": 1}},
        projection={"qr_version": 1},
        return_document=ReturnDocument.AFTER,
    )
    if not updated:
        raise HTTPException(status_code=404, detail="staff_not_found")
    return int(updated.get("qr_version", 0))


@router.post("/live-qr/generate")
async def live_qr_generate(
    current_staff: dict = Depends(get_current_staff),
    db: AsyncIOMotorDatabase = Depends(get_db),
):
    if not current_staff.get("campaign_id"):
        raise HTTPException(status_code=400, detail="no_active_campaign")
    now = datetime.now(timezone.utc)
    await _enforce_live_qr_rate_limit(db, current_staff["_id"], now)
    await db.promo_live_tokens.update_many(
        {"staff_id": current_staff["_id"], "status": "active"},
        {"$set": {"status": "rotated"}},
    )
    qr_version = await _increment_qr_version(db, current_staff["_id"])
    expires_sec = int(await get_setting(db, "live_qr_expires_sec", 300) or 300)
    expires_at = now + timedelta(seconds=expires_sec)
    pin = generate_pin()
    token_signature = generate_token_signature(str(current_staff["_id"]), qr_version)
    insert = await db.promo_live_tokens.insert_one({
        "staff_id": current_staff["_id"],
        "campaign_id": current_staff["campaign_id"],
        "pin": pin,
        "token_signature": token_signature,
        "qr_version": qr_version,
        "status": "active",
        "failures": 0,
        "expires_at": expires_at,
        "created_at": now,
        "consumed_at": None,
        "consumed_device_fingerprint": "",
    })
    return {
        "live_token_id": str(insert.inserted_id),
        "qr_data": f"/pin/{current_staff['invite_code']}?lt={token_signature}&v={qr_version}",
        "pin": pin,
        "expires_at": expires_at.isoformat(),
        "qr_version": qr_version,
    }


# ─── Work status (start/stop/pause/resume) + heartbeat ────────────────────────

async def _log_activity(db, staff_id: ObjectId, action: str, reason: str = "") -> None:
    await db.promotion_activity_logs.insert_one({
        "staff_id": staff_id,
        "action": action,
        "reason": reason,
        "created_at": datetime.now(timezone.utc),
    })


def _work_state_response(staff: dict) -> dict:
    def _iso(dt):
        return dt.isoformat() if dt else None
    return {
        "work_status": staff.get("work_status", "stopped"),
        "promotion_paused": bool(staff.get("promotion_paused", False)),
        "pause_reason": staff.get("pause_reason", ""),
        "paused_at": _iso(staff.get("paused_at")),
        "resumed_at": _iso(staff.get("resumed_at")),
        "started_promoting_at": _iso(staff.get("started_promoting_at")),
        "stopped_promoting_at": _iso(staff.get("stopped_promoting_at")),
    }


@router.post("/work/start")
async def work_start(
    current_staff: dict = Depends(get_current_staff),
    db: AsyncIOMotorDatabase = Depends(get_db),
):
    if current_staff.get("work_status", "stopped") != "stopped":
        raise HTTPException(status_code=400, detail="invalid_transition")
    now = datetime.now(timezone.utc)
    await db.staff_users.update_one(
        {"_id": current_staff["_id"]},
        {"$set": {
            "work_status": "promoting",
            "promotion_paused": False,
            "pause_reason": "",
            "started_promoting_at": now,
            "updated_at": now,
        }},
    )
    await _log_activity(db, current_staff["_id"], "start")
    staff = await db.staff_users.find_one({"_id": current_staff["_id"]})
    return _work_state_response(staff)


@router.post("/work/stop")
async def work_stop(
    current_staff: dict = Depends(get_current_staff),
    db: AsyncIOMotorDatabase = Depends(get_db),
):
    ws = current_staff.get("work_status", "stopped")
    if ws not in ("promoting", "paused"):
        raise HTTPException(status_code=400, detail="invalid_transition")
    now = datetime.now(timezone.utc)
    await db.staff_users.update_one(
        {"_id": current_staff["_id"]},
        {"$set": {
            "work_status": "stopped",
            "promotion_paused": False,
            "stopped_promoting_at": now,
            "updated_at": now,
        }},
    )
    await _log_activity(db, current_staff["_id"], "stop")
    staff = await db.staff_users.find_one({"_id": current_staff["_id"]})
    return _work_state_response(staff)


@router.post("/work/pause")
async def work_pause(
    payload: WorkPauseRequest,
    current_staff: dict = Depends(get_current_staff),
    db: AsyncIOMotorDatabase = Depends(get_db),
):
    if current_staff.get("work_status", "stopped") != "promoting":
        raise HTTPException(status_code=400, detail="invalid_transition")
    reason = (payload.reason or "").strip()
    if not reason:
        raise HTTPException(status_code=400, detail="reason_required")
    now = datetime.now(timezone.utc)
    await db.staff_users.update_one(
        {"_id": current_staff["_id"]},
        {"$set": {
            "work_status": "paused",
            "promotion_paused": True,
            "pause_reason": reason,
            "paused_at": now,
            "updated_at": now,
        }},
    )
    await _log_activity(db, current_staff["_id"], "pause", reason)
    staff = await db.staff_users.find_one({"_id": current_staff["_id"]})
    return _work_state_response(staff)


@router.post("/work/resume")
async def work_resume(
    current_staff: dict = Depends(get_current_staff),
    db: AsyncIOMotorDatabase = Depends(get_db),
):
    if current_staff.get("work_status", "stopped") != "paused":
        raise HTTPException(status_code=400, detail="invalid_transition")
    now = datetime.now(timezone.utc)
    await db.staff_users.update_one(
        {"_id": current_staff["_id"]},
        {"$set": {
            "work_status": "promoting",
            "promotion_paused": False,
            "resumed_at": now,
            "updated_at": now,
        }},
    )
    await _log_activity(db, current_staff["_id"], "resume")
    staff = await db.staff_users.find_one({"_id": current_staff["_id"]})
    return _work_state_response(staff)


@router.post("/heartbeat")
async def heartbeat(
    current_staff: dict = Depends(get_current_staff),
    db: AsyncIOMotorDatabase = Depends(get_db),
):
    now = datetime.now(timezone.utc)
    last = current_staff.get("last_seen_at")
    # Soft rate limit: if last_seen_at within 20s, no-op
    if last:
        if last.tzinfo is None:
            last = last.replace(tzinfo=timezone.utc)
        if (now - last).total_seconds() < 20:
            return {"ok": True, "last_seen_at": last.isoformat()}
    await db.staff_users.update_one(
        {"_id": current_staff["_id"]},
        {"$set": {"last_seen_at": now}},
    )
    return {"ok": True, "last_seen_at": now.isoformat()}
