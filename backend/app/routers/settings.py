from fastapi import APIRouter, Depends, HTTPException, status
from motor.motor_asyncio import AsyncIOMotorDatabase
from app.database import get_db
from app.dependencies import get_current_admin
from app.schemas.common import MessageResponse
from app.schemas.requests import UpdateSettingRequest
from app.utils.action_log import log_admin_action
from app.utils.setting_validators import validate_setting_value

router = APIRouter(dependencies=[Depends(get_current_admin)])


@router.get("/")
async def get_settings(group: str | None = None, db: AsyncIOMotorDatabase = Depends(get_db)):
    query = {"group": group} if group else {}
    settings = await db.system_settings.find(query).to_list(length=100)
    return [{"key": s["key"], "value": s["value"], "group": s.get("group", ""),
             "description": s.get("description", "")} for s in settings]


@router.put("/{key}")
async def update_setting(
    key: str,
    payload: UpdateSettingRequest,
    current_admin: dict = Depends(get_current_admin),
    db: AsyncIOMotorDatabase = Depends(get_db),
):
    if "value" not in payload.model_fields_set:
        raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail="value is required")
    validated = validate_setting_value(key, payload.value)
    await db.system_settings.update_one({"key": key}, {"$set": {"value": validated}}, upsert=True)
    await log_admin_action(
        db,
        current_admin["_id"],
        "setting.update",
        "setting",
        key,
        {"key": key},
    )
    return MessageResponse(message="Setting updated")
