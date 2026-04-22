from __future__ import annotations

from collections.abc import AsyncIterable, Callable, Sequence
from dataclasses import dataclass
from datetime import datetime, timedelta, timezone

from bson import ObjectId
from fastapi import APIRouter, Depends, HTTPException
from motor.motor_asyncio import AsyncIOMotorDatabase

from app.database import get_db
from app.dependencies import get_current_admin
from app.utils.csv_export import csv_stream
from app.utils.money import from_cents, read_cents
from app.utils.xlsx_export import xlsx_stream

router = APIRouter(dependencies=[Depends(get_current_admin)])

RowStream = AsyncIterable[Sequence[object]]


@dataclass(frozen=True)
class ReportSpec:
    headers: list[str]
    sheet_name: str
    rows: Callable[[AsyncIOMotorDatabase], RowStream]


def as_object_id(value: object) -> ObjectId | None:
    if isinstance(value, ObjectId):
        return value
    if isinstance(value, str) and ObjectId.is_valid(value):
        return ObjectId(value)
    return None


def as_str(value: object) -> str:
    return "" if value in (None, "") else str(value)


def iso_utc(value: object) -> str:
    if not isinstance(value, datetime):
        return ""
    if value.tzinfo is None:
        value = value.replace(tzinfo=timezone.utc)
    return value.astimezone(timezone.utc).isoformat()


def batch_amount(doc: dict) -> float:
    cents = doc.get("total_amount_cents")
    if cents is not None:
        return from_cents(int(cents))
    return from_cents(read_cents(doc, cents_key="total_commission_cents", legacy_key="total_commission"))


async def get_staff_meta(db, cache: dict[str, dict[str, str]], staff_id: object) -> dict[str, str]:
    key = as_str(staff_id)
    if not key:
        return {"name": "", "staff_no": ""}
    if key not in cache:
        doc = await db.staff_users.find_one({"_id": as_object_id(staff_id)}, {"name": 1, "staff_no": 1})
        cache[key] = {"name": (doc or {}).get("name", ""), "staff_no": (doc or {}).get("staff_no", "")}
    return cache[key]


async def get_admin_name(db, cache: dict[str, str], admin_id: object) -> str:
    key = as_str(admin_id)
    if not key:
        return ""
    if key not in cache:
        doc = await db.admins.find_one({"_id": as_object_id(admin_id)}, {"username": 1})
        cache[key] = (doc or {}).get("username", "")
    return cache[key]


async def get_claim_summary(db, cache: dict[str, dict[str, int]], claim_id: object) -> dict[str, int]:
    key = as_str(claim_id)
    if not key:
        return {"claim_cents": 0, "log_cents": 0, "paid_count": 0}
    if key not in cache:
        oid = as_object_id(claim_id)
        claim = await db.claims.find_one({"_id": oid}, {"commission_amount_cents": 1, "commission_amount": 1})
        pipeline = [
            {"$match": {"claim_id": oid}},
            {"$group": {"_id": None, "log_cents": {"$sum": "$amount_cents"}, "paid_count": {"$sum": {"$cond": [{"$eq": ["$status", "paid"]}, 1, 0]}}}},
        ]
        result = await db.commission_logs.aggregate(pipeline).to_list(length=1)
        item = result[0] if result else {}
        cache[key] = {
            "claim_cents": read_cents(claim, cents_key="commission_amount_cents", legacy_key="commission_amount"),
            "log_cents": int(item.get("log_cents") or 0),
            "paid_count": int(item.get("paid_count") or 0),
        }
    return cache[key]


def reward_code_rows(db: AsyncIOMotorDatabase) -> RowStream:
    cursor = db.reward_codes.find({}, {"code": 1, "campaign_id": 1, "wheel_item_id": 1, "status": 1, "assigned_phone": 1, "phone": 1, "assigned_at": 1, "redeemed_at": 1, "source_staff_id": 1, "staff_id": 1, "created_at": 1, "updated_at": 1}).sort("created_at", -1)

    async def gen():
        async for doc in cursor:
            assigned_at = doc.get("assigned_at") or (doc.get("created_at") if doc.get("assigned_phone") or doc.get("phone") or doc.get("staff_id") else None)
            yield [doc.get("code", ""), as_str(doc.get("campaign_id")), as_str(doc.get("wheel_item_id")), doc.get("status", ""), doc.get("assigned_phone") or doc.get("phone", ""), iso_utc(assigned_at), iso_utc(doc.get("redeemed_at")), as_str(doc.get("source_staff_id") or doc.get("staff_id")), iso_utc(doc.get("created_at"))]

    return gen()


