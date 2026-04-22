import csv
import io
import math
from datetime import datetime, timezone

from bson import ObjectId
from fastapi import APIRouter, Depends, File, Form, HTTPException, Query, UploadFile, status
from motor.motor_asyncio import AsyncIOMotorDatabase
from pydantic import BaseModel, ConfigDict

from app.database import get_db
from app.dependencies import get_current_admin
from app.schemas.campaign import RewardCodeDetail, RewardCodeStatus
from app.schemas.common import MessageResponse, PageResponse
from app.utils.helpers import to_str_id

router = APIRouter(dependencies=[Depends(get_current_admin)])


class PasteImportRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")

    codes_text: str
    campaign_id: str
    wheel_item_id: str
    pool_type: str = "paste"


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


async def read_upload_text(file: UploadFile, label: str) -> str:
    try:
        return (await file.read()).decode("utf-8").lstrip("\ufeff")
    except UnicodeDecodeError as exc:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=f"{label} must be UTF-8 encoded") from exc


async def read_csv_rows(file: UploadFile) -> list[dict]:
    content = await read_upload_text(file, "CSV")
    reader = csv.DictReader(io.StringIO(content))
    required = {"code", "campaign_id", "wheel_item_id", "pool_type"}
    if not reader.fieldnames or not required.issubset(set(reader.fieldnames)):
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="CSV missing required columns")
    return [row for row in reader if row]


def is_text_upload(file: UploadFile) -> bool:
    filename = (file.filename or "").lower()
    content_type = (file.content_type or "").lower()
    return filename.endswith(".txt") or content_type.startswith("text/plain")


def parse_codes_text(codes_text: str) -> list[str]:
    return [line.strip() for line in codes_text.lstrip("\ufeff").splitlines() if line.strip()]


def build_rows_from_codes(
    codes: list[str],
    campaign_id: str,
    wheel_item_id: str,
    pool_type: str,
) -> list[dict]:
    return [
        {
            "code": code,
            "campaign_id": campaign_id,
            "wheel_item_id": wheel_item_id,
            "pool_type": pool_type,
        }
        for code in codes
    ]


async def read_txt_rows(
    file: UploadFile,
    campaign_id: str | None,
    wheel_item_id: str | None,
    pool_type: str,
) -> list[dict]:
    if not campaign_id or not wheel_item_id:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="campaign_id and wheel_item_id are required for TXT import",
        )
    codes = parse_codes_text(await read_upload_text(file, "TXT"))
    return build_rows_from_codes(codes, campaign_id.strip(), wheel_item_id.strip(), pool_type.strip())


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


async def insert_reward_code_rows(db: AsyncIOMotorDatabase, rows: list[dict]) -> int:
    documents = build_reward_code_documents(rows, await get_existing_codes(db, rows))
    if documents:
        await db.reward_codes.insert_many(documents)
    return len(documents)


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


@router.get("/stats")
async def reward_code_stats(
    campaign_id: str | None = None,
    db: AsyncIOMotorDatabase = Depends(get_db),
):
    query_base: dict = {}
    if campaign_id:
        query_base["campaign_id"] = parse_object_id(campaign_id, "campaign_id")
    now = datetime.now(timezone.utc)
    day_start = now.replace(hour=0, minute=0, second=0, microsecond=0)

    async def count(extra: dict) -> int:
        return await db.reward_codes.count_documents({**query_base, **extra})

    return {
        "total": await count({}),
        "unused": await count({"status": "unused"}),
        "assigned": await count({"status": "assigned"}),
        "redeemed": await count({"status": "redeemed"}),
        "blocked": await count({"status": "blocked"}),
        "assigned_today": await count({"status": "assigned", "updated_at": {"$gte": day_start}}),
        "redeemed_today": await count({"status": "redeemed", "redeemed_at": {"$gte": day_start}}),
    }


@router.post("/import", response_model=MessageResponse)
async def import_reward_codes(
    file: UploadFile = File(...),
    campaign_id: str | None = Form(None),
    wheel_item_id: str | None = Form(None),
    pool_type: str = Form("imported"),
    db: AsyncIOMotorDatabase = Depends(get_db),
) -> MessageResponse:
    if is_text_upload(file):
        rows = await read_txt_rows(file, campaign_id, wheel_item_id, pool_type)
    else:
        rows = await read_csv_rows(file)
    count = await insert_reward_code_rows(db, rows)
    return MessageResponse(message=f"Imported {count} codes")


@router.post("/import-paste", response_model=MessageResponse)
async def import_reward_codes_paste(
    payload: PasteImportRequest,
    db: AsyncIOMotorDatabase = Depends(get_db),
) -> MessageResponse:
    rows = build_rows_from_codes(
        parse_codes_text(payload.codes_text),
        payload.campaign_id.strip(),
        payload.wheel_item_id.strip(),
        payload.pool_type.strip(),
    )
    count = await insert_reward_code_rows(db, rows)
    return MessageResponse(message=f"Imported {count} codes")


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
