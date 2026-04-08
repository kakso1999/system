import math
from fastapi import APIRouter, Depends, Query
from motor.motor_asyncio import AsyncIOMotorDatabase
from app.database import get_db
from app.dependencies import get_current_admin
from app.schemas.common import MessageResponse, PageResponse
from app.utils.helpers import to_str_ids

router = APIRouter(dependencies=[Depends(get_current_admin)])


@router.get("/")
async def get_risk_settings(db: AsyncIOMotorDatabase = Depends(get_db)):
    settings = await db.system_settings.find({"group": "risk_control"}).to_list(length=50)
    return {"settings": [{"key": s["key"], "value": s["value"], "description": s.get("description", "")} for s in settings]}


@router.put("/")
async def update_risk_setting(payload: dict, db: AsyncIOMotorDatabase = Depends(get_db)):
    await db.system_settings.update_one(
        {"key": payload["key"]},
        {"$set": {"value": payload["value"]}},
        upsert=True,
    )
    return MessageResponse(message="Setting updated")


@router.get("/logs", response_model=PageResponse)
async def get_risk_logs(
    page: int = Query(1, ge=1), page_size: int = Query(20, ge=1, le=100),
    db: AsyncIOMotorDatabase = Depends(get_db),
):
    cursor = db.risk_logs.find().sort("created_at", -1).skip((page - 1) * page_size).limit(page_size)
    items = await cursor.to_list(length=page_size)
    total = await db.risk_logs.count_documents({})
    return PageResponse(items=to_str_ids(items), total=total, page=page, page_size=page_size,
                        pages=math.ceil(total / page_size) if total else 0)
