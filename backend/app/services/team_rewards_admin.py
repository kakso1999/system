from datetime import datetime, timezone

from bson import ObjectId
from fastapi import HTTPException
from motor.motor_asyncio import AsyncIOMotorDatabase
from pymongo import ReturnDocument
from pymongo.errors import DuplicateKeyError

from app.services.commission import generate_commission_no, get_setting
from app.services.team_reward import get_team_total
from app.utils.helpers import to_str_id
from app.utils.money import from_cents, read_cents, to_cents

MILESTONE_KEYS = {
    "100": "team_reward_100",
    "1000": "team_reward_1000",
    "10000": "team_reward_10000",
    "team_reward_100": "team_reward_100",
    "team_reward_1000": "team_reward_1000",
    "team_reward_10000": "team_reward_10000",
}


def parse_object_id(value: str, field_name: str) -> ObjectId:
    if not ObjectId.is_valid(value):
        raise HTTPException(status_code=400, detail=f"Invalid {field_name}")
    return ObjectId(value)


def normalize_milestone(value: str) -> str:
    milestone = str(value or "").strip()
    normalized = MILESTONE_KEYS.get(milestone)
    if not normalized:
        raise HTTPException(status_code=400, detail="Invalid milestone")
    return normalized


def reward_status(doc: dict) -> str:
    return str(doc.get("status") or "issued")


def admin_username(admin: dict) -> str:
    return str(admin.get("username") or "admin")


async def get_staff_or_404(db: AsyncIOMotorDatabase, staff_id: ObjectId) -> dict:
    staff = await db.staff_users.find_one(
        {"_id": staff_id},
        {"name": 1, "staff_no": 1, "phone": 1, "vip_level": 1, "campaign_id": 1, "stats.total_valid": 1},
    )
    if not staff:
        raise HTTPException(status_code=404, detail="Staff not found")
    return staff


async def get_milestone_config(db: AsyncIOMotorDatabase, milestone: str) -> dict:
    threshold = int(await get_setting(db, f"{milestone}_threshold", 0) or 0)
    amount_cents = to_cents(await get_setting(db, milestone, 0))
    return {"threshold": threshold, "amount_cents": amount_cents}


async def calculate_team_total(db: AsyncIOMotorDatabase, staff: dict) -> int:
    own_total = int((staff.get("stats") or {}).get("total_valid", 0))
    return own_total + await get_team_total(db, staff["_id"])


async def log_finance_action(
    db: AsyncIOMotorDatabase,
    *,
    admin: dict,
    action: str,
    target_id: ObjectId,
    old_status: str,
    new_status: str,
    amount_cents: int,
    remark: str,
) -> None:
    await db.finance_action_logs.insert_one({
        "admin_id": admin["_id"],
        "admin_username": admin_username(admin),
        "action": action,
        "target_type": "team_reward",
        "target_id": target_id,
        "old_status": old_status,
        "new_status": new_status,
        "amount_cents": int(amount_cents),
        "created_at": datetime.now(timezone.utc),
        "remark": remark,
    })


def serialize_reward(doc: dict) -> dict:
    data = to_str_id(doc)
    amount_cents = read_cents(doc)
    return {
        "id": data["id"],
        "staff_id": str(doc.get("staff_id") or ""),
        "staff_name": str(doc.get("staff_name") or ""),
        "staff_no": str(doc.get("staff_no") or ""),
        "milestone": str(doc.get("milestone") or ""),
        "threshold": int(doc.get("threshold") or 0),
        "amount": from_cents(amount_cents),
        "amount_cents": amount_cents,
        "team_total": int(doc.get("team_total") or doc.get("team_total_at_time") or 0),
        "status": reward_status(doc),
        "created_at": doc.get("created_at"),
        "commission_log_id": str(doc["commission_log_id"]) if doc.get("commission_log_id") else None,
    }


def build_staff_search_match(keyword: str) -> dict:
    term = str(keyword or "").strip()
    if not term:
        return {}
    regex = {"$regex": term, "$options": "i"}
    clauses = [{"staff.name": regex}, {"staff.staff_no": regex}, {"staff.phone": regex}]
    if ObjectId.is_valid(term):
        clauses.append({"staff_id": ObjectId(term)})
    return {"$or": clauses}


async def find_reward_or_404(db: AsyncIOMotorDatabase, reward_id: str) -> dict:
    reward = await db.team_rewards.find_one({"_id": parse_object_id(reward_id, "id")})
    if not reward:
        raise HTTPException(status_code=404, detail="Team reward not found")
    return reward


