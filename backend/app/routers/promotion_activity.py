import math
from datetime import datetime

from bson import ObjectId
from fastapi import APIRouter, Depends, HTTPException, Query, status
from motor.motor_asyncio import AsyncIOMotorDatabase

from app.database import get_db
from app.dependencies import get_current_admin
from app.schemas.common import PageResponse
from app.utils.helpers import to_str_id

router = APIRouter(dependencies=[Depends(get_current_admin)])


def parse_object_id(value: str, field: str) -> ObjectId:
    if not ObjectId.is_valid(value):
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=f"Invalid {field}")
    return ObjectId(value)


@router.get("/", response_model=PageResponse)
async def list_activity(
    staff_id: str | None = None,
    event_type: str | None = None,
    date_from: str | None = None,
    date_to: str | None = None,
    page: int = Query(1, ge=1),
    page_size: int = Query(20, ge=1, le=100),
    db: AsyncIOMotorDatabase = Depends(get_db),
) -> PageResponse:
    query: dict = {}
    if staff_id:
        query["staff_id"] = parse_object_id(staff_id, "staff_id")
    if event_type:
        query["event_type"] = event_type
    if date_from or date_to:
        range_query: dict = {}
        if date_from:
            try:
                range_query["$gte"] = datetime.fromisoformat(date_from)
            except ValueError as exc:
                raise HTTPException(status_code=400, detail="Invalid date_from") from exc
        if date_to:
            try:
                range_query["$lte"] = datetime.fromisoformat(date_to)
            except ValueError as exc:
                raise HTTPException(status_code=400, detail="Invalid date_to") from exc
        query["created_at"] = range_query

    total = await db.promotion_activity_logs.count_documents(query)
    cursor = (
        db.promotion_activity_logs.find(query)
        .sort("created_at", -1)
        .skip((page - 1) * page_size)
        .limit(page_size)
    )
    items_raw = await cursor.to_list(length=page_size)

    staff_ids = list({doc["staff_id"] for doc in items_raw if doc.get("staff_id")})
    staff_map: dict[ObjectId, dict] = {}
    if staff_ids:
        async for staff in db.staff_users.find({"_id": {"$in": staff_ids}}, {"name": 1, "staff_no": 1}):
            staff_map[staff["_id"]] = staff

    items = []
    for doc in items_raw:
        item = to_str_id(doc)
        sid = doc.get("staff_id")
        staff_info = staff_map.get(sid) if sid else None
        item["staff_name"] = staff_info["name"] if staff_info else ""
        item["staff_no"] = staff_info["staff_no"] if staff_info else ""
        item["staff_id"] = str(sid) if sid else ""
        if isinstance(item.get("created_at"), datetime):
            item["created_at"] = item["created_at"].isoformat()
        items.append(item)

    return PageResponse(
        items=items,
        total=total,
        page=page,
        page_size=page_size,
        pages=math.ceil(total / page_size) if total else 0,
    )
