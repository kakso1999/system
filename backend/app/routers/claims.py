import math
from bson import ObjectId
from fastapi import APIRouter, Depends, HTTPException, Query
from motor.motor_asyncio import AsyncIOMotorDatabase
from app.database import get_db
from app.dependencies import get_current_admin
from app.schemas.common import PageResponse
from app.utils.helpers import to_str_id, to_str_ids

router = APIRouter(dependencies=[Depends(get_current_admin)])


def serialize_claim(doc: dict) -> dict:
    data = to_str_id(doc)
    for k in ("campaign_id", "staff_id", "wheel_item_id", "reward_code_id"):
        if isinstance(data.get(k), ObjectId):
            data[k] = str(data[k])
    return data


@router.get("/", response_model=PageResponse)
async def list_claims(
    page: int = Query(1, ge=1), page_size: int = Query(20, ge=1, le=100),
    campaign_id: str | None = None, staff_id: str | None = None,
    phone: str | None = None, status: str | None = None,
    db: AsyncIOMotorDatabase = Depends(get_db),
):
    query: dict = {}
    if campaign_id:
        query["campaign_id"] = ObjectId(campaign_id)
    if staff_id:
        query["staff_id"] = ObjectId(staff_id)
    if phone:
        query["phone"] = {"$regex": phone, "$options": "i"}
    if status:
        query["status"] = status
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
    claim = await db.claims.find_one({"_id": ObjectId(claim_id)})
    if not claim:
        raise HTTPException(status_code=404, detail="Claim not found")
    return serialize_claim(claim)
