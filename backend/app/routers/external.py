from datetime import datetime, timezone

from fastapi import APIRouter, Depends
from motor.motor_asyncio import AsyncIOMotorDatabase
from pymongo import ReturnDocument

from app.database import get_db
from app.dependencies import get_api_key

router = APIRouter()


def normalize_code(code: str) -> str:
    return code.upper().strip()


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
        "phone": rc.get("phone", ""),
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
    await db.claims.update_one(
        {"reward_code_id": rc["_id"], "settlement_status": "pending_redeem"},
        {"$set": {"settlement_status": "unpaid"}},
    )
    return {"success": True, "message": "Reward code redeemed successfully"}
