from datetime import datetime, timezone
from fastapi import APIRouter, Depends
from motor.motor_asyncio import AsyncIOMotorDatabase
from app.database import get_db
from app.dependencies import get_current_admin

router = APIRouter(dependencies=[Depends(get_current_admin)])


@router.get("/")
async def get_dashboard(db: AsyncIOMotorDatabase = Depends(get_db)):
    today_start = datetime.now(timezone.utc).replace(hour=0, minute=0, second=0, microsecond=0)

    today_scans = await db.claims.count_documents({"created_at": {"$gte": today_start}})
    today_valid = await db.claims.count_documents({"status": "success", "created_at": {"$gte": today_start}})
    today_staff = await db.staff_users.count_documents({"created_at": {"$gte": today_start}})
    total_scans = await db.claims.count_documents({})
    total_valid = await db.claims.count_documents({"status": "success"})
    total_staff = await db.staff_users.count_documents({})

    pipeline = [{"$match": {"status": {"$in": ["pending", "approved", "paid"]}}},
                {"$group": {"_id": None, "total": {"$sum": "$amount"}}}]
    agg = await db.commission_logs.aggregate(pipeline).to_list(length=1)
    total_commission = agg[0]["total"] if agg else 0

    return {
        "today_scans": today_scans,
        "today_valid": today_valid,
        "today_staff": today_staff,
        "total_scans": total_scans,
        "total_valid": total_valid,
        "total_staff": total_staff,
        "total_commission": total_commission,
    }