async def find_linked_commission(db: AsyncIOMotorDatabase, reward: dict) -> dict | None:
    commission_id = reward.get("commission_log_id")
    if isinstance(commission_id, ObjectId):
        return await db.commission_logs.find_one({"_id": commission_id})
    if isinstance(commission_id, str) and ObjectId.is_valid(commission_id):
        return await db.commission_logs.find_one({"_id": ObjectId(commission_id)})
    fallback = await db.commission_logs.find_one({
        "beneficiary_staff_id": reward["staff_id"],
        "type": "team_reward",
        "amount_cents": read_cents(reward),
        "created_at": reward.get("created_at"),
    })
    if fallback:
        await db.team_rewards.update_one({"_id": reward["_id"]}, {"$set": {"commission_log_id": fallback["_id"]}})
    return fallback


async def cancel_linked_commission(
    db: AsyncIOMotorDatabase,
    *,
    commission: dict | None,
    reward: dict,
    admin: dict,
    remark: str,
) -> None:
    if not commission:
        return
    if commission.get("status") == "paid":
        raise HTTPException(status_code=409, detail="linked_commission_paid")
    if commission.get("status") not in {"approved", "pending"}:
        return
    now = datetime.now(timezone.utc)
    await db.commission_logs.update_one(
        {"_id": commission["_id"]},
        {"$set": {
            "status": "cancelled",
            "cancel_reason": remark or None,
            "cancelled_at": now,
            "cancelled_by": admin_username(admin),
        }},
    )
    if commission.get("status") == "approved":
        amount_cents = read_cents(commission)
        await db.staff_users.update_one(
            {"_id": reward["staff_id"]},
            {"$inc": {
                "stats.total_commission": -from_cents(amount_cents),
                "stats.total_commission_cents": -amount_cents,
            }},
        )


def build_reward_document(
    *,
    staff: dict,
    milestone: str,
    threshold: int,
    amount_cents: int,
    team_total: int,
    commission_log_id: ObjectId,
    admin: dict,
    remark: str,
    now: datetime,
) -> dict:
    return {
        "staff_id": staff["_id"],
        "milestone": milestone,
        "threshold": threshold,
        "amount": from_cents(amount_cents),
        "amount_cents": amount_cents,
        "team_total_at_time": team_total,
        "team_total": team_total,
        "currency": "PHP",
        "status": "issued",
        "source": "manual",
        "admin_id": admin["_id"],
        "admin_username": admin_username(admin),
        "commission_log_id": commission_log_id,
        "remark": remark or None,
        "created_at": now,
        "void_reason": None,
        "voided_at": None,
        "voided_by": None,
    }


def build_commission_document(staff: dict, amount_cents: int, remark: str, now: datetime) -> dict:
    return {
        "commission_no": generate_commission_no(),
        "claim_id": None,
        "source_staff_id": staff["_id"],
        "beneficiary_staff_id": staff["_id"],
        "level": 0,
        "type": "team_reward",
        "amount": from_cents(amount_cents),
        "amount_cents": int(amount_cents),
        "rate": from_cents(amount_cents),
        "vip_level_at_time": int(staff.get("vip_level", 0)),
        "currency": "PHP",
        "campaign_id": staff.get("campaign_id"),
        "status": "approved",
        "remark": remark or None,
        "created_at": now,
    }


async def reissue_reward(
    db: AsyncIOMotorDatabase,
    *,
    staff: dict,
    milestone: str,
    config: dict,
    admin: dict,
    remark: str,
    existing: dict | None,
) -> dict:
    now = datetime.now(timezone.utc)
    team_total = await calculate_team_total(db, staff)
    commission = build_commission_document(staff, config["amount_cents"], remark, now)
    commission_result = await db.commission_logs.insert_one(commission)
    reward_doc = build_reward_document(
        staff=staff,
        milestone=milestone,
        threshold=config["threshold"],
        amount_cents=config["amount_cents"],
        team_total=team_total,
        commission_log_id=commission_result.inserted_id,
        admin=admin,
        remark=remark,
        now=now,
    )
    reward_id = existing["_id"] if existing else None
    try:
        if existing:
            updated = await db.team_rewards.find_one_and_update(
                {"_id": existing["_id"]},
                {"$set": reward_doc},
                return_document=ReturnDocument.AFTER,
            )
            if not updated:
                raise HTTPException(status_code=409, detail="team_reward_changed")
        else:
            reward_id = (await db.team_rewards.insert_one(reward_doc)).inserted_id
    except DuplicateKeyError as exc:
        await db.commission_logs.delete_one({"_id": commission_result.inserted_id})
        raise HTTPException(status_code=409, detail="team_reward_exists") from exc
    await db.staff_users.update_one(
        {"_id": staff["_id"]},
        {"$inc": {
            "stats.total_commission": from_cents(config["amount_cents"]),
            "stats.total_commission_cents": config["amount_cents"],
        }},
    )
    return {
        "reward_id": reward_id or existing["_id"],
        "amount_cents": config["amount_cents"],
        "old_status": reward_status(existing) if existing else "",
    }
