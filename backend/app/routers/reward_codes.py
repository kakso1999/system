import csv
import io
import math
from datetime import datetime, timezone

from bson import ObjectId
from fastapi import APIRouter, Depends, File, HTTPException, Query, UploadFile, status
from motor.motor_asyncio import AsyncIOMotorDatabase

from app.database import get_db
from app.dependencies import get_current_admin
from app.schemas.campaign import RewardCodeDetail, RewardCodeStatus
from app.schemas.common import MessageResponse, PageResponse
from app.utils.helpers import to_str_id

router = APIRouter(dependencies=[Depends(get_current_admin)])


def parse_object_id(value: str, field_name: str) -> ObjectId:
    if not ObjectId.is_valid(value):
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=f"Invalid {field_name}")
    return ObjectId(value)


def serialize_reward_code(doc: dict) -> dict:
    data = to_str_id(doc)
    for key in ("campaign_id", "wheel_item_id"):
        if isinstance(data.get(key), ObjectId):
            data[key] = str(data[key])
    return data


async def get_reward_code_or_404(db: AsyncIOMotorDatabase, code_id: str) -> dict:
    reward_code = await db.reward_codes.find_one({"_id": parse_object_id(code_id, "code_id")})
    if not reward_code:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Reward code not found")
    return reward_code


async def read_csv_rows(file: UploadFile) -> list[dict]:
    try:
        content = (await file.read()).decode("utf-8").lstrip("\ufeff")
    except UnicodeDecodeError as exc:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="CSV must be UTF-8 encoded") from exc
    reader = csv.DictReader(io.StringIO(content))
    required = {"code", "campaign_id", "wheel_item_id", "pool_type"}
    if not reader.fieldnames or not required.issubset(set(reader.fieldnames)):
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="CSV missing required columns")
    return [row for row in reader if row]


def build_reward_code_documents(rows: list[dict], existing_codes: set[str]) -> list[dict]:
    now = datetime.now(timezone.utc)
    documents: list[dict] = []
    seen_codes = set(existing_codes)
    for row in rows:
        code = (row.get("code") or "").strip()
        if not code or code in seen_codes:
            continue
        seen_codes.add(code)
        documents.append(
            {
                "code": code,
                "campaign_id": parse_object_id((row.get("campaign_id") or "").strip(), "campaign_id"),
                "wheel_item_id": parse_object_id((row.get("wheel_item_id") or "").strip(), "wheel_item_id"),
                "pool_type": (row.get("pool_type") or "").strip(),
                "status": "unused",
                "created_at": now,
                "updated_at": now,
            }
        )
    return documents


async def get_existing_codes(db: AsyncIOMotorDatabase, rows: list[dict]) -> set[str]:
    codes = list({(row.get("code") or "").strip() for row in rows if (row.get("code") or "").strip()})
    if not codes:
        return set()
    records = await db.reward_codes.find({"code": {"$in": codes}}, {"code": 1}).to_list(length=len(codes))
    return {record["code"] for record in records}


@router.get("/", response_model=PageResponse)
async def list_reward_codes(
    page: int = Query(1, ge=1),
    page_size: int = Query(20, ge=1, le=100),
    campaign_id: str | None = None,
    status_value: RewardCodeStatus | None = Query(None, alias="status"),
    wheel_item_id: str | None = None,
    db: AsyncIOMotorDatabase = Depends(get_db),
) -> PageResponse:
    query: dict = {}
    if campaign_id:
        query["campaign_id"] = parse_object_id(campaign_id, "campaign_id")
    if status_value:
        query["status"] = status_value
    if wheel_item_id:
        query["wheel_item_id"] = parse_object_id(wheel_item_id, "wheel_item_id")
    cursor = db.reward_codes.find(query).sort("created_at", -1).skip((page - 1) * page_size).limit(page_size)
    items = await cursor.to_list(length=page_size)
    total = await db.reward_codes.count_documents(query)
    serialized_items = [RewardCodeDetail.model_validate(serialize_reward_code(item)).model_dump() for item in items]
    return PageResponse(
        items=serialized_items,
        total=total,
        page=page,
        page_size=page_size,
        pages=math.ceil(total / page_size) if total else 0,
    )


@router.post("/import", response_model=MessageResponse)
async def import_reward_codes(
    file: UploadFile = File(...),
    db: AsyncIOMotorDatabase = Depends(get_db),
) -> MessageResponse:
    rows = await read_csv_rows(file)
    documents = build_reward_code_documents(rows, await get_existing_codes(db, rows))
    if documents:
        await db.reward_codes.insert_many(documents)
    return MessageResponse(message=f"Imported {len(documents)} codes")


@router.put("/{code_id}/block", response_model=MessageResponse)
async def block_reward_code(
    code_id: str,
    db: AsyncIOMotorDatabase = Depends(get_db),
) -> MessageResponse:
    reward_code = await get_reward_code_or_404(db, code_id)
    await db.reward_codes.update_one(
        {"_id": reward_code["_id"]},
        {"$set": {"status": "blocked", "updated_at": datetime.now(timezone.utc)}},
    )
    return MessageResponse(message="Reward code blocked successfully")


@router.put("/{code_id}/unblock", response_model=MessageResponse)
async def unblock_reward_code(
    code_id: str,
    db: AsyncIOMotorDatabase = Depends(get_db),
) -> MessageResponse:
    reward_code = await get_reward_code_or_404(db, code_id)
    if reward_code.get("status") != "blocked":
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Only blocked codes can be unblocked")
    await db.reward_codes.update_one(
        {"_id": reward_code["_id"]},
        {"$set": {"status": "unused", "updated_at": datetime.now(timezone.utc)}},
    )
    return MessageResponse(message="Reward code unblocked successfully")
