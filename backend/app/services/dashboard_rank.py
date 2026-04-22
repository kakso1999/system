import asyncio
from datetime import datetime, timezone

from bson import ObjectId
from motor.motor_asyncio import AsyncIOMotorDatabase

STAFF_RANK_STATUSES = ["approved", "paid"]
TEAM_RANK_EXCLUDED_STATUSES = ["cancelled", "rejected"]


def get_utc_today_start(reference: datetime | None = None) -> datetime:
    current_time = reference or datetime.now(timezone.utc)
    if current_time.tzinfo is None:
        current_time = current_time.replace(tzinfo=timezone.utc)
    return current_time.astimezone(timezone.utc).replace(hour=0, minute=0, second=0, microsecond=0)


def mask_phone(phone: str | None) -> str:
    if not phone:
        return ""
    if len(phone) <= 6:
        return f"{phone[:3]}***{phone[-3:]}"
    return f"{phone[:3]}***{phone[-3:]}"


async def fetch_staff_name_map(db: AsyncIOMotorDatabase, staff_ids: list[ObjectId]) -> dict[ObjectId, str]:
    if not staff_ids:
        return {}
    items = await db.staff_users.find(
        {"_id": {"$in": staff_ids}},
        {"name": 1},
    ).to_list(length=len(staff_ids))
    return {item["_id"]: item.get("name", "") for item in items}


async def fetch_wheel_name_map(db: AsyncIOMotorDatabase, item_ids: list[ObjectId]) -> dict[ObjectId, str]:
    if not item_ids:
        return {}
    items = await db.wheel_items.find(
        {"_id": {"$in": item_ids}},
        {"display_name": 1, "name": 1},
    ).to_list(length=len(item_ids))
    return {item["_id"]: item.get("display_name") or item.get("name", "") for item in items}


async def aggregate_count_map(collection, match: dict, group_field: str) -> dict[ObjectId, int]:
    pipeline = [
        {"$match": match},
        {"$group": {"_id": f"${group_field}", "value": {"$sum": 1}}},
    ]
    items = await collection.aggregate(pipeline).to_list(length=None)
    return {item["_id"]: int(item.get("value", 0)) for item in items if isinstance(item.get("_id"), ObjectId)}


async def aggregate_sum_map(
    collection,
    match: dict,
    *,
    group_field: str,
    value_field: str,
) -> dict[ObjectId, int]:
    pipeline = [
        {"$match": match},
        {"$group": {"_id": f"${group_field}", "value": {"$sum": f"${value_field}"}}},
    ]
    items = await collection.aggregate(pipeline).to_list(length=None)
    return {item["_id"]: int(item.get("value", 0)) for item in items if isinstance(item.get("_id"), ObjectId)}


async def build_recent_claims(db: AsyncIOMotorDatabase, limit: int) -> list[dict]:
    claims = await db.claims.find(
        {"status": "success"},
        {"phone": 1, "wheel_item_id": 1, "prize_type": 1, "status": 1, "staff_id": 1, "created_at": 1},
    ).sort("created_at", -1).limit(limit).to_list(length=limit)
    staff_ids = list({item["staff_id"] for item in claims if isinstance(item.get("staff_id"), ObjectId)})
    wheel_item_ids = list({item["wheel_item_id"] for item in claims if isinstance(item.get("wheel_item_id"), ObjectId)})
    staff_names, wheel_names = await asyncio.gather(
        fetch_staff_name_map(db, staff_ids),
        fetch_wheel_name_map(db, wheel_item_ids),
    )
    return [serialize_recent_claim(item, staff_names, wheel_names) for item in claims]


def serialize_recent_claim(item: dict, staff_names: dict[ObjectId, str], wheel_names: dict[ObjectId, str]) -> dict:
    wheel_item_id = item.get("wheel_item_id")
    staff_id = item.get("staff_id")
    return {
        "id": str(item["_id"]),
        "phone_masked": mask_phone(item.get("phone")),
        "wheel_item_name": wheel_names.get(wheel_item_id, ""),
        "prize_type": item.get("prize_type", ""),
        "status": item.get("status", ""),
        "staff_name": staff_names.get(staff_id, ""),
        "created_at": item.get("created_at"),
    }


