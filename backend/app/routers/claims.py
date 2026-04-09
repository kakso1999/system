import math
from bson import ObjectId
from fastapi import APIRouter, Depends, HTTPException, Query
from motor.motor_asyncio import AsyncIOMotorDatabase
from app.database import get_db
from app.dependencies import get_current_admin
from app.schemas.common import PageResponse
from app.utils.helpers import to_str_id

router = APIRouter(dependencies=[Depends(get_current_admin)])


def serialize_claim(doc: dict) -> dict:
    data = to_str_id(doc)
    for k in ("campaign_id", "staff_id", "wheel_item_id", "reward_code_id"):
        if isinstance(data.get(k), ObjectId):
            data[k] = str(data[k])
    return data


def parse_object_id(value: str, field_name: str) -> ObjectId:
    if not ObjectId.is_valid(value):
        raise HTTPException(status_code=400, detail=f"Invalid {field_name}")
    return ObjectId(value)


@router.get("/", response_model=PageResponse)
async def list_claims(
    page: int = Query(1, ge=1), page_size: int = Query(20, ge=1, le=100),
    campaign_id: str | None = None, staff_id: str | None = None,
    phone: str | None = None, status: str | None = None,
    ip: str | None = None, device_fingerprint: str | None = None,
    prize_type: str | None = None,
    db: AsyncIOMotorDatabase = Depends(get_db),
):
    query: dict = {}
    if campaign_id:
        query["campaign_id"] = parse_object_id(campaign_id, "campaign_id")
    if staff_id:
        query["staff_id"] = parse_object_id(staff_id, "staff_id")
    if phone:
        query["phone"] = {"$regex": phone, "$options": "i"}
    if status:
        query["status"] = status
    if ip:
        query["ip"] = {"$regex": ip, "$options": "i"}
    if device_fingerprint:
        query["device_fingerprint"] = {"$regex": device_fingerprint, "$options": "i"}
    if prize_type:
        query["prize_type"] = prize_type
    cursor = db.claims.find(query).sort("created_at", -1).skip((page - 1) * page_size).limit(page_size)
    items = await cursor.to_list(length=page_size)
    total = await db.claims.count_documents(query)
    return PageResponse(
        items=[serialize_claim(i) for i in items], total=total,
        page=page, page_size=page_size,
        pages=math.ceil(total / page_size) if total else 0,
    )


@router.get("/{claim_id}")
async def get_claim(claim_id: str, db: AsyncIOMotorDatabase = Depends(get_db)):
    claim = await db.claims.find_one({"_id": parse_object_id(claim_id, "claim_id")})
    if not claim:
        raise HTTPException(status_code=404, detail="Claim not found")
    return serialize_claim(claim)
