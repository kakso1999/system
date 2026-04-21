from fastapi import APIRouter, Depends
from motor.motor_asyncio import AsyncIOMotorDatabase

from app.database import get_db

router = APIRouter()

_WHITELIST = {
    "project_name": "GroundRewards",
    "activity_title": "Lucky Wheel",
    "activity_desc": "",
    "default_redirect_url": "",
    "customer_service_enabled": False,
    "customer_service_whatsapp": "",
    "customer_service_telegram": "",
}


@router.get("/settings")
async def get_public_settings(db: AsyncIOMotorDatabase = Depends(get_db)):
    docs = db.system_settings.find({"key": {"$in": list(_WHITELIST.keys())}})
    found: dict = {}
    async for doc in docs:
        found[doc["key"]] = doc.get("value")
    return {key: found.get(key, default) for key, default in _WHITELIST.items()}
