import math
import random
from datetime import datetime, timezone

from bson import ObjectId
from fastapi import APIRouter, Depends, HTTPException, Request
from motor.motor_asyncio import AsyncIOMotorDatabase

from app.database import get_db

router = APIRouter()


async def get_setting(db, key: str):
    doc = await db.system_settings.find_one({"key": key})
    return doc["value"] if doc else None


async def check_risk(db, phone, ip, device_fp, campaign_id) -> list[str]:
    hits = []
    cid = ObjectId(campaign_id)
    if await get_setting(db, "risk_phone_unique"):
        if await db.claims.find_one({"phone": phone, "campaign_id": cid, "status": "success"}):
            hits.append("phone_duplicate")
    if await get_setting(db, "risk_ip_unique") and ip:
        if await db.claims.find_one({"ip": ip, "campaign_id": cid, "status": "success"}):
            hits.append("ip_duplicate")
    if await get_setting(db, "risk_device_unique") and device_fp:
        if await db.claims.find_one({"device_fingerprint": device_fp, "campaign_id": cid, "status": "success"}):
            hits.append("device_duplicate")
    return hits


@router.get("/welcome/{staff_code}")
async def welcome(staff_code: str, db: AsyncIOMotorDatabase = Depends(get_db)):
    staff = await db.staff_users.find_one({"invite_code": staff_code.upper()})
    if not staff:
        raise HTTPException(status_code=404, detail="Promoter not found")
    campaign = await db.campaigns.find_one({"_id": staff.get("campaign_id"), "status": "active"})
    if not campaign:
        raise HTTPException(status_code=404, detail="No active campaign")
    items = await db.wheel_items.find(
        {"campaign_id": campaign["_id"], "enabled": True}
    ).sort("sort_order", 1).to_list(length=50)
    return {
        "staff_name": staff["name"],
        "campaign": {
            "id": str(campaign["_id"]), "name": campaign["name"],
            "description": campaign.get("description", ""),
            "rules_text": campaign.get("rules_text", ""),
            "prize_url": campaign.get("prize_url", ""),
        },
        "wheel_items": [
            {"id": str(i["_id"]), "display_name": i["display_name"],
             "type": i["type"], "sort_order": i["sort_order"]}
            for i in items
        ],
    }


@router.post("/spin")
async def spin(payload: dict, db: AsyncIOMotorDatabase = Depends(get_db)):
    cid = ObjectId(payload["campaign_id"])
    items = await db.wheel_items.find(
        {"campaign_id": cid, "enabled": True}
    ).sort("sort_order", 1).to_list(length=50)
    if not items:
        raise HTTPException(status_code=400, detail="No wheel items")
    weights = [i.get("weight", 10) for i in items]
    chosen = random.choices(range(len(items)), weights=weights, k=1)[0]
    item = items[chosen]
    return {
        "result_index": chosen,
        "wheel_item": {
            "id": str(item["_id"]), "display_name": item["display_name"],
            "type": item["type"], "display_text": item.get("display_text", ""),
        },
    }


@router.post("/verify-phone")
async def verify_phone(payload: dict, db: AsyncIOMotorDatabase = Depends(get_db)):
    sms_on = await get_setting(db, "sms_verification")
    if sms_on:
        code = f"{random.randint(100000, 999999)}"
        await db.otp_records.insert_one({
            "phone": payload["phone"], "code": code, "used": False,
            "expires_at": datetime(2099, 1, 1, tzinfo=timezone.utc),
            "created_at": datetime.now(timezone.utc),
        })
        return {"verified": False, "message": "OTP sent"}
    return {"verified": True, "message": "Phone recorded"}


@router.post("/verify-otp")
async def verify_otp(payload: dict, db: AsyncIOMotorDatabase = Depends(get_db)):
    record = await db.otp_records.find_one(
        {"phone": payload["phone"], "used": False},
        sort=[("created_at", -1)],
    )
    if not record or record["code"] != payload["code"]:
        return {"verified": False, "message": "Invalid OTP"}
    await db.otp_records.update_one({"_id": record["_id"]}, {"$set": {"used": True}})
    return {"verified": True, "message": "Verified"}


@router.post("/complete")
async def complete(payload: dict, request: Request, db: AsyncIOMotorDatabase = Depends(get_db)):
    cid = ObjectId(payload["campaign_id"])
    wid = ObjectId(payload["wheel_item_id"])
    phone = payload["phone"]
    ip = payload.get("ip") or (request.client.host if request.client else "")
    device_fp = payload.get("device_fingerprint", "")
    staff = await db.staff_users.find_one({"invite_code": payload["staff_code"].upper()})
    if not staff:
        raise HTTPException(status_code=404, detail="Promoter not found")

    hits = await check_risk(db, phone, ip, device_fp, payload["campaign_id"])
    if hits:
        for h in hits:
            await db.risk_logs.insert_one({
                "campaign_id": cid, "phone": phone, "ip": ip,
                "device_fingerprint": device_fp, "rule_triggered": h,
                "action": "blocked", "created_at": datetime.now(timezone.utc),
            })
        return {"success": False, "message": "Already claimed. Each person can only claim once."}

    item = await db.wheel_items.find_one({"_id": wid})
    if not item:
        raise HTTPException(status_code=404, detail="Wheel item not found")

    reward_code = None
    reward_code_id = None
    if item.get("type") == "website" and item.get("needs_reward_code"):
        rc = await db.reward_codes.find_one_and_update(
            {"wheel_item_id": wid, "status": "unused"},
            {"$set": {"status": "assigned", "assigned_to_phone": phone,
                      "source_staff_id": staff["_id"],
                      "assigned_at": datetime.now(timezone.utc)}},
        )
        if not rc:
            return {"success": False, "message": "Reward codes exhausted"}
        reward_code = rc["code"]
        reward_code_id = rc["_id"]

    campaign = await db.campaigns.find_one({"_id": cid})
    redirect_url = item.get("redirect_url") or (campaign.get("prize_url", "") if campaign else "")

    claim = {
        "campaign_id": cid, "staff_id": staff["_id"], "phone": phone,
        "ip": ip, "device_fingerprint": device_fp, "wheel_item_id": wid,
        "prize_type": item["type"], "verified": True,
        "reward_code_id": reward_code_id, "reward_code": reward_code,
        "redirected": False, "status": "success", "risk_hit": [],
        "created_at": datetime.now(timezone.utc),
    }
    result = await db.claims.insert_one(claim)
    await db.staff_users.update_one(
        {"_id": staff["_id"]},
        {"$inc": {"stats.total_scans": 1, "stats.total_valid": 1}},
    )
    return {
        "success": True, "claim_id": str(result.inserted_id),
        "prize_type": item["type"], "reward_code": reward_code,
        "redirect_url": redirect_url if item["type"] == "website" else None,
        "message": "Prize claimed successfully!",
    }


@router.get("/result/{claim_id}")
async def get_result(claim_id: str, db: AsyncIOMotorDatabase = Depends(get_db)):
    claim = await db.claims.find_one({"_id": ObjectId(claim_id)})
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