def staff_rows(db: AsyncIOMotorDatabase) -> RowStream:
    cursor = db.staff_users.find({}, {"staff_no": 1, "name": 1, "phone": 1, "username": 1, "vip_level": 1, "status": 1, "created_at": 1, "stats.total_valid": 1, "stats.total_commission": 1, "stats.total_commission_cents": 1}).sort("created_at", -1)

    async def gen():
        async for doc in cursor:
            stats = doc.get("stats") or {}
            cents = stats.get("total_commission_cents")
            total_commission = from_cents(int(cents)) if cents is not None else float(stats.get("total_commission") or 0)
            yield [as_str(doc.get("_id")), doc.get("staff_no", ""), doc.get("name", ""), doc.get("phone", ""), doc.get("username", ""), int(doc.get("vip_level") or 0), doc.get("status", ""), iso_utc(doc.get("created_at")), int(stats.get("total_valid") or 0), total_commission]

    return gen()


def claim_rows(db: AsyncIOMotorDatabase) -> RowStream:
    cursor = db.claims.find({}, {"campaign_id": 1, "staff_id": 1, "phone": 1, "prize_type": 1, "status": 1, "settlement_status": 1, "reward_code": 1, "created_at": 1}).sort("created_at", -1)

    async def gen():
        async for doc in cursor:
            yield [as_str(doc.get("_id")), as_str(doc.get("campaign_id")), as_str(doc.get("staff_id")), doc.get("phone", ""), doc.get("prize_type", ""), doc.get("status", ""), doc.get("settlement_status", ""), doc.get("reward_code", ""), iso_utc(doc.get("created_at"))]

    return gen()


def commission_rows(db: AsyncIOMotorDatabase) -> RowStream:
    cursor = db.commission_logs.find({}, {"commission_no": 1, "claim_id": 1, "beneficiary_staff_id": 1, "source_staff_id": 1, "level": 1, "type": 1, "amount": 1, "amount_cents": 1, "status": 1, "created_at": 1, "paid_at": 1}).sort("created_at", -1)

    async def gen():
        async for doc in cursor:
            yield [doc.get("commission_no", ""), as_str(doc.get("claim_id")), as_str(doc.get("beneficiary_staff_id")), as_str(doc.get("source_staff_id")), doc.get("level", ""), doc.get("type", ""), from_cents(read_cents(doc)), doc.get("status", ""), iso_utc(doc.get("created_at")), iso_utc(doc.get("paid_at"))]

    return gen()


def withdrawal_rows(db: AsyncIOMotorDatabase) -> RowStream:
    cursor = db.withdrawal_requests.find({}, {"staff_id": 1, "amount": 1, "amount_cents": 1, "status": 1, "created_at": 1, "paid_at": 1}).sort("created_at", -1)

    async def gen():
        async for doc in cursor:
            yield [as_str(doc.get("_id")), as_str(doc.get("staff_id")), from_cents(read_cents(doc)), doc.get("status", ""), iso_utc(doc.get("created_at")), iso_utc(doc.get("paid_at"))]

    return gen()


def vip_upgrade_rows(db: AsyncIOMotorDatabase) -> RowStream:
    cursor = db.vip_upgrade_logs.find({}, {"staff_id": 1, "staff_name": 1, "from_level": 1, "to_level": 1, "reason": 1, "trigger": 1, "created_at": 1}).sort("created_at", -1)
    staff_cache: dict[str, dict[str, str]] = {}

    async def gen():
        async for doc in cursor:
            staff = await get_staff_meta(db, staff_cache, doc.get("staff_id"))
            yield [as_str(doc.get("staff_id")), doc.get("staff_name") or staff["name"], int(doc.get("from_level") or 0), int(doc.get("to_level") or 0), doc.get("reason") or doc.get("trigger", ""), iso_utc(doc.get("created_at"))]

    return gen()


