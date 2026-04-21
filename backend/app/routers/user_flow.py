import re
import secrets
import string
from datetime import datetime, timedelta, timezone

from bson import ObjectId
from fastapi import APIRouter, BackgroundTasks, Depends, Header, HTTPException, Query, Request
from motor.motor_asyncio import AsyncIOMotorDatabase
from pymongo import ReturnDocument
from pymongo.errors import DuplicateKeyError

from app.database import get_db
from app.services.commission import calculate_commissions
from app.services.team_reward import check_team_rewards
from app.services.vip import check_vip_upgrade
from app.utils.live_token import generate_session_token
from app.utils.security import sign_result_token, verify_result_token
from app.utils.sms import send_sms

router = APIRouter()

PHONE_RE = re.compile(r"^\+?[1-9]\d{6,14}$")


async def get_setting(db, key: str):
    doc = await db.system_settings.find_one({"key": key})
    return doc["value"] if doc else None


async def process_post_claim(db, staff_doc, claim_id, campaign_id):
    await check_vip_upgrade(db, staff_doc["_id"])
    latest_staff = await db.staff_users.find_one({"_id": staff_doc["_id"]})
    if not latest_staff:
        return
    await calculate_commissions(db, latest_staff, claim_id, campaign_id)
    await check_team_rewards(db, latest_staff)


async def get_active_campaign_or_404(db, campaign_id: ObjectId) -> dict:
    campaign = await db.campaigns.find_one({"_id": campaign_id, "status": "active"})
    if not campaign:
        raise HTTPException(status_code=404, detail="Campaign not found or inactive")
    return campaign


def safe_object_id(value):
    """Convert to ObjectId safely, return None on failure."""
    if not value:
        return None
    try:
        return ObjectId(value) if isinstance(value, str) else value
    except Exception:
        return None


def parse_object_id(value: str, field_name: str) -> ObjectId:
    oid = safe_object_id(value)
    if not isinstance(oid, ObjectId):
        raise HTTPException(status_code=400, detail=f"Invalid {field_name}")
    return oid


async def log_risk(db, campaign_id, phone, ip, device_fp, rule, reason):
    await db.risk_logs.insert_one({
        "campaign_id": safe_object_id(campaign_id),
        "phone": phone,
        "ip": ip,
        "device_fingerprint": device_fp,
        "type": rule,
        "reason": reason,
        "created_at": datetime.now(timezone.utc),
    })


async def check_risk(db, phone, ip, device_fp, campaign_id) -> list[dict]:
    """Check all risk rules. Returns list of {rule, reason} dicts."""
    hits = []
    cid = safe_object_id(campaign_id)

    # 1. Phone unique
    if await get_setting(db, "risk_phone_unique"):
        if await db.claims.find_one({"phone": phone, "campaign_id": cid, "status": "success"}):
            hits.append({"rule": "phone_duplicate", "reason": f"Phone {phone[-4:]} already claimed in this campaign"})

    # 2. IP unique
    if await get_setting(db, "risk_ip_unique") and ip:
        if await db.claims.find_one({"ip": ip, "campaign_id": cid, "status": "success"}):
            hits.append({"rule": "ip_duplicate", "reason": f"IP {ip} already claimed in this campaign"})

    # 3. Device fingerprint unique
    if await get_setting(db, "risk_device_unique") and device_fp:
        if await db.claims.find_one({"device_fingerprint": device_fp, "campaign_id": cid, "status": "success"}):
            hits.append({"rule": "device_duplicate", "reason": "Device already claimed in this campaign"})

    # 4. Rate limit: max 5 claims per IP per hour per campaign
    if ip:
        one_hour_ago = datetime.now(timezone.utc) - timedelta(hours=1)
        recent_count = await db.claims.count_documents({
            "ip": ip, "campaign_id": cid, "created_at": {"$gte": one_hour_ago}
        })
        if recent_count >= 5:
            hits.append({"rule": "rate_limit", "reason": f"IP {ip} exceeded 5 claims per hour"})

    return hits


