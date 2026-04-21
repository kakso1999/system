import math
import uuid
from datetime import datetime, timezone
from pathlib import Path
from typing import Literal

from bson import ObjectId
from fastapi import APIRouter, Depends, File, HTTPException, Query, UploadFile, status
from motor.motor_asyncio import AsyncIOMotorDatabase
from pymongo import ReturnDocument

from app.database import get_db
from app.dependencies import get_current_admin
from app.schemas.common import MessageResponse, PageResponse
from app.schemas.sponsors import (
    SponsorCreateRequest,
    SponsorDetail,
    SponsorPublic,
    SponsorUpdateRequest,
)
from app.utils.helpers import to_str_id

router = APIRouter(dependencies=[Depends(get_current_admin)])
public_router = APIRouter()

UPLOAD_DIR = Path(__file__).parent.parent.parent / "uploads"


def parse_object_id(value: str, field_name: str) -> ObjectId:
    if not ObjectId.is_valid(value):
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=f"Invalid {field_name}")
    return ObjectId(value)


def serialize_sponsor(doc: dict) -> dict:
    data = to_str_id(doc)
    data.setdefault("updated_at", None)
    return data


async def get_sponsor_or_404(db: AsyncIOMotorDatabase, sponsor_id: str) -> dict:
    sponsor = await db.sponsors.find_one({"_id": parse_object_id(sponsor_id, "sponsor_id")})
    if not sponsor:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Sponsor not found")
    return sponsor


@router.get("/", response_model=PageResponse)
async def list_sponsors(
    page: int = Query(1, ge=1),
    page_size: int = Query(20, ge=1, le=100),
    enabled: Literal["true", "false", "all"] = Query("all"),
    db: AsyncIOMotorDatabase = Depends(get_db),
) -> PageResponse:
    query: dict = {}
    if enabled != "all":
        query["enabled"] = enabled == "true"
    cursor = (
        db.sponsors.find(query)
        .sort([("sort_order", 1), ("created_at", -1)])
        .skip((page - 1) * page_size)
        .limit(page_size)
    )
    items = await cursor.to_list(length=page_size)
    total = await db.sponsors.count_documents(query)
    serialized = [SponsorDetail.model_validate(serialize_sponsor(item)).model_dump() for item in items]
    return PageResponse(
        items=serialized,
        total=total,
        page=page,
        page_size=page_size,
        pages=math.ceil(total / page_size) if total else 0,
    )


@router.post("/", response_model=SponsorDetail, status_code=status.HTTP_201_CREATED)
async def create_sponsor(
    payload: SponsorCreateRequest,
    db: AsyncIOMotorDatabase = Depends(get_db),
) -> SponsorDetail:
    now = datetime.now(timezone.utc)
    document = payload.model_dump()
    document.update({"created_at": now, "updated_at": now})
    result = await db.sponsors.insert_one(document)
    document["_id"] = result.inserted_id
    return SponsorDetail.model_validate(serialize_sponsor(document))


@router.put("/{sponsor_id}", response_model=SponsorDetail)
async def update_sponsor(
    sponsor_id: str,
    payload: SponsorUpdateRequest,
    db: AsyncIOMotorDatabase = Depends(get_db),
) -> SponsorDetail:
    sponsor = await get_sponsor_or_404(db, sponsor_id)
    updates = payload.model_dump(exclude_unset=True)
    if not updates:
        return SponsorDetail.model_validate(serialize_sponsor(sponsor))
    updates["updated_at"] = datetime.now(timezone.utc)
    updated = await db.sponsors.find_one_and_update(
        {"_id": sponsor["_id"]},
        {"$set": updates},
        return_document=ReturnDocument.AFTER,
    )
    return SponsorDetail.model_validate(serialize_sponsor(updated))


@router.delete("/{sponsor_id}", response_model=MessageResponse)
async def delete_sponsor(
    sponsor_id: str,
    db: AsyncIOMotorDatabase = Depends(get_db),
) -> MessageResponse:
    sponsor = await get_sponsor_or_404(db, sponsor_id)
    await db.sponsors.delete_one({"_id": sponsor["_id"]})
    return MessageResponse(message="Sponsor deleted successfully")


@router.put("/{sponsor_id}/toggle", response_model=MessageResponse)
async def toggle_sponsor(
    sponsor_id: str,
    db: AsyncIOMotorDatabase = Depends(get_db),
) -> MessageResponse:
    sponsor = await get_sponsor_or_404(db, sponsor_id)
    await db.sponsors.update_one(
        {"_id": sponsor["_id"]},
        {"$set": {"enabled": not sponsor.get("enabled", True), "updated_at": datetime.now(timezone.utc)}},
    )
    return MessageResponse(message="Sponsor toggled successfully")


@router.post("/{sponsor_id}/upload-logo")
async def upload_sponsor_logo(
    sponsor_id: str,
    file: UploadFile = File(...),
    db: AsyncIOMotorDatabase = Depends(get_db),
):
    sponsor = await get_sponsor_or_404(db, sponsor_id)
    ext = file.filename.rsplit(".", 1)[-1] if file.filename else "png"
    filename = f"sponsor_{uuid.uuid4().hex[:8]}.{ext}"
    filepath = UPLOAD_DIR / filename
    UPLOAD_DIR.mkdir(exist_ok=True)
    content = await file.read()
    filepath.write_bytes(content)
    logo_url = f"/uploads/{filename}"
    await db.sponsors.update_one(
        {"_id": sponsor["_id"]},
        {"$set": {"logo_url": logo_url, "updated_at": datetime.now(timezone.utc)}},
    )
    return {"logo_url": logo_url}


@public_router.get("/active", response_model=list[SponsorPublic])
async def list_active_sponsors(
    db: AsyncIOMotorDatabase = Depends(get_db),
) -> list[SponsorPublic]:
    items = await db.sponsors.find({"enabled": True}).sort("sort_order", 1).limit(100).to_list(length=100)
    return [SponsorPublic.model_validate(serialize_sponsor(item)) for item in items]