def team_reward_rows(db: AsyncIOMotorDatabase) -> RowStream:
    cursor = db.team_rewards.find({}, {"staff_id": 1, "staff_name": 1, "milestone": 1, "threshold": 1, "amount": 1, "amount_cents": 1, "team_total": 1, "team_total_at_time": 1, "status": 1, "created_at": 1, "voided_at": 1}).sort("created_at", -1)
    staff_cache: dict[str, dict[str, str]] = {}

    async def gen():
        async for doc in cursor:
            staff = await get_staff_meta(db, staff_cache, doc.get("staff_id"))
            status = doc.get("status") or ("voided" if doc.get("voided_at") else "issued")
            amount = from_cents(read_cents(doc))
            yield [as_str(doc.get("staff_id")), doc.get("staff_name") or staff["name"], doc.get("milestone", ""), int(doc.get("threshold") or 0), amount, int(doc.get("team_total") or doc.get("team_total_at_time") or 0), status, iso_utc(doc.get("created_at")), iso_utc(doc.get("voided_at"))]

    return gen()


def risk_log_rows(db: AsyncIOMotorDatabase) -> RowStream:
    cursor = db.risk_logs.find({}, {"created_at": 1, "type": 1, "phone": 1, "ip": 1, "device_fingerprint": 1, "campaign_id": 1, "staff_id": 1, "reason": 1}).sort("created_at", -1)

    async def gen():
        async for doc in cursor:
            yield [iso_utc(doc.get("created_at")), doc.get("type", ""), doc.get("phone", ""), doc.get("ip", ""), doc.get("device_fingerprint", ""), as_str(doc.get("campaign_id")), as_str(doc.get("staff_id")), doc.get("reason", "")]

    return gen()


def staff_relation_rows(db: AsyncIOMotorDatabase) -> RowStream:
    cursor = db.staff_relations.find({}, {"staff_id": 1, "ancestor_id": 1, "level": 1, "created_at": 1}).sort("created_at", -1)
    staff_cache: dict[str, dict[str, str]] = {}

    async def gen():
        async for doc in cursor:
            staff = await get_staff_meta(db, staff_cache, doc.get("staff_id"))
            ancestor = await get_staff_meta(db, staff_cache, doc.get("ancestor_id"))
            yield [as_str(doc.get("staff_id")), staff["staff_no"], staff["name"], as_str(doc.get("ancestor_id")), ancestor["name"], int(doc.get("level") or 0), iso_utc(doc.get("created_at"))]

    return gen()


def settlement_batch_rows(db: AsyncIOMotorDatabase) -> RowStream:
    cursor = db.settlement_batches.find({}, {"batch_no": 1, "total_amount_cents": 1, "total_commission": 1, "total_commission_cents": 1, "count": 1, "staff_ids": 1, "status": 1, "created_at": 1, "completed_at": 1, "created_by": 1, "created_by_admin_id": 1, "admin_id": 1}).sort("created_at", -1)
    admin_cache: dict[str, str] = {}

    async def gen():
        async for doc in cursor:
            created_by = doc.get("created_by") or await get_admin_name(db, admin_cache, doc.get("admin_id") or doc.get("created_by_admin_id"))
            count = int(doc.get("count") or len(doc.get("staff_ids") or []))
            yield [doc.get("batch_no") or as_str(doc.get("_id")), batch_amount(doc), count, doc.get("status", ""), iso_utc(doc.get("created_at")), iso_utc(doc.get("completed_at")), created_by]

    return gen()