async def build_recent_risk(db: AsyncIOMotorDatabase, limit: int) -> list[dict]:
    items = await db.risk_logs.find(
        {},
        {"phone": 1, "type": 1, "ip": 1, "created_at": 1, "reason": 1},
    ).sort("created_at", -1).limit(limit).to_list(length=limit)
    return [
        {
            "id": str(item["_id"]),
            "type": item.get("type", ""),
            "phone_masked": mask_phone(item.get("phone")),
            "ip": item.get("ip", ""),
            "created_at": item.get("created_at"),
            "reason": item.get("reason", ""),
        }
        for item in items
    ]


async def build_today_staff_rank(db: AsyncIOMotorDatabase, limit: int) -> list[dict]:
    today_start = get_utc_today_start()
    scan_counts, valid_counts, commission_sums = await asyncio.gather(
        aggregate_count_map(db.scan_logs, {"created_at": {"$gte": today_start}}, "staff_id"),
        aggregate_count_map(db.claims, {"status": "success", "created_at": {"$gte": today_start}}, "staff_id"),
        aggregate_sum_map(
            db.commission_logs,
            {"created_at": {"$gte": today_start}, "status": {"$in": STAFF_RANK_STATUSES}, "level": 1},
            group_field="beneficiary_staff_id",
            value_field="amount_cents",
        ),
    )
    staff_ids = list(set(scan_counts) | set(valid_counts) | set(commission_sums))
    staff_names = await fetch_staff_name_map(db, staff_ids)
    items = [
        {
            "staff_id": str(staff_id),
            "staff_name": staff_names.get(staff_id, ""),
            "scan_count": scan_counts.get(staff_id, 0),
            "valid_count": valid_counts.get(staff_id, 0),
            "commission_cents": commission_sums.get(staff_id, 0),
        }
        for staff_id in staff_ids
    ]
    items.sort(key=lambda item: (-item["valid_count"], -item["commission_cents"], -item["scan_count"], item["staff_name"]))
    return items[:limit]


async def aggregate_team_claims(db: AsyncIOMotorDatabase, today_start: datetime) -> dict[ObjectId, int]:
    pipeline = [
        {"$match": {"status": "success", "created_at": {"$gte": today_start}}},
        {"$lookup": {"from": "staff_relations", "localField": "staff_id", "foreignField": "staff_id", "as": "relations"}},
        {"$unwind": "$relations"},
        {"$group": {"_id": "$relations.ancestor_id", "value": {"$sum": 1}}},
    ]
    items = await db.claims.aggregate(pipeline).to_list(length=None)
    return {item["_id"]: int(item.get("value", 0)) for item in items if isinstance(item.get("_id"), ObjectId)}


async def build_today_team_rank(db: AsyncIOMotorDatabase, limit: int) -> list[dict]:
    today_start = get_utc_today_start()
    team_totals, team_commissions = await asyncio.gather(
        aggregate_team_claims(db, today_start),
        aggregate_sum_map(
            db.commission_logs,
            {
                "created_at": {"$gte": today_start},
                "beneficiary_staff_id": {"$exists": True},
                "level": {"$in": [2, 3]},
                "status": {"$nin": TEAM_RANK_EXCLUDED_STATUSES},
            },
            group_field="beneficiary_staff_id",
            value_field="amount_cents",
        ),
    )
    staff_ids = list(set(team_totals) | set(team_commissions))
    staff_names = await fetch_staff_name_map(db, staff_ids)
    items = [
        {
            "staff_id": str(staff_id),
            "staff_name": staff_names.get(staff_id, ""),
            "team_total_today": team_totals.get(staff_id, 0),
            "team_commission_cents": team_commissions.get(staff_id, 0),
        }
        for staff_id in staff_ids
        if team_totals.get(staff_id, 0) > 0 or team_commissions.get(staff_id, 0) > 0
    ]
    items.sort(key=lambda item: (-item["team_total_today"], -item["team_commission_cents"], item["staff_name"]))
    return items[:limit]
