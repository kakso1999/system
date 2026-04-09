import math
from datetime import datetime, timezone

from bson import ObjectId
from fastapi import APIRouter, Depends, HTTPException, Query, status
from motor.motor_asyncio import AsyncIOMotorDatabase
from pymongo import ReturnDocument

from app.database import get_db
from app.dependencies import get_current_admin
from app.schemas.campaign import (
    CampaignCreateRequest,
    CampaignDetail,
    CampaignStatus,
    CampaignStatusUpdateRequest,
    CampaignUpdateRequest,
)
from app.schemas.common import MessageResponse, PageResponse
from app.utils.helpers import to_str_id, to_str_ids

router = APIRouter(dependencies=[Depends(get_current_admin)])


def parse_object_id(value: str, field_name: str) -> ObjectId:
    if not ObjectId.is_valid(value):
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=f"Invalid {field_name}")
    return ObjectId(value)


async def get_campaign_or_404(db: AsyncIOMotorDatabase, campaign_id: str) -> dict:
    campaign = await db.campaigns.find_one({"_id": parse_object_id(campaign_id, "campaign_id")})
    if not campaign:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Campaign not found")
    return campaign


@router.get("/", response_model=PageResponse)
async def list_campaigns(
    page: int = Query(1, ge=1),
    page_size: int = Query(20, ge=1, le=100),
    status_value: CampaignStatus | None = Query(None, alias="status"),
    db: AsyncIOMotorDatabase = Depends(get_db),
) -> PageResponse:
    query = {"status": status_value} if status_value else {}
    cursor = db.campaigns.find(query).sort("created_at", -1).skip((page - 1) * page_size).limit(page_size)
    items = await cursor.to_list(length=page_size)
    total = await db.campaigns.count_documents(query)
    return PageResponse(
        items=to_str_ids(items),
        total=total,
        page=page,
        page_size=page_size,
        pages=math.ceil(total / page_size) if total else 0,
    )


@router.post("/", response_model=CampaignDetail, status_code=status.HTTP_201_CREATED)
async def create_campaign(
    payload: CampaignCreateRequest,
    db: AsyncIOMotorDatabase = Depends(get_db),
) -> CampaignDetail:
    now = datetime.now(timezone.utc)
    document = payload.model_dump()
    document.update({"status": "draft", "created_at": now, "updated_at": now})
    result = await db.campaigns.insert_one(document)
    document["_id"] = result.inserted_id
    return CampaignDetail.model_validate(to_str_id(document))


@router.get("/{campaign_id}", response_model=CampaignDetail)
async def get_campaign(
    campaign_id: str,
    db: AsyncIOMotorDatabase = Depends(get_db),
) -> CampaignDetail:
    return CampaignDetail.model_validate(to_str_id(await get_campaign_or_404(db, campaign_id)))


@router.put("/{campaign_id}", response_model=CampaignDetail)
async def update_campaign(
    campaign_id: str,
    payload: CampaignUpdateRequest,
    db: AsyncIOMotorDatabase = Depends(get_db),
) -> CampaignDetail:
    campaign = await get_campaign_or_404(db, campaign_id)
    updates = payload.model_dump(exclude_unset=True)
    if not updates:
        return CampaignDetail.model_validate(to_str_id(campaign))
    updates["updated_at"] = datetime.now(timezone.utc)
    updated = await db.campaigns.find_one_and_update(
        {"_id": campaign["_id"]},
        {"$set": updates},
        return_document=ReturnDocument.AFTER,
    )
    return CampaignDetail.model_validate(to_str_id(updated))


@router.put("/{campaign_id}/status", response_model=MessageResponse)
async def update_campaign_status(
    campaign_id: str,
    payload: CampaignStatusUpdateRequest,
    db: AsyncIOMotorDatabase = Depends(get_db),
) -> MessageResponse:
    campaign = await get_campaign_or_404(db, campaign_id)
    await db.campaigns.update_one(
        {"_id": campaign["_id"]},
        {"$set": {"status": payload.status, "updated_at": datetime.now(timezone.utc)}},
    )
    return MessageResponse(message="Campaign status updated successfully")


@router.post("/{campaign_id}/bind-staff", response_model=MessageResponse)
async def bind_staff_to_campaign(
    campaign_id: str,
    payload: dict,
    db: AsyncIOMotorDatabase = Depends(get_db),
) -> MessageResponse:
    campaign = await get_campaign_or_404(db, campaign_id)
    staff_ids = payload.get("staff_ids", [])
    now = datetime.now(timezone.utc)
    oids = [ObjectId(sid) for sid in staff_ids if ObjectId.is_valid(sid)]
    # Step 1: unbind all staff currently in this campaign
    await db.staff_users.update_many(
        {"campaign_id": campaign["_id"]},
        {"$set": {"campaign_id": None, "updated_at": now}},
    )
    # Step 2: bind selected staff
    bound = 0
    if oids:
        result = await db.staff_users.update_many(
            {"_id": {"$in": oids}},
            {"$set": {"campaign_id": campaign["_id"], "updated_at": now}},
        )
        bound = result.modified_count
    return MessageResponse(message=f"Bound {bound} staff to campaign")


@router.get("/{campaign_id}/staff")
async def list_campaign_staff(
    campaign_id: str,
    db: AsyncIOMotorDatabase = Depends(get_db),
):
    cid = parse_object_id(campaign_id, "campaign_id")
    staff = await db.staff_users.find(
        {"campaign_id": cid}, {"password_hash": 0}
    ).to_list(length=500)
    result = []
    for doc in staff:
        item = to_str_id(doc)
        for key in ("parent_id", "campaign_id"):
            if isinstance(item.get(key), ObjectId):
                item[key] = str(item[key])
        result.append(item)
    return result


@router.delete("/{campaign_id}", response_model=MessageResponse)
async def delete_campaign(
    campaign_id: str,
    db: AsyncIOMotorDatabase = Depends(get_db),
) -> MessageResponse:
    campaign = await get_campaign_or_404(db, campaign_id)
    if campaign.get("status") != "draft":
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Only draft campaigns can be deleted")
    await db.campaigns.delete_one({"_id": campaign["_id"]})
    return MessageResponse(message="Campaign deleted successfully")
