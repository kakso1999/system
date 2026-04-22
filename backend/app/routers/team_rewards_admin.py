import math
from datetime import datetime, timezone

from fastapi import APIRouter, Depends, HTTPException, Query, status
from motor.motor_asyncio import AsyncIOMotorDatabase
from pymongo import ReturnDocument

from app.database import get_db
from app.dependencies import get_current_admin
from app.schemas.common import PageResponse
from app.schemas.team_reward import ReissueRequest, VoidRequest
from app.services.team_rewards_admin import (
    admin_username,
    build_staff_search_match,
    cancel_linked_commission,
    find_linked_commission,
    find_reward_or_404,
    get_milestone_config,
    get_staff_or_404,
    log_finance_action,
    normalize_milestone,
    parse_object_id,
    reissue_reward,
    reward_status,
    serialize_reward,
)
from app.utils.money import read_cents

router = APIRouter(dependencies=[Depends(get_current_admin)])


@router.get("/", response_model=PageResponse)
async def list_team_rewards(
    staff_id: str | None = None,
    milestone: str | None = None,
    status_: str | None = Query(None, alias="status"),
    page: int = Query(1, ge=1),
    page_size: int = Query(20, ge=1, le=100),
    db: AsyncIOMotorDatabase = Depends(get_db),
) -> PageResponse:
    pipeline = []
    if milestone:
        pipeline.append({"$match": {"milestone": normalize_milestone(milestone)}})
    pipeline.extend([
        {"$addFields": {"status": {"$ifNull": ["$status", "issued"]}, "team_total": {"$ifNull": ["$team_total", "$team_total_at_time"]}}},
        {"$lookup": {"from": "staff_users", "localField": "staff_id", "foreignField": "_id", "as": "staff"}},
        {"$unwind": {"path": "$staff", "preserveNullAndEmptyArrays": True}},
    ])
    search_match = build_staff_search_match(staff_id or "")
    if search_match:
        pipeline.append({"$match": search_match})
    if status_:
        pipeline.append({"$match": {"status": status_}})
    total_result = await db.team_rewards.aggregate([*pipeline, {"$count": "total"}]).to_list(length=1)
    items = await db.team_rewards.aggregate([
        *pipeline,
        {"$sort": {"created_at": -1}},
        {"$skip": (page - 1) * page_size},
        {"$limit": page_size},
        {"$project": {
            "staff_id": 1,
            "milestone": 1,
            "threshold": 1,
            "amount": 1,
            "amount_cents": 1,
            "team_total": 1,
            "status": 1,
            "created_at": 1,
            "commission_log_id": 1,
            "staff_name": {"$ifNull": ["$staff.name", ""]},
            "staff_no": {"$ifNull": ["$staff.staff_no", ""]},
        }},
    ]).to_list(length=page_size)
    total = int(total_result[0]["total"]) if total_result else 0
    return PageResponse(
        items=[serialize_reward(item) for item in items],
        total=total,
        page=page,
        page_size=page_size,
        pages=math.ceil(total / page_size) if total else 0,
    )


@router.post("/reissue", status_code=status.HTTP_201_CREATED)
async def reissue_team_reward(
    payload: ReissueRequest,
    admin: dict = Depends(get_current_admin),
    db: AsyncIOMotorDatabase = Depends(get_db),
):
    staff = await get_staff_or_404(db, parse_object_id(payload.staff_id, "staff_id"))
    milestone = normalize_milestone(payload.milestone)
    existing = await db.team_rewards.find_one({"staff_id": staff["_id"], "milestone": milestone})
    if existing and reward_status(existing) != "voided":
        raise HTTPException(status_code=409, detail="team_reward_exists")
    config = await get_milestone_config(db, milestone)
    remark = str(payload.remark or "").strip()
    result = await reissue_reward(
        db,
        staff=staff,
        milestone=milestone,
        config=config,
        admin=admin,
        remark=remark,
        existing=existing,
    )
    await log_finance_action(
        db,
        admin=admin,
        action="reissue",
        target_id=result["reward_id"],
        old_status=result["old_status"],
        new_status="issued",
        amount_cents=result["amount_cents"],
        remark=remark,
    )
    return {"id": str(result["reward_id"])}


@router.post("/{reward_id}/void")
async def void_team_reward(
    reward_id: str,
    payload: VoidRequest,
    admin: dict = Depends(get_current_admin),
    db: AsyncIOMotorDatabase = Depends(get_db),
):
    reward = await find_reward_or_404(db, reward_id)
    current_status = reward_status(reward)
    if current_status == "voided":
        raise HTTPException(status_code=409, detail="team_reward_voided")
    remark = str(payload.remark or "").strip()
    commission = await find_linked_commission(db, reward)
    await cancel_linked_commission(db, commission=commission, reward=reward, admin=admin, remark=remark)
    updated = await db.team_rewards.find_one_and_update(
        {"_id": reward["_id"]},
        {"$set": {
            "status": "voided",
            "void_reason": remark or None,
            "voided_at": datetime.now(timezone.utc),
            "voided_by": admin_username(admin),
        }},
        return_document=ReturnDocument.AFTER,
    )
    await log_finance_action(
        db,
        admin=admin,
        action="void",
        target_id=reward["_id"],
        old_status=current_status,
        new_status="voided",
        amount_cents=read_cents(reward),
        remark=remark,
    )
    return {"id": str(updated["_id"]), "status": "voided"}
