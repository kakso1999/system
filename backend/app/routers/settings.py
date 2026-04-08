from fastapi import APIRouter, Depends
from motor.motor_asyncio import AsyncIOMotorDatabase
from app.database import get_db
from app.dependencies import get_current_admin
from app.schemas.common import MessageResponse

router = APIRouter(dependencies=[Depends(get_current_admin)])


@router.get("/")
async def get_settings(group: str | None = None, db: AsyncIOMotorDatabase = Depends(get_db)):
    query = {"group": group} if group else {}
    settings = await db.system_settings.find(query).to_list(length=100)
    return [{"key": s["key"], "value": s["value"], "group": s.get("group", ""),
             "description": s.get("description", "")} for s in settings]


@router.put("/{key}")
async def update_setting(key: str, payload: dict, db: AsyncIOMotorDatabase = Depends(get_db)):
    await db.system_settings.update_one({"key": key}, {"$set": {"value": payload["value"]}}, upsert=True)
    return MessageResponse(message="Setting updated")
