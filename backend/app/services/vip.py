from datetime import datetime, timezone


async def get_setting(db, key: str, default=None):
    doc = await db.system_settings.find_one({"key": key})
    return doc["value"] if doc else default


def resolve_vip_level(total_valid: int, thresholds: dict[str, int]) -> int:
    if total_valid >= thresholds["svip"]:
        return 4
    if total_valid >= thresholds["vip3"]:
        return 3
    if total_valid >= thresholds["vip2"]:
        return 2
    if total_valid >= thresholds["vip1"]:
        return 1
    return 0


async def check_vip_upgrade(db, staff_id):
    thresholds = {
        "vip1": int(await get_setting(db, "vip_threshold_1", 10)),
        "vip2": int(await get_setting(db, "vip_threshold_2", 100)),
        "vip3": int(await get_setting(db, "vip_threshold_3", 1000)),
        "svip": int(await get_setting(db, "vip_threshold_svip", 10000)),
    }
    staff = await db.staff_users.find_one({"_id": staff_id}, {"vip_level": 1, "stats.total_valid": 1})
    if not staff:
        return
    total_valid = int(staff.get("stats", {}).get("total_valid", 0))
    current_level = int(staff.get("vip_level", 0))
    new_level = resolve_vip_level(total_valid, thresholds)
    if new_level <= current_level:
        return
    now = datetime.now(timezone.utc)
    await db.staff_users.update_one({"_id": staff_id}, {"$set": {"vip_level": new_level}})
    await db.vip_upgrade_logs.insert_one({
        "staff_id": staff_id,
        "from_level": current_level,
        "to_level": new_level,
        "trigger": "auto",
        "total_valid_at_time": total_valid,
        "created_at": now,
    })