async def _require_active_session(db, session_token: str | None, staff_oid, mismatch_code: str = "session_required"):
    if not session_token:
        raise HTTPException(status_code=403, detail={"code": "session_required"})
    now = datetime.now(timezone.utc)
    session = await db.promo_sessions.find_one({
        "session_token": session_token, "status": "active",
    })
    if not session:
        raise HTTPException(status_code=403, detail={"code": "session_required"})
    exp = session.get("expires_at")
    if exp and exp.tzinfo is None:
        exp = exp.replace(tzinfo=timezone.utc)
    if not exp or exp <= now:
        raise HTTPException(status_code=403, detail={"code": "session_required"})
    if session.get("staff_id") != staff_oid:
        raise HTTPException(status_code=403, detail={"code": mismatch_code})
    return session


def validate_phone(phone: str) -> str:
    """Validate and normalize phone number. Raises HTTPException if invalid."""
    phone = phone.strip()
    if not phone:
        raise HTTPException(status_code=422, detail="Phone number is required")
    if not PHONE_RE.match(phone):
        raise HTTPException(status_code=422, detail="Invalid phone number format")
    if not phone.startswith("+"):
        phone = f"+{phone}"
    return phone


def no_prize_result() -> dict:
    return {
        "result_index": -1,
        "wheel_item": {
            "id": "",
            "display_name": "No Prize",
            "type": "none",
            "display_text": "Sorry, better luck next time!",
        },
    }


def _new_spin_token() -> str:
    return secrets.token_urlsafe(24)


def generate_reward_code() -> str:
    alphabet = string.ascii_uppercase + string.digits
    return "RC" + "".join(secrets.choice(alphabet) for _ in range(8))


async def create_generated_reward_code(db, *, campaign_id, wheel_item_id, staff_id, phone):
    now = datetime.now(timezone.utc)
    for _ in range(5):
        code = generate_reward_code()
        rc_doc = {
            "code": code,
            "campaign_id": campaign_id,
            "wheel_item_id": wheel_item_id,
            "pool_type": "auto_generated",
            "staff_id": staff_id,
            "phone": phone,
            "status": "assigned",
            "created_at": now,
            "updated_at": now,
        }
        try:
            result = await db.reward_codes.insert_one(rc_doc)
            return code, result.inserted_id
        except DuplicateKeyError:
            continue
    raise HTTPException(status_code=500, detail="Failed to generate reward code, please retry")


@router.get("/welcome/{staff_code}")
async def welcome(
    staff_code: str,
    request: Request,
    session_token: str | None = None,
    db: AsyncIOMotorDatabase = Depends(get_db),
):
    staff = await db.staff_users.find_one({"invite_code": staff_code.upper()})
    if not staff:
        raise HTTPException(status_code=404, detail="Promoter not found")
    campaign = None
    if staff.get("campaign_id"):
        campaign = await db.campaigns.find_one({"_id": staff["campaign_id"], "status": "active"})
    if not campaign:
        raise HTTPException(status_code=404, detail="No active campaign")
    if await get_setting(db, "live_qr_enabled"):
        await _require_active_session(db, session_token, staff["_id"])

    await db.staff_users.update_one({"_id": staff["_id"]}, {"$inc": {"stats.total_scans": 1}})
    await db.scan_logs.insert_one({
        "staff_id": staff["_id"],
        "campaign_id": campaign["_id"],
        "ip": request.client.host if request.client else "",
        "created_at": datetime.now(timezone.utc),
    })

    items = await db.wheel_items.find(
        {"campaign_id": campaign["_id"], "enabled": True}
    ).sort("sort_order", 1).to_list(length=50)

    return {
        "staff_name": staff["name"],
        "sms_enabled": True,
        "campaign": {
            "id": str(campaign["_id"]), "name": campaign["name"],
            "description": campaign.get("description", ""),
            "rules_text": campaign.get("rules_text", ""),
            "no_prize_weight": campaign.get("no_prize_weight", 10),
        },
        "wheel_items": [
            {"id": str(i["_id"]), "display_name": i["display_name"],
             "type": i["type"], "sort_order": i["sort_order"],
             "weight": i.get("weight", 10), "image_url": i.get("image_url", "")}
            for i in items
        ],
    }


