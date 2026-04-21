from datetime import datetime, timedelta, timezone
from zoneinfo import ZoneInfo

from bson import ObjectId
from motor.motor_asyncio import AsyncIOMotorDatabase

from app.config import get_settings
from app.services.commission import generate_commission_no
from app.utils.money import from_cents, read_cents, to_cents


def sorted_tiers(tiers: list[dict]) -> list[dict]:
    normalized = []
    for tier in tiers:
        raw_cents = tier.get("amount_cents")
        if raw_cents is None:
            cents = to_cents(tier.get("amount"))
        else:
            try:
                cents = int(raw_cents)
            except (TypeError, ValueError):
                cents = to_cents(tier.get("amount"))
        normalized.append({
            "threshold": int(tier["threshold"]),
            "amount": from_cents(cents),
            "amount_cents": cents,
        })
    return sorted(normalized, key=lambda tier: tier["threshold"])


def valid_threshold_tier(tiers, threshold) -> dict | None:
    for tier in tiers:
        if int(tier.get("threshold", 0)) == int(threshold):
            return dict(tier)
    return None


async def get_active_rule(
    db: AsyncIOMotorDatabase,
    staff_id: ObjectId,
) -> dict | None:
    staff_rule = await db.staff_bonus_rules.find_one({"staff_id": staff_id})
    if staff_rule:
        return staff_rule if staff_rule.get("enabled") else None
    global_rule = await db.staff_bonus_rules.find_one({"staff_id": None})
    if global_rule and global_rule.get("enabled"):
        return global_rule
    return None


def today_local_str(db_or_tz: str | None = None) -> tuple[str, datetime, datetime]:
    """Return (YYYY-MM-DD, utc_start_of_day, utc_end_of_day) for the report timezone."""
    tz_name = db_or_tz or get_settings().REPORT_TIMEZONE or "UTC"
    local_now = datetime.now(ZoneInfo(tz_name))
    local_start = local_now.replace(hour=0, minute=0, second=0, microsecond=0)
    local_end = local_start + timedelta(days=1)
    return (
        local_start.strftime("%Y-%m-%d"),
        local_start.astimezone(timezone.utc),
        local_end.astimezone(timezone.utc),
    )


async def count_valid_today(db, staff_id) -> int:
    _, start, end = today_local_str()
    return await db.claims.count_documents({
        "staff_id": staff_id,
        "status": "success",
        "created_at": {"$gte": start, "$lt": end},
    })


async def list_today_claimed(db, staff_id) -> list[dict]:
    date_str, _, _ = today_local_str()
    return await db.bonus_claim_records.find(
        {"staff_id": staff_id, "date": date_str}
    ).to_list(length=100)


def serialize_today_rule(rule: dict) -> dict:
    staff_id = rule.get("staff_id")
    return {
        "staff_id": str(staff_id) if staff_id else None,
        "tiers": sorted_tiers(rule.get("tiers", [])),
        "enabled": bool(rule.get("enabled", True)),
    }


def build_today_tiers(tiers: list[dict], valid_count: int, claims: list[dict]) -> list[dict]:
    claimed = {int(record.get("tier_threshold", 0)) for record in claims}
    items = []
    for tier in sorted_tiers(tiers):
        threshold = int(tier["threshold"])
        cents = int(tier["amount_cents"])
        is_claimed = threshold in claimed
        reached = valid_count >= threshold
        items.append({
            "threshold": threshold,
            "amount": from_cents(cents),
            "amount_cents": cents,
            "reached": reached,
            "claimed": is_claimed,
            "claimable": reached and not is_claimed,
        })
    return items


def build_claimed_today_tiers(claims: list[dict]) -> list[dict]:
    items = []
    for record in sorted(claims, key=lambda item: int(item.get("tier_threshold", 0))):
        cents = read_cents(record)
        items.append({
            "threshold": int(record["tier_threshold"]),
            "amount": from_cents(cents),
            "amount_cents": cents,
            "reached": True,
            "claimed": True,
            "claimable": False,
        })
    return items


async def get_today_bonus_progress(db, staff_id) -> dict:
    date_str, start, end = today_local_str()
    valid_count = await db.claims.count_documents({
        "staff_id": staff_id,
        "status": "success",
        "created_at": {"$gte": start, "$lt": end},
    })
    claims = await list_today_claimed(db, staff_id)
    total_earned_cents = sum(read_cents(record) for record in claims)
    rule = await get_active_rule(db, staff_id)
    if rule is None:
        return {
            "date": date_str,
            "valid_count": valid_count,
            "rule": None,
            "tiers": build_claimed_today_tiers(claims),
            "total_earned_today": from_cents(total_earned_cents),
        }
    return {
        "date": date_str,
        "valid_count": valid_count,
        "rule": serialize_today_rule(rule),
        "tiers": build_today_tiers(rule.get("tiers", []), valid_count, claims),
        "total_earned_today": from_cents(total_earned_cents),
    }


async def get_bonus_claim_context(db, staff_id, tier_threshold: int) -> tuple[str, int, dict, dict]:
    date_str, start, end = today_local_str()
    rule = await get_active_rule(db, staff_id)
    if rule is None:
        raise ValueError("rule_disabled")
    tier = valid_threshold_tier(sorted_tiers(rule.get("tiers", [])), tier_threshold)
    if tier is None:
        raise ValueError("tier_not_found")
    valid_count = await db.claims.count_documents({
        "staff_id": staff_id,
        "status": "success",
        "created_at": {"$gte": start, "$lt": end},
    })
    if valid_count < int(tier["threshold"]):
        raise ValueError("tier_not_reached")
    return date_str, valid_count, rule, tier


async def insert_bonus_claim_record(
    db,
    staff_id,
    date_str: str,
    rule: dict,
    tier: dict,
    valid_count: int,
    now: datetime,
) -> dict:
    rule_snapshot = dict(rule)
    rule_snapshot["tiers"] = sorted_tiers(rule.get("tiers", []))
    cents = int(tier.get("amount_cents") or to_cents(tier.get("amount")))
    doc = {
        "staff_id": staff_id,
        "date": date_str,
        "tier_threshold": int(tier["threshold"]),
        "amount": from_cents(cents),
        "amount_cents": cents,
        "valid_count_at_claim": valid_count,
        "status": "claimed",
        "rule_snapshot": rule_snapshot,
        "created_at": now,
    }
    result = await db.bonus_claim_records.insert_one(doc)
    doc["_id"] = result.inserted_id
    return doc


async def create_bonus_commission_log(
    db,
    staff: dict,
    bonus_record_id: ObjectId,
    amount_cents: int,
    now: datetime,
) -> None:
    amount_cents = int(amount_cents)
    await db.commission_logs.insert_one({
        "commission_no": generate_commission_no(),
        "claim_id": None,
        "bonus_record_id": bonus_record_id,
        "source_staff_id": staff["_id"],
        "beneficiary_staff_id": staff["_id"],
        "level": 0,
        "type": "bonus",
        "amount": from_cents(amount_cents),
        "amount_cents": amount_cents,
        "rate": 0.0,
        "vip_level_at_time": int(staff.get("vip_level", 0) or 0),
        "currency": "PHP",
        "campaign_id": staff.get("campaign_id") or None,
        "status": "approved",
        "created_at": now,
    })
    await db.staff_users.update_one(
        {"_id": staff["_id"]},
        {"$inc": {
            "stats.total_commission": from_cents(amount_cents),
            "stats.total_commission_cents": amount_cents,
        }},
    )
