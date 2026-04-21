from datetime import datetime, timezone
import secrets
import time

from pymongo.errors import DuplicateKeyError

from app.utils.money import apply_rate_cents, from_cents, read_cents, to_cents


async def get_setting(db, key: str, default=None):
    doc = await db.system_settings.find_one({"key": key})
    return doc["value"] if doc else default


def generate_commission_no() -> str:
    return f"CM{time.time_ns()}{secrets.randbelow(1000):03d}"


async def create_commission_log(
    db,
    *,
    claim_id,
    source_staff_id,
    beneficiary_staff_id,
    level: int,
    amount_cents: int,
    rate: float,
    vip_level: int,
    campaign_id,
):
    now = datetime.now(timezone.utc)
    amount_cents = int(amount_cents)
    log = {
        "commission_no": generate_commission_no(),
        "claim_id": claim_id,
        "source_staff_id": source_staff_id,
        "beneficiary_staff_id": beneficiary_staff_id,
        "level": level,
        "type": "direct",
        "amount": from_cents(amount_cents),
        "amount_cents": amount_cents,
        "rate": rate,
        "vip_level_at_time": vip_level,
        "currency": "PHP",
        "campaign_id": campaign_id,
        "status": "approved",
        "created_at": now,
    }
    try:
        await db.commission_logs.insert_one(log)
    except DuplicateKeyError:
        return
    await db.staff_users.update_one(
        {"_id": beneficiary_staff_id},
        {"$inc": {
            "stats.total_commission": from_cents(amount_cents),
            "stats.total_commission_cents": amount_cents,
        }},
    )


async def calculate_commissions(db, staff_doc, claim_id, campaign_id):
    vip_level = int(staff_doc.get("vip_level", 0))
    level1_key = {
        0: "commission_level1_default",
        1: "commission_vip1",
        2: "commission_vip2",
        3: "commission_vip3",
        4: "commission_svip",
    }.get(vip_level, "commission_svip")
    level1_rate = float(await get_setting(db, level1_key, 1.0))
    level1_cents = to_cents(level1_rate)
    await create_commission_log(
        db,
        claim_id=claim_id,
        source_staff_id=staff_doc["_id"],
        beneficiary_staff_id=staff_doc["_id"],
        level=1,
        amount_cents=level1_cents,
        rate=level1_rate,
        vip_level=vip_level,
        campaign_id=campaign_id,
    )

    relation1 = await db.staff_relations.find_one({"staff_id": staff_doc["_id"], "level": 1})
    if relation1:
        rate = float(await get_setting(db, "commission_level2", 0.3))
        ancestor = await db.staff_users.find_one({"_id": relation1["ancestor_id"]}, {"vip_level": 1})
        if ancestor:
            await create_commission_log(
                db,
                claim_id=claim_id,
                source_staff_id=staff_doc["_id"],
                beneficiary_staff_id=relation1["ancestor_id"],
                level=2,
                amount_cents=to_cents(rate),
                rate=rate,
                vip_level=int(ancestor.get("vip_level", 0)),
                campaign_id=campaign_id,
            )

    relation2 = await db.staff_relations.find_one({"staff_id": staff_doc["_id"], "level": 2})
    if relation2:
        rate = float(await get_setting(db, "commission_level3", 0.1))
        ancestor = await db.staff_users.find_one({"_id": relation2["ancestor_id"]}, {"vip_level": 1})
        if ancestor:
            await create_commission_log(
                db,
                claim_id=claim_id,
                source_staff_id=staff_doc["_id"],
                beneficiary_staff_id=relation2["ancestor_id"],
                level=3,
                amount_cents=to_cents(rate),
                rate=rate,
                vip_level=int(ancestor.get("vip_level", 0)),
                campaign_id=campaign_id,
            )

    total_cents = 0
    async for log in db.commission_logs.find({"claim_id": claim_id}):
        total_cents += read_cents(log)
    await db.claims.update_one(
        {"_id": claim_id},
        {"$set": {
            "commission_amount": from_cents(total_cents),
            "commission_amount_cents": total_cents,
        }},
    )