@router.post("/spin")
async def spin(
    payload: dict,
    request: Request,
    session_token_header: str | None = Header(None, alias="X-Session-Token"),
    db: AsyncIOMotorDatabase = Depends(get_db),
):
    staff_code = str(payload.get("staff_code", "")).strip().upper()
    cid_str = payload.get("campaign_id", "")
    if not staff_code:
        raise HTTPException(status_code=422, detail="staff_code is required")

    cid = parse_object_id(cid_str, "campaign_id")
    campaign = await get_active_campaign_or_404(db, cid)
    staff = await db.staff_users.find_one({"invite_code": staff_code})
    if not staff:
        raise HTTPException(status_code=404, detail="Promoter not found")
    if staff.get("campaign_id") != campaign["_id"]:
        raise HTTPException(status_code=400, detail="Campaign does not match promoter")
    if await get_setting(db, "live_qr_enabled"):
        await _require_active_session(db, session_token_header, staff["_id"])
    items = await db.wheel_items.find(
        {"campaign_id": cid, "enabled": True}
    ).sort("sort_order", 1).to_list(length=50)
    if not items:
        raise HTTPException(status_code=400, detail="No wheel items")

    no_prize_weight = int(campaign.get("no_prize_weight", 10) or 0)
    all_weights = [int(i.get("weight", 10) or 0) for i in items]
    if no_prize_weight > 0:
        all_weights.append(no_prize_weight)

    # Use secrets for randomness
    total_weight = sum(all_weights)
    chosen = -1
    if total_weight > 0:
        rand_val = secrets.randbelow(total_weight)
        chosen = 0
        cumulative = 0
        for i, w in enumerate(all_weights):
            cumulative += w
            if rand_val < cumulative:
                chosen = i
                break

    no_prize = chosen < 0 or chosen >= len(items)
    item = None
    wheel_item_id = None
    if not no_prize:
        item = items[chosen]
        max_per_staff = int(item.get("max_per_staff", 0) or 0)
        if max_per_staff > 0 and staff:
            claimed_count = await db.claims.count_documents({
                "staff_id": staff["_id"],
                "wheel_item_id": item["_id"],
                "campaign_id": cid,
                "status": "success",
            })
            if claimed_count >= max_per_staff:
                no_prize = True
                chosen = -1
                item = None
        if not no_prize:
            wheel_item_id = item["_id"]

    spin_token = _new_spin_token()
    now = datetime.now(timezone.utc)
    await db.spin_outcomes.insert_one({
        "spin_token": spin_token,
        "staff_id": staff["_id"],
        "campaign_id": cid,
        "wheel_item_id": wheel_item_id,
        "no_prize": no_prize,
        "status": "pending",
        "session_token": session_token_header,
        "created_at": now,
        "expires_at": now + timedelta(minutes=15),
        "consumed_at": None,
    })

    if no_prize:
        return {
            "result_index": -1,
            "spin_token": spin_token,
            "wheel_item": {
                "id": "",
                "display_name": "No Prize",
                "type": "none",
                "display_text": "Sorry, better luck next time!",
            },
        }

    return {
        "result_index": chosen,
        "spin_token": spin_token,
        "wheel_item": {
            "id": str(item["_id"]), "display_name": item["display_name"],
            "type": item["type"], "display_text": item.get("display_text", ""),
            "redirect_url": item.get("redirect_url", ""),
        },
    }


