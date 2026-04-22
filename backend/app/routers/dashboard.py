import asyncio
from datetime import datetime, timezone

from bson import ObjectId
from fastapi import APIRouter, Depends, HTTPException
from motor.motor_asyncio import AsyncIOMotorDatabase
from app.database import get_db
from app.dependencies import get_current_admin
from app.utils.datetime import get_day_start_utc
from app.utils.money import from_cents

router = APIRouter(dependencies=[Depends(get_current_admin)])


def parse_object_id(value: str, field_name: str) -> ObjectId:
    if not ObjectId.is_valid(value):
        raise HTTPException(status_code=400, detail=f"Invalid {field_name}")
    return ObjectId(value)


def empty_reward_totals() -> dict:
    return {
        "claims_total": 0,
        "claims_today": 0,
        "claims_onsite": 0,
        "claims_website": 0,
        "claims_settled": 0,
        "claims_pending": 0,
        "reward_codes_total": 0,
        "reward_codes_unused": 0,
        "reward_codes_assigned": 0,
        "reward_codes_redeemed": 0,
        "redeem_rate": 0.0,
        "commission_paid_cents": 0,
        "commission_approved_cents": 0,
    }


async def build_claim_stats(db: AsyncIOMotorDatabase, cid: ObjectId, day_start: datetime) -> dict:
    base = {"campaign_id": cid, "status": "success"}
    total, today, onsite, website, settled, pending = await asyncio.gather(
        db.claims.count_documents(base),
        db.claims.count_documents({**base, "created_at": {"$gte": day_start}}),
        db.claims.count_documents({**base, "prize_type": "onsite"}),
        db.claims.count_documents({**base, "prize_type": "website"}),
        db.claims.count_documents({**base, "settlement_status": "paid"}),
        db.claims.count_documents({
            **base,
            "$or": [
                {"settlement_status": {"$in": ["unpaid", "pending_redeem"]}},
                {"settlement_status": {"$exists": False}},
            ],
        }),
    )
    return {
        "claims_total": total,
        "claims_today": today,
        "claims_onsite": onsite,
        "claims_website": website,
        "claims_settled": settled,
        "claims_pending": pending,
    }


async def build_reward_code_stats(db: AsyncIOMotorDatabase, cid: ObjectId) -> dict:
    total, unused, assigned, redeemed = await asyncio.gather(
        db.reward_codes.count_documents({"campaign_id": cid}),
        db.reward_codes.count_documents({"campaign_id": cid, "status": "unused"}),
        db.reward_codes.count_documents({"campaign_id": cid, "status": "assigned"}),
        db.reward_codes.count_documents({"campaign_id": cid, "status": "redeemed"}),
    )
    return {
        "reward_codes_total": total,
        "reward_codes_unused": unused,
        "reward_codes_assigned": assigned,
        "reward_codes_redeemed": redeemed,
    }


async def sum_commission_cents(db: AsyncIOMotorDatabase, cid: ObjectId, status_: str) -> int:
    pipe = [{"$match": {"campaign_id": cid, "status": status_}},
            {"$group": {"_id": None, "t": {"$sum": "$amount_cents"}}}]
    res = await db.commission_logs.aggregate(pipe).to_list(length=1)
    return int(res[0]["t"]) if res else 0


async def build_reward_campaign_item(db: AsyncIOMotorDatabase, campaign: dict, day_start: datetime) -> dict:
    cid = campaign["_id"]
    claim_stats, reward_code_stats, commission_paid_cents, commission_approved_cents = await asyncio.gather(
        build_claim_stats(db, cid, day_start),
        build_reward_code_stats(db, cid),
        sum_commission_cents(db, cid, "paid"),
        sum_commission_cents(db, cid, "approved"),
    )
    assigned = reward_code_stats["reward_codes_assigned"]
    redeemed = reward_code_stats["reward_codes_redeemed"]
    denominator = assigned + redeemed
    return {
        "id": str(cid),
        "name": campaign.get("name", ""),
        "status": campaign.get("status", "draft"),
        **claim_stats,
        **reward_code_stats,
        "redeem_rate": (redeemed / denominator) if denominator else 0.0,
        "commission_paid_cents": commission_paid_cents,
        "commission_approved_cents": commission_approved_cents,
    }


def build_reward_totals(campaigns: list[dict]) -> dict:
    totals = empty_reward_totals()
    for campaign in campaigns:
        for key in totals:
            if key != "redeem_rate":
                totals[key] += campaign[key]
    denominator = totals["reward_codes_assigned"] + totals["reward_codes_redeemed"]
    totals["redeem_rate"] = (totals["reward_codes_redeemed"] / denominator) if denominator else 0.0
    return totals


@router.get("/")
async def get_dashboard(db: AsyncIOMotorDatabase = Depends(get_db)):
    today_start = get_day_start_utc()

    today_scans = await db.scan_logs.count_documents({"created_at": {"$gte": today_start}})
    today_valid = await db.claims.count_documents({"status": "success", "created_at": {"$gte": today_start}})
    today_staff = await db.staff_users.count_documents({"created_at": {"$gte": today_start}})
    total_scans = await db.scan_logs.count_documents({})
    total_valid = await db.claims.count_documents({"status": "success"})
    total_staff = await db.staff_users.count_documents({})

    pipeline = [{"$match": {"status": {"$in": ["pending", "approved", "paid"]}}},
                {"$group": {"_id": None, "total": {"$sum": "$amount_cents"}}}]
    agg = await db.commission_logs.aggregate(pipeline).to_list(length=1)
    total_commission_cents = int(agg[0]["total"]) if agg else 0
    total_commission = from_cents(total_commission_cents)

    return {
        "today_scans": today_scans,
        "today_valid": today_valid,
        "today_staff": today_staff,
        "total_scans": total_scans,
        "total_valid": total_valid,
        "total_staff": total_staff,
        "total_commission": total_commission,
    }


@router.get("/reward-overview")
async def reward_overview(
    campaign_id: str | None = None,
    db: AsyncIOMotorDatabase = Depends(get_db),
):
    day_start = datetime.now(timezone.utc).replace(hour=0, minute=0, second=0, microsecond=0)
    query = {"_id": parse_object_id(campaign_id, "campaign_id")} if campaign_id else {}
    campaigns = await db.campaigns.find(query).sort("created_at", -1).to_list(length=None)
    if campaign_id and not campaigns:
        raise HTTPException(status_code=404, detail="Campaign not found")
    items = await asyncio.gather(*(build_reward_campaign_item(db, campaign, day_start) for campaign in campaigns))
    return {"campaigns": items, "totals": build_reward_totals(list(items))}
