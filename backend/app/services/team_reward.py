from datetime import datetime, timezone
import secrets
import time

from pymongo.errors import DuplicateKeyError


async def get_setting(db, key: str, default=None):
    doc = await db.system_settings.find_one({"key": key})
    return doc["value"] if doc else default


def generate_commission_no() -> str:
    return f"CM{time.time_ns()}{secrets.randbelow(1000):03d}"


async def get_team_total(db, staff_id) -> int:
    total = 0
    cursor = db.staff_relations.find({"ancestor_id": staff_id}, {"staff_id": 1})
    async for relation in cursor:
        member = await db.staff_users.find_one({"_id": relation["staff_id"]}, {"stats.total_valid": 1})
        total += int((member or {}).get("stats", {}).get("total_valid", 0))
    return total


async def award_team_reward(db, staff_doc, *, milestone: str, threshold: int, amount: float, team_total: int):
    now = datetime.now(timezone.utc)
    reward = {
        "staff_id": staff_doc["_id"],
        "milestone": milestone,
        "threshold": threshold,
        "amount": amount,
        "team_total_at_time": team_total,
        "currency": "PHP",
        "created_at": now,
    }
    try:
        await db.team_rewards.insert_one(reward)
    except DuplicateKeyError:
        return
    await db.commission_logs.insert_one({
        "commission_no": generate_commission_no(),
        "claim_id": None,
        "source_staff_id": staff_doc["_id"],
        "beneficiary_staff_id": staff_doc["_id"],
        "level": 0,
        "type": "team_reward",
        "amount": amount,
        "rate": amount,
        "vip_level_at_time": int(staff_doc.get("vip_level", 0)),
        "currency": "PHP",
        "campaign_id": staff_doc.get("campaign_id"),
        "status": "pending",
        "created_at": now,
    })
    await db.staff_users.update_one(
        {"_id": staff_doc["_id"]},
        {"$inc": {"stats.total_commission": amount}},
    )


async def check_team_rewards(db, staff_doc):
    own_total = int(staff_doc.get("stats", {}).get("total_valid", 0))
    team_total = own_total + await get_team_total(db, staff_doc["_id"])
    milestones = [
        ("team_reward_100", int(await get_setting(db, "team_reward_100_threshold", 100)), float(await get_setting(db, "team_reward_100", 300))),
        ("team_reward_1000", int(await get_setting(db, "team_reward_1000_threshold", 1000)), float(await get_setting(db, "team_reward_1000", 500))),
        ("team_reward_10000", int(await get_setting(db, "team_reward_10000_threshold", 10000)), float(await get_setting(db, "team_reward_10000", 1000))),
    ]
    for milestone, threshold, amount in milestones:
        if team_total >= threshold:
            await award_team_reward(
                db,
                staff_doc,
                milestone=milestone,
                threshold=threshold,
                amount=amount,
                team_total=team_total,
            )