@router.post("/verify-phone")
async def verify_phone(payload: dict, request: Request, db: AsyncIOMotorDatabase = Depends(get_db)):
    phone = payload.get("phone", "").strip()
    campaign_id = payload.get("campaign_id", "")

    sms_on = await get_setting(db, "sms_verification")

    # Validate phone format
    phone = validate_phone(phone)

    ip = request.client.host if request.client else ""

    now = datetime.now(timezone.utc)
    cooldown_sec = int(await get_setting(db, "sms_cooldown_sec") or 60)
    if cooldown_sec > 0:
        recent = await db.otp_records.find_one(
            {"phone": phone}, sort=[("created_at", -1)]
        )
        if recent and recent.get("created_at"):
            last_ts = recent["created_at"]
            if last_ts.tzinfo is None:
                last_ts = last_ts.replace(tzinfo=timezone.utc)
            if (now - last_ts).total_seconds() < cooldown_sec:
                await log_risk(db, campaign_id, phone, ip, "",
                               "otp_cooldown", f"Phone {phone[-4:]} cooldown active")
                return {"verified": False, "message": "Please wait before requesting another code."}

    phone_limit = int(await get_setting(db, "phone_daily_limit") or 3)
    ten_min_ago = now - timedelta(minutes=10)
    recent_otp_count = await db.otp_records.count_documents({
        "phone": phone, "created_at": {"$gte": ten_min_ago}
    })
    if recent_otp_count >= phone_limit:
        await log_risk(db, campaign_id, phone, ip, "",
                       "otp_rate_limit", f"Phone {phone[-4:]} requested too many OTPs")
        return {"verified": False, "message": "Too many requests. Please wait a few minutes."}

    ip_limit = int(await get_setting(db, "ip_daily_limit") or 20)
    ip_window_min = int(await get_setting(db, "ip_window_min") or 60)
    ip_window_ago = now - timedelta(minutes=ip_window_min)
    ip_otp_count = await db.otp_records.count_documents({
        "ip": ip, "created_at": {"$gte": ip_window_ago}
    })
    if ip_otp_count >= ip_limit:
        await log_risk(db, campaign_id, phone, ip, "",
                       "otp_ip_rate_limit", f"IP {ip} too many OTP requests")
        return {"verified": False, "message": "Too many requests from this network."}

    # Generate 6-digit OTP using cryptographically secure random
    code = str(secrets.randbelow(900000) + 100000)

    # sms_verification ON = real SMS, OFF = demo mode (popup code)
    if sms_on:
        # Real SMS mode: send first, record only on success
        sms_result = await send_sms(db, phone, code, "10")
        if not sms_result["success"]:
            return {"verified": False, "message": f"SMS send failed: {sms_result['message']}",
                    "sms_error": True}

    # Record OTP (both demo and real modes)
    now = datetime.now(timezone.utc)
    await db.otp_records.insert_one({
        "phone": phone, "code": code, "used": False,
        "attempts": 0,
        "campaign_id": safe_object_id(campaign_id),
        "ip": ip,
        "expires_at": now + timedelta(minutes=10),
        "created_at": now,
    })

    if sms_on:
        return {"verified": False, "message": "OTP sent", "otp_sent": True}
    else:
        # Demo mode: return code to frontend for display
        return {"verified": False, "message": "OTP sent (test mode)", "otp_sent": True, "demo_code": code}


@router.post("/verify-otp")
async def verify_otp(payload: dict, db: AsyncIOMotorDatabase = Depends(get_db)):
    campaign_id = payload.get("campaign_id", "")
    cid = safe_object_id(campaign_id)
    if cid is None:
        return {"verified": False, "message": "campaign_id required"}
    phone = payload.get("phone", "").strip()
    otp_code = payload.get("code", "").strip()
    if not phone or not otp_code:
        return {"verified": False, "message": "Phone and OTP code are required"}
    try:
        phone = validate_phone(phone)
    except HTTPException:
        return {"verified": False, "message": "Invalid phone number format"}

    now = datetime.now(timezone.utc)

    # Check if the latest OTP has too many failed attempts
    latest = await db.otp_records.find_one(
        {"phone": phone, "campaign_id": cid, "used": False, "expires_at": {"$gt": now}},
        sort=[("created_at", -1)],
    )
    if not latest:
        return {"verified": False, "message": "Invalid or expired OTP"}

    if latest.get("attempts", 0) >= 5:
        # Burn the OTP after 5 failed attempts (CRIT-3 fix)
        await db.otp_records.update_one({"_id": latest["_id"]}, {"$set": {"used": True}})
        return {"verified": False, "message": "Too many failed attempts. Please request a new code."}

    # Atomic check-and-consume OTP (CRIT-4 fix)
    record = await db.otp_records.find_one_and_update(
        {
            "_id": latest["_id"],
            "campaign_id": cid,
            "code": otp_code,
            "used": False,
            "expires_at": {"$gt": now},
        },
        {"$set": {"used": True, "verified_at": now}},
    )
    if not record:
        # Wrong code — increment attempt counter
        await db.otp_records.update_one(
            {"_id": latest["_id"]},
            {"$inc": {"attempts": 1}},
        )
        remaining = 5 - latest.get("attempts", 0) - 1
        return {"verified": False, "message": f"Invalid OTP. {remaining} attempts remaining."}

    return {"verified": True, "message": "Verified"}


