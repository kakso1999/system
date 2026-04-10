from datetime import datetime, timezone

from fastapi import APIRouter, Depends
from motor.motor_asyncio import AsyncIOMotorDatabase

from app.database import get_db

router = APIRouter()


def normalize_code(code: str) -> str:
    return code.upper().strip()


@router.get("/reward-code/{code}/check")
async def check_reward_code(code: str, db: AsyncIOMotorDatabase = Depends(get_db)):
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
async def redeem_reward_code(code: str, db: AsyncIOMotorDatabase = Depends(get_db)):
    """Mark a reward code as redeemed. Only works if status is 'assigned'."""
    normalized = normalize_code(code)
    now = datetime.now(timezone.utc)
    rc = await db.reward_codes.find_one_and_update(
        {"code": normalized, "status": "assigned"},
        {"$set": {"status": "redeemed", "redeemed_at": now, "updated_at": now}},
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
    return {"success": True, "message": "Reward code redeemed successfully"}
