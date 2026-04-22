from datetime import datetime, timedelta, timezone

from bson import ObjectId
from fastapi import APIRouter, Depends
from motor.motor_asyncio import AsyncIOMotorDatabase
from pydantic import BaseModel, ConfigDict
from pymongo import ReturnDocument

from app.database import get_db
from app.dependencies import get_api_key

router = APIRouter()


def normalize_code(code: str) -> str:
    return code.upper().strip()


def mask_phone(phone: str) -> str:
    if not phone:
        return ""
    if len(phone) <= 4:
        return "*" * len(phone)
    return phone[:3] + "*" * max(0, len(phone) - 7) + phone[-4:]


@router.get("/reward-code/{code}/check")
async def check_reward_code(
    code: str,
    db: AsyncIOMotorDatabase = Depends(get_db),
    _: str = Depends(get_api_key),
):
    """Check if a reward code exists and its status."""
    rc = await db.reward_codes.find_one({"code": normalize_code(code)})
    if not rc:
        return {"exists": False}
    return {
        "exists": True,
        "status": rc.get("status", "unknown"),
        "campaign_id": str(rc["campaign_id"]) if rc.get("campaign_id") else None,
        "phone": mask_phone(rc.get("phone", "")),
        "created_at": rc["created_at"].isoformat() if rc.get("created_at") else None,
    }


@router.post("/reward-code/{code}/redeem")
async def redeem_reward_code(
    code: str,
    db: AsyncIOMotorDatabase = Depends(get_db),
    _: str = Depends(get_api_key),
):
    """Mark a reward code as redeemed. Only works if status is 'assigned'."""
    normalized = normalize_code(code)
    now = datetime.now(timezone.utc)
    rc = await db.reward_codes.find_one_and_update(
        {"code": normalized, "status": "assigned"},
        {"$set": {"status": "redeemed", "redeemed_at": now, "updated_at": now}},
        return_document=ReturnDocument.AFTER,
    )
    if not rc:
        existing = await db.reward_codes.find_one({"code": normalized})
        if not existing:
            return {"success": False, "message": "Reward code not found"}
        if existing.get("status") == "redeemed":
            return {"success": False, "message": "Reward code already redeemed"}
        return {
            "success": False,
            "message": f"Reward code status is '{existing.get('status')}', cannot redeem",
        }
    # D5: per-staff daily redeem cap — auto-freeze on breach.
    staff_id = rc.get("staff_id")
    if isinstance(staff_id, ObjectId):
        staff_doc = await db.staff_users.find_one(
            {"_id": staff_id},
            {"daily_redeem_limit": 1, "risk_frozen": 1},
        )
        if staff_doc:
            cap = int(staff_doc.get("daily_redeem_limit") or 0)
            if cap > 0:
                window_start = now - timedelta(hours=24)
                redeemed_count = await db.reward_codes.count_documents({
                    "staff_id": staff_id,
                    "status": "redeemed",
                    "redeemed_at": {"$gte": window_start},
                    "_id": {"$ne": rc["_id"]},
                })
                if redeemed_count + 1 > cap:
                    await db.staff_users.update_one(
                        {"_id": staff_id},
                        {"$set": {"risk_frozen": True, "updated_at": now, "risk_frozen_reason": "daily_redeem_cap"}},
                    )
                    await db.promo_live_tokens.update_many(
                        {"staff_id": staff_id, "status": "active"},
                        {"$set": {"status": "expired", "expired_at": now, "expired_reason": "daily_redeem_cap"}},
                    )
                    # Roll back the redemption to avoid exceeding cap.
                    await db.reward_codes.update_one(
                        {"_id": rc["_id"]},
                        {"$set": {"status": "assigned", "updated_at": now}, "$unset": {"redeemed_at": ""}},
                    )
                    return {"success": False, "message": "Daily redeem cap reached; promoter auto-frozen."}
    await db.claims.update_one(
        {"reward_code_id": rc["_id"], "settlement_status": "pending_redeem"},
        {"$set": {"settlement_status": "unpaid"}},
    )
    claim_doc = await db.claims.find_one({"reward_code_id": rc["_id"]}, {"_id": 1})
    if claim_doc:
        pending_logs = await db.commission_logs.find(
            {"claim_id": claim_doc["_id"], "status": "pending_redeem"},
            {"_id": 1, "beneficiary_staff_id": 1, "amount_cents": 1, "amount": 1},
        ).to_list(length=None)
        if pending_logs:
            await db.commission_logs.update_many(
                {"claim_id": claim_doc["_id"], "status": "pending_redeem"},
                {"$set": {"status": "approved", "approved_at": now}},
            )
            for log in pending_logs:
                cents = int(log.get("amount_cents") or 0)
                if cents <= 0:
                    continue
                await db.staff_users.update_one(
                    {"_id": log["beneficiary_staff_id"]},
                    {"$inc": {
                        "stats.total_commission": cents / 100.0,
                        "stats.total_commission_cents": cents,
                    }},
                )
    return {"success": True, "message": "Reward code redeemed successfully"}


# ----------------------------------------------------------------------------
# D1/D2 - docx-aligned alias routes under /api/redeem/*. Thin delegates to the
# existing X-API-Key-protected handlers above. Registered under a separate
# router (see main.py) with the same get_api_key dependency.
# ----------------------------------------------------------------------------


class RedeemVerifyRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")

    code: str


class RedeemClaimRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")

    code: str


alias_router = APIRouter()


@alias_router.post("/verify")
async def redeem_verify(
    payload: RedeemVerifyRequest,
    db: AsyncIOMotorDatabase = Depends(get_db),
    _: str = Depends(get_api_key),
):
    """D1 alias: verify reward code (body { code }). Mirrors /api/external/reward-code/{code}/check."""
    return await check_reward_code(code=payload.code, db=db, _=_)


@alias_router.post("/claim")
async def redeem_claim(
    payload: RedeemClaimRequest,
    db: AsyncIOMotorDatabase = Depends(get_db),
    _: str = Depends(get_api_key),
):
    """D2 alias: claim/redeem reward code (body { code }). Mirrors /api/external/reward-code/{code}/redeem."""
    return await redeem_reward_code(code=payload.code, db=db, _=_)