@router.post("/complete")
async def complete(
    payload: dict,
    request: Request,
    background_tasks: BackgroundTasks,
    session_token_header: str | None = Header(None, alias="X-Session-Token"),
    db: AsyncIOMotorDatabase = Depends(get_db),
):
    cid = parse_object_id(payload.get("campaign_id", ""), "campaign_id")
    campaign = await get_active_campaign_or_404(db, cid)
    phone = validate_phone(payload.get("phone", ""))
    spin_token = str(payload.get("spin_token", "")).strip()
    if not spin_token:
        raise HTTPException(status_code=400, detail="spin_token_required")
    ip = request.client.host if request.client else ""
    device_fp = payload.get("device_fingerprint", "")
    staff_code = str(payload.get("staff_code", "")).strip().upper()
    if not staff_code:
        raise HTTPException(status_code=422, detail="staff_code is required")
    staff = await db.staff_users.find_one({"invite_code": staff_code})
    if not staff:
        raise HTTPException(status_code=404, detail="Promoter not found")
    if staff.get("campaign_id") != cid:
        raise HTTPException(status_code=400, detail="Campaign does not match promoter")
    session = None
    if await get_setting(db, "live_qr_enabled"):
        if not str(payload.get("device_fingerprint", "")).strip():
            raise HTTPException(status_code=403, detail={"code": "device_fingerprint_required"})
        session = await _require_active_session(db, session_token_header, staff["_id"])
        if session.get("device_fingerprint", "") != payload.get("device_fingerprint", ""):
            raise HTTPException(status_code=403, detail={"code": "session_device_mismatch"})

    now = datetime.now(timezone.utc)
    outcome = await db.spin_outcomes.find_one_and_update(
        {
            "spin_token": spin_token,
            "status": "pending",
            "staff_id": staff["_id"],
            "campaign_id": cid,
            "expires_at": {"$gt": now},
        },
        {"$set": {"status": "consumed", "consumed_at": now}},
        return_document=ReturnDocument.AFTER,
    )
    if outcome is None:
        existing = await db.spin_outcomes.find_one({"spin_token": spin_token})
        if existing is None:
            raise HTTPException(status_code=400, detail="spin_token_invalid")
        if existing.get("status") != "pending":
            raise HTTPException(status_code=400, detail="spin_token_invalid_or_consumed")
        exp = existing.get("expires_at")
        if exp is not None:
            if exp.tzinfo is None:
                exp = exp.replace(tzinfo=timezone.utc)
            if exp <= now:
                raise HTTPException(status_code=400, detail="spin_token_expired")
        if existing.get("staff_id") != staff["_id"] or existing.get("campaign_id") != cid:
            raise HTTPException(status_code=400, detail="spin_token_mismatch")
        raise HTTPException(status_code=400, detail="spin_token_invalid_or_consumed")
    if outcome["no_prize"]:
        return {
            "success": True,
            "claim_id": None,
            "prize_type": "no_prize",
            "reward_code": None,
            "redirect_url": None,
            "message": "No prize this time.",
            "result_token": "",
        }
    wid = outcome["wheel_item_id"]

    # OTP verification check — always required (real SMS or demo mode)
    five_min_ago = datetime.now(timezone.utc) - timedelta(minutes=5)
    verified_otp = await db.otp_records.find_one({
        "phone": phone,
        "campaign_id": cid,
        "used": True,
        "verified_at": {"$gte": five_min_ago},
    })
    if not verified_otp:
        await log_risk(db, str(cid), phone, ip, device_fp,
                       "sms_not_verified", "Attempted claim without SMS verification")
        return {"success": False, "message": "Phone number not verified. Please complete SMS verification first."}

    # Risk control checks
    hits = await check_risk(db, phone, ip, device_fp, str(cid))
    if hits:
        for h in hits:
            await log_risk(db, str(cid), phone, ip, device_fp, h["rule"], h["reason"])
        rule_messages = {
            "phone_duplicate": "This phone number has already claimed a prize.",
            "ip_duplicate": "A prize has already been claimed from this network.",
            "device_duplicate": "A prize has already been claimed from this device.",
            "rate_limit": "Too many requests. Please try again later.",
        }
        msg = rule_messages.get(hits[0]["rule"], "Already claimed. Each person can only claim once.")
        return {"success": False, "message": msg}

    item = await db.wheel_items.find_one({"_id": wid, "campaign_id": cid, "enabled": True})
    if not item:
        raise HTTPException(status_code=404, detail="Wheel item not found")
    max_per_staff = int(item.get("max_per_staff", 0) or 0)
    if max_per_staff > 0:
        claimed_count = await db.claims.count_documents({
            "staff_id": staff["_id"],
            "wheel_item_id": wid,
            "campaign_id": cid,
            "status": "success",
        })
        if claimed_count >= max_per_staff:
            return {"success": False, "message": "Prize quota reached for this promoter."}

    reward_code = None
    reward_code_id = None
    if item.get("type") == "website":
        reward_code, reward_code_id = await create_generated_reward_code(
            db,
            campaign_id=cid,
            wheel_item_id=wid,
            staff_id=staff["_id"],
            phone=phone,
        )

    redirect_url = item.get("redirect_url") or (campaign.get("prize_url", "") if campaign else "")

    claim = {
        "campaign_id": cid, "staff_id": staff["_id"], "phone": phone,
        "ip": ip, "device_fingerprint": device_fp, "wheel_item_id": wid,
        "prize_type": item["type"], "verified": True,
        "reward_code_id": reward_code_id, "reward_code": reward_code,
        "settlement_status": "pending_redeem" if item["type"] == "website" else "unpaid",
        "commission_amount": 0.0,
        "settled_at": None,
        "redirected": False, "status": "success", "risk_hit": [],
        "created_at": datetime.now(timezone.utc),
    }

    # CRIT-1 fix: catch DuplicateKeyError from unique index
    try:
        result = await db.claims.insert_one(claim)
    except DuplicateKeyError:
        if reward_code_id:
            try:
                await db.reward_codes.delete_one({"_id": reward_code_id})
            except Exception:
                pass
        return {"success": False, "message": "This phone number has already claimed a prize."}

    if session:
        await db.promo_sessions.update_one(
            {"_id": session["_id"]},
            {"$set": {"status": "consumed", "consumed_at": datetime.now(timezone.utc)}},
        )

    await db.staff_users.update_one(
        {"_id": staff["_id"]},
        {"$inc": {"stats.total_valid": 1}},
    )
    background_tasks.add_task(process_post_claim, db, staff, result.inserted_id, cid)
    return {
        "success": True, "claim_id": str(result.inserted_id),
        "prize_type": item["type"], "reward_code": reward_code,
        "redirect_url": redirect_url if item["type"] == "website" else None,
        "message": "Prize claimed successfully!",
        "result_token": sign_result_token(str(result.inserted_id)),
    }


