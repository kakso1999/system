import math
from datetime import datetime, timezone

from bson import ObjectId
from fastapi import HTTPException, status
from motor.motor_asyncio import AsyncIOMotorDatabase

from app.utils.helpers import to_str_id, to_str_ids
from app.utils.money import from_cents, read_cents, to_cents


async def sum_amount_cents(collection, match: dict) -> int:
    pipeline = [
        {"$match": match},
        {"$group": {"_id": None, "total": {"$sum": "$amount_cents"}}},
    ]
    result = await collection.aggregate(pipeline).to_list(length=1)
    if not result:
        return 0
    try:
        return int(result[0]["total"])
    except (TypeError, ValueError):
        return 0


async def sum_amount(collection, match: dict) -> float:
    return from_cents(await sum_amount_cents(collection, match))


async def get_withdrawal_balance_snapshot(
    db: AsyncIOMotorDatabase,
    staff_id: ObjectId,
) -> dict:
    total_approved_cents = await sum_amount_cents(
        db.commission_logs,
        {"beneficiary_staff_id": staff_id, "status": "approved"},
    )
    total_withdrawn_cents = await sum_amount_cents(
        db.withdrawal_requests,
        {"staff_id": staff_id, "status": {"$ne": "rejected"}},
    )
    pending_cents = await sum_amount_cents(
        db.withdrawal_requests,
        {"staff_id": staff_id, "status": "pending"},
    )
    available_cents = total_approved_cents - total_withdrawn_cents
    return {
        "total_approved": from_cents(total_approved_cents),
        "total_withdrawn": from_cents(total_withdrawn_cents),
        "available": from_cents(available_cents),
        "pending_withdrawals": from_cents(pending_cents),
    }


async def get_payout_account_or_404(
    db: AsyncIOMotorDatabase,
    staff_id: ObjectId,
    payout_account_id: ObjectId,
) -> dict:
    account = await db.staff_payout_accounts.find_one(
        {"_id": payout_account_id, "staff_id": staff_id}
    )
    if not account:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Payout account not found")
    return account


def generate_withdrawal_no(now: datetime) -> str:
    return f"WD{now.strftime('%Y%m%d%H%M%S%f')}"


def build_withdrawal_document(
    *,
    staff_id: ObjectId,
    amount_cents: int,
    payout_account: dict,
    now: datetime,
) -> dict:
    amount_cents = int(amount_cents)
    return {
        "withdrawal_no": generate_withdrawal_no(now),
        "staff_id": staff_id,
        "amount": from_cents(amount_cents),
        "amount_cents": amount_cents,
        "currency": "PHP",
        "payout_account_id": payout_account["_id"],
        "payout_account_type": payout_account.get("type", ""),
        "payout_account_name": payout_account.get("account_name", ""),
        "payout_account_number": payout_account.get("account_number", ""),
        "payout_bank_name": payout_account.get("bank_name", ""),
        "status": "pending",
        "reject_reason": None,
        "transaction_no": None,
        "remark": None,
        "created_at": now,
        "reviewed_at": None,
        "reviewed_by": None,
        "paid_at": None,
        "paid_by": None,
    }


async def create_withdrawal_request(
    db: AsyncIOMotorDatabase,
    *,
    staff_id: ObjectId,
    amount: float,
    payout_account: dict,
) -> dict:
    if not math.isfinite(amount) or amount <= 0:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Invalid withdrawal amount")
    amount_cents = to_cents(amount)
    snapshot_cents = {
        "available_cents": await sum_amount_cents(
            db.commission_logs,
            {"beneficiary_staff_id": staff_id, "status": "approved"},
        ) - await sum_amount_cents(
            db.withdrawal_requests,
            {"staff_id": staff_id, "status": {"$ne": "rejected"}},
        ),
    }
    if amount_cents > max(snapshot_cents["available_cents"], 0):
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Withdrawal amount exceeds available balance")
    now = datetime.now(timezone.utc)
    document = build_withdrawal_document(
        staff_id=staff_id,
        amount_cents=amount_cents,
        payout_account=payout_account,
        now=now,
    )
    result = await db.withdrawal_requests.insert_one(document)
    document["_id"] = result.inserted_id
    return document


async def attach_staff_metadata(
    db: AsyncIOMotorDatabase,
    items: list[dict],
) -> list[dict]:
    staff_ids = list({item["staff_id"] for item in items if item.get("staff_id")})
    if not staff_ids:
        return items
    staff_docs = await db.staff_users.find(
        {"_id": {"$in": staff_ids}},
        {"name": 1, "staff_no": 1, "phone": 1},
    ).to_list(length=len(staff_ids))
    staff_map = {doc["_id"]: doc for doc in staff_docs}
    enriched_items = []
    for item in items:
        enriched = dict(item)
        staff = staff_map.get(item.get("staff_id"))
        if staff:
            enriched["staff_name"] = staff.get("name", "")
            enriched["staff_no"] = staff.get("staff_no", "")
            enriched["staff_phone"] = staff.get("phone", "")
        enriched_items.append(enriched)
    return enriched_items


def serialize_withdrawal_item(doc: dict) -> dict:
    data = to_str_id(doc)
    data["amount"] = from_cents(read_cents(doc))
    data.pop("amount_cents", None)
    return data


async def fetch_withdrawal_page(
    db: AsyncIOMotorDatabase,
    *,
    query: dict,
    page: int,
    page_size: int,
    include_staff: bool,
) -> dict:
    cursor = db.withdrawal_requests.find(query).sort("created_at", -1).skip((page - 1) * page_size).limit(page_size)
    items = await cursor.to_list(length=page_size)
    if include_staff:
        items = await attach_staff_metadata(db, items)
    total = await db.withdrawal_requests.count_documents(query)
    return {
        "items": [serialize_withdrawal_item(item) for item in items],
        "total": total,
        "page": page,
        "page_size": page_size,
        "pages": math.ceil(total / page_size) if total else 0,
    }


async def get_withdrawal_or_404(
    db: AsyncIOMotorDatabase,
    request_id: ObjectId,
) -> dict:
    withdrawal = await db.withdrawal_requests.find_one({"_id": request_id})
    if not withdrawal:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Withdrawal request not found")
    return withdrawal


async def log_finance_action(
    db: AsyncIOMotorDatabase,
    *,
    admin: dict,
    action: str,
    target_type: str,
    target_id: ObjectId,
    old_status: str,
    new_status: str,
    amount: float,
    remark: str,
) -> None:
    cents = to_cents(amount)
    await db.finance_action_logs.insert_one({
        "operator": admin.get("username", "admin"),
        "action": action,
        "target_type": target_type,
        "target_id": target_id,
        "old_status": old_status,
        "new_status": new_status,
        "amount_change": from_cents(cents),
        "amount_change_cents": cents,
        "remark": remark,
        "created_at": datetime.now(timezone.utc),
    })
