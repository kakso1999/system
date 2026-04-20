from bson import ObjectId
from motor.motor_asyncio import AsyncIOMotorDatabase


def sorted_tiers(tiers: list[dict]) -> list[dict]:
    normalized = [
        {
            "threshold": int(tier["threshold"]),
            "amount": float(tier["amount"]),
        }
        for tier in tiers
    ]
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