@router.post("/pin/verify")
async def pin_verify(payload: dict, request: Request, db: AsyncIOMotorDatabase = Depends(get_db)):
    staff_code = str(payload.get("staff_code", "")).strip().upper()
    pin = str(payload.get("pin", "")).strip()
    fp = str(payload.get("device_fingerprint", "")).strip()
    if not fp:
        return {"success": False, "error": "device_fingerprint_required", "attempts_remaining": 0}
    signature = str(payload.get("token_signature", "")).strip()
    ip = request.client.host if request.client else ""

    if not staff_code or not pin or not signature:
        return {"success": False, "error": "invalid_signature", "attempts_remaining": 0}

    now = datetime.now(timezone.utc)
    one_min_ago = now - timedelta(minutes=1)
    recent = await db.risk_logs.count_documents({
        "ip": ip, "type": "pin_verify_attempt", "created_at": {"$gte": one_min_ago}
    })
    if recent >= 20:
        return {"success": False, "error": "rate_limited", "attempts_remaining": 0}
    await db.risk_logs.insert_one({
        "ip": ip, "type": "pin_verify_attempt", "created_at": now,
        "phone": "", "campaign_id": None, "device_fingerprint": fp, "reason": "",
    })

    staff = await db.staff_users.find_one({"invite_code": staff_code})
    if not staff:
        return {"success": False, "error": "not_found", "attempts_remaining": 0}

    token = await db.promo_live_tokens.find_one({
        "token_signature": signature, "staff_id": staff["_id"], "status": "active",
    })
    if not token:
        return {"success": False, "error": "not_found", "attempts_remaining": 0}

    token_exp = token["expires_at"]
    if token_exp.tzinfo is None:
        token_exp = token_exp.replace(tzinfo=timezone.utc)
    if token_exp <= now:
        await db.promo_live_tokens.update_one({"_id": token["_id"]}, {"$set": {"status": "expired"}})
        return {"success": False, "error": "expired", "attempts_remaining": 0}

    max_fails = int(await get_setting(db, "live_pin_max_fails") or 5)
    if token.get("failures", 0) >= max_fails:
        await db.promo_live_tokens.update_one({"_id": token["_id"]}, {"$set": {"status": "locked"}})
        return {"success": False, "error": "locked", "attempts_remaining": 0}

    if token["pin"] != pin:
        new_fails = token.get("failures", 0) + 1
        new_status = "locked" if new_fails >= max_fails else "active"
        await db.promo_live_tokens.update_one(
            {"_id": token["_id"]},
            {"$set": {"failures": new_fails, "status": new_status}},
        )
        return {
            "success": False,
            "error": "locked" if new_status == "locked" else "invalid_pin",
            "attempts_remaining": max(0, max_fails - new_fails),
        }

    await db.promo_live_tokens.update_one(
        {"_id": token["_id"]},
        {"$set": {"status": "consumed", "consumed_at": now, "consumed_device_fingerprint": fp}},
    )

    session_expires_min = int(await get_setting(db, "promo_session_expires_min") or 30)
    session_token = generate_session_token()
    session_expires_at = now + timedelta(minutes=session_expires_min)

    await db.promo_sessions.insert_one({
        "staff_id": staff["_id"],
        "campaign_id": staff.get("campaign_id"),
        "live_token_id": token["_id"],
        "session_token": session_token,
        "device_fingerprint": fp,
        "ip": ip,
        "user_agent": request.headers.get("user-agent", ""),
        "status": "active",
        "created_at": now,
        "expires_at": session_expires_at,
        "consumed_at": None,
    })

    campaign = await db.campaigns.find_one({"_id": staff.get("campaign_id")}) if staff.get("campaign_id") else None
    return {
        "success": True,
        "session_token": session_token,
        "expires_at": session_expires_at.isoformat(),
        "campaign": {
            "id": str(staff["campaign_id"]) if staff.get("campaign_id") else "",
            "name": campaign.get("name", "") if campaign else "",
            "description": campaign.get("description", "") if campaign else "",
        },
    }


@router.get("/result/{claim_id}")
async def get_result(
    claim_id: str,
    result_token: str = Query(...),
    db: AsyncIOMotorDatabase = Depends(get_db),
):
    if not verify_result_token(claim_id, result_token):
        raise HTTPException(status_code=403, detail="unauthorized_result")
    claim = await db.claims.find_one({"_id": parse_object_id(claim_id, "claim_id")})
    if not claim:
        raise HTTPException(status_code=404, detail="Claim not found")
    item = await db.wheel_items.find_one({"_id": claim.get("wheel_item_id")})
    campaign = await db.campaigns.find_one({"_id": claim.get("campaign_id")})
    redirect_url = ""
    if item:
        redirect_url = item.get("redirect_url") or (campaign.get("prize_url", "") if campaign else "")
    return {
        "id": str(claim["_id"]), "prize_type": claim["prize_type"],
        "reward_code": claim.get("reward_code"), "status": claim["status"],
        "created_at": claim["created_at"].isoformat() if claim.get("created_at") else "",
        "redirect_url": redirect_url,
    }