def reconciliation_rows(db: AsyncIOMotorDatabase) -> RowStream:
    cursor = db.commission_logs.find({}, {"commission_no": 1, "claim_id": 1, "beneficiary_staff_id": 1, "amount": 1, "amount_cents": 1, "status": 1, "settlement_batch_id": 1, "paid_at": 1, "created_at": 1}).sort("created_at", -1)
    cutoff = datetime.now(timezone.utc) - timedelta(days=7)
    claim_cache: dict[str, dict[str, int]] = {}
    staff_cache: dict[str, dict[str, str]] = {}

    async def gen():
        async for doc in cursor:
            created_at = doc.get("created_at")
            if isinstance(created_at, datetime) and created_at.tzinfo is None:
                created_at = created_at.replace(tzinfo=timezone.utc)
            claim = await get_claim_summary(db, claim_cache, doc.get("claim_id"))
            if doc.get("status") == "approved" and isinstance(created_at, datetime) and created_at <= cutoff:
                reason = "system_recorded_not_paid"
            elif doc.get("status") == "paid" and not doc.get("settlement_batch_id"):
                reason = "paid_without_flag"
            elif doc.get("claim_id") and claim["claim_cents"] != claim["log_cents"]:
                reason = "amount_mismatch"
            elif doc.get("claim_id") and claim["paid_count"] > 1:
                reason = "duplicate_payment"
            else:
                reason = "ok"
            staff = await get_staff_meta(db, staff_cache, doc.get("beneficiary_staff_id"))
            yield [as_str(doc.get("_id")), doc.get("commission_no", ""), as_str(doc.get("beneficiary_staff_id")), staff["name"], from_cents(read_cents(doc)), doc.get("status", ""), as_str(doc.get("settlement_batch_id")), iso_utc(doc.get("paid_at")), reason]

    return gen()


REPORTS = {
    "staff": ReportSpec(["id", "staff_no", "name", "phone", "username", "vip_level", "status", "created_at", "total_valid", "total_commission"], "Staff", staff_rows),
    "claims": ReportSpec(["id", "campaign_id", "staff_id", "phone", "prize_type", "status", "settlement_status", "reward_code", "created_at"], "Claims", claim_rows),
    "commissions": ReportSpec(["commission_no", "claim_id", "beneficiary", "source", "level", "type", "amount", "status", "created_at", "paid_at"], "Commissions", commission_rows),
    "withdrawals": ReportSpec(["id", "staff_id", "amount", "status", "created_at", "paid_at"], "Withdrawals", withdrawal_rows),
    "reward-codes": ReportSpec(["code", "campaign_id", "wheel_item_id", "status", "assigned_phone", "assigned_at", "redeemed_at", "source_staff_id", "created_at"], "RewardCodes", reward_code_rows),
    "vip-upgrades": ReportSpec(["staff_id", "staff_name", "from_level", "to_level", "reason", "created_at"], "VipUpgrades", vip_upgrade_rows),
    "team-rewards": ReportSpec(["staff_id", "staff_name", "milestone", "threshold", "amount", "team_total", "status", "created_at", "voided_at"], "TeamRewards", team_reward_rows),
    "risk-logs": ReportSpec(["created_at", "type", "phone", "ip", "device_fingerprint", "campaign_id", "staff_id", "reason"], "RiskLogs", risk_log_rows),
    "staff-relations": ReportSpec(["staff_id", "staff_no", "staff_name", "ancestor_id", "ancestor_name", "level", "created_at"], "StaffRelations", staff_relation_rows),
    "settlement-batches": ReportSpec(["batch_no", "total_amount", "count", "status", "created_at", "completed_at", "created_by"], "SettlementBatches", settlement_batch_rows),
    "reconciliation": ReportSpec(["commission_id", "commission_no", "beneficiary_staff_id", "staff_name", "amount", "status", "settlement_batch_id", "paid_at", "discrepancy_reason"], "Reconciliation", reconciliation_rows),
}


@router.get("/{name}.{fmt}")
async def export_report(name: str, fmt: str, db: AsyncIOMotorDatabase = Depends(get_db)):
    fmt = fmt.lower()
    spec = REPORTS.get(name)
    if not spec:
        raise HTTPException(status_code=404, detail="Report not found")
    if fmt == "csv":
        return csv_stream(spec.rows(db), spec.headers, f"{name}.csv")
    if fmt == "xlsx":
        return await xlsx_stream(spec.rows(db), spec.headers, f"{name}.xlsx", spec.sheet_name)
    raise HTTPException(status_code=404, detail="Format not supported")
