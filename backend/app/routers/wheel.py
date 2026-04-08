import uuid
from datetime import datetime, timezone
from pathlib import Path

from bson import ObjectId
from fastapi import APIRouter, Depends, File, HTTPException, Query, UploadFile, status
from motor.motor_asyncio import AsyncIOMotorDatabase
from pymongo import ReturnDocument

from app.database import get_db
from app.dependencies import get_current_admin
from app.schemas.campaign import WheelItemCreateRequest, WheelItemDetail, WheelItemUpdateRequest
from app.schemas.common import MessageResponse
from app.utils.helpers import to_str_id

router = APIRouter(dependencies=[Depends(get_current_admin)])

UPLOAD_DIR = Path(__file__).parent.parent.parent / "uploads"


def parse_object_id(value: str, field_name: str) -> ObjectId:
    if not ObjectId.is_valid(value):
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=f"Invalid {field_name}")
    return ObjectId(value)


def serialize_wheel_item(doc: dict) -> dict:
    data = to_str_id(doc)
    if isinstance(data.get("campaign_id"), ObjectId):
        data["campaign_id"] = str(data["campaign_id"])
    return data


async def get_campaign_id_or_404(db: AsyncIOMotorDatabase, campaign_id: str) -> ObjectId:
    campaign_obj_id = parse_object_id(campaign_id, "campaign_id")
    if not await db.campaigns.find_one({"_id": campaign_obj_id}):
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Campaign not found")
    return campaign_obj_id


async def get_wheel_item_or_404(db: AsyncIOMotorDatabase, item_id: str) -> dict:
    item = await db.wheel_items.find_one({"_id": parse_object_id(item_id, "item_id")})
    if not item:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Wheel item not found")
    return item


@router.get("/", response_model=list[WheelItemDetail])
async def list_wheel_items(
    campaign_id: str = Query(...),
    db: AsyncIOMotorDatabase = Depends(get_db),
) -> list[WheelItemDetail]:
    campaign_obj_id = parse_object_id(campaign_id, "campaign_id")
    items = await db.wheel_items.find({"campaign_id": campaign_obj_id}).sort("sort_order", 1).to_list(length=None)
    return [WheelItemDetail.model_validate(serialize_wheel_item(item)) for item in items]


@router.post("/", response_model=WheelItemDetail, status_code=status.HTTP_201_CREATED)
async def create_wheel_item(
    payload: WheelItemCreateRequest,
    db: AsyncIOMotorDatabase = Depends(get_db),
) -> WheelItemDetail:
    now = datetime.now(timezone.utc)
    document = payload.model_dump()
    document["campaign_id"] = await get_campaign_id_or_404(db, payload.campaign_id)
    document.update({"created_at": now, "updated_at": now})
    result = await db.wheel_items.insert_one(document)
    document["_id"] = result.inserted_id
    return WheelItemDetail.model_validate(serialize_wheel_item(document))


@router.put("/{item_id}", response_model=WheelItemDetail)
async def update_wheel_item(
    item_id: str,
    payload: WheelItemUpdateRequest,
    db: AsyncIOMotorDatabase = Depends(get_db),
) -> WheelItemDetail:
    item = await get_wheel_item_or_404(db, item_id)
    updates = payload.model_dump(exclude_unset=True)
    if "campaign_id" in updates:
        updates["campaign_id"] = await get_campaign_id_or_404(db, payload.campaign_id)
    if not updates:
        return WheelItemDetail.model_validate(serialize_wheel_item(item))
    updates["updated_at"] = datetime.now(timezone.utc)
    updated = await db.wheel_items.find_one_and_update(
        {"_id": item["_id"]},
        {"$set": updates},
        return_document=ReturnDocument.AFTER,
    )
    return WheelItemDetail.model_validate(serialize_wheel_item(updated))


@router.delete("/{item_id}", response_model=MessageResponse)
async def delete_wheel_item(
    item_id: str,
    db: AsyncIOMotorDatabase = Depends(get_db),
) -> MessageResponse:
    item = await get_wheel_item_or_404(db, item_id)
    await db.wheel_items.delete_one({"_id": item["_id"]})
    return MessageResponse(message="Wheel item deleted successfully")


@router.put("/{item_id}/toggle", response_model=MessageResponse)
async def toggle_wheel_item(
    item_id: str,
    db: AsyncIOMotorDatabase = Depends(get_db),
) -> MessageResponse:
    item = await get_wheel_item_or_404(db, item_id)
    await db.wheel_items.update_one(
        {"_id": item["_id"]},
        {"$set": {"enabled": not item.get("enabled", True), "updated_at": datetime.now(timezone.utc)}},
    )
    return MessageResponse(message="Wheel item toggled successfully")


@router.post("/{item_id}/upload-image")
async def upload_wheel_image(
    item_id: str,
    file: UploadFile = File(...),
    db: AsyncIOMotorDatabase = Depends(get_db),
):
    item = await get_wheel_item_or_404(db, item_id)
    ext = file.filename.rsplit(".", 1)[-1] if file.filename else "png"
    filename = f"wheel_{uuid.uuid4().hex[:8]}.{ext}"
    filepath = UPLOAD_DIR / filename
    UPLOAD_DIR.mkdir(exist_ok=True)
    content = await file.read()
    filepath.write_bytes(content)
    image_url = f"/uploads/{filename}"
    await db.wheel_items.update_one(
        {"_id": item["_id"]},
        {"$set": {"image_url": image_url, "updated_at": datetime.now(timezone.utc)}},
    )
    return {"image_url": image_url}
