"""One-shot migration: float PHP amounts → integer cents.

Idempotent: re-running is safe; existing *_cents fields are not overwritten
unless --force is passed. Preserves legacy fields for rollback.

Usage:
    python -m backend.scripts.migrate_money_to_cents --dry-run
    python -m backend.scripts.migrate_money_to_cents
    python -m backend.scripts.migrate_money_to_cents --force  (recompute even if cents exists)
"""
from __future__ import annotations

import argparse
import asyncio
import sys
from pathlib import Path

# Ensure `app` is importable when run as a script from repo root.
sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from app.database import connect_db, close_db, get_db  # noqa: E402
from app.utils.money import to_cents  # noqa: E402


TARGETS: list[tuple[str, str, str]] = [
    # (collection, legacy_key, cents_key)
    ("commission_logs", "amount", "amount_cents"),
    ("claims", "commission_amount", "commission_amount_cents"),
    ("bonus_claim_records", "amount", "amount_cents"),
    ("daily_bonus_settlements", "total_bonus", "total_bonus_cents"),
    ("team_rewards", "amount", "amount_cents"),
    ("withdrawal_requests", "amount", "amount_cents"),
    ("finance_action_logs", "amount_change", "amount_change_cents"),
]


async def migrate_collection(
    db,
    collection: str,
    legacy_key: str,
    cents_key: str,
    *,
    dry_run: bool,
    force: bool,
) -> dict:
    query: dict = {legacy_key: {"$type": "number"}}
    if not force:
        query[cents_key] = {"$exists": False}
    total = await db[collection].count_documents(query)
    migrated = 0
    async for doc in db[collection].find(query):
        cents = to_cents(doc.get(legacy_key))
        print(f"  [{collection}] _id={doc['_id']} {legacy_key}={doc.get(legacy_key)!r} -> {cents_key}={cents}")
        if not dry_run:
            await db[collection].update_one(
                {"_id": doc["_id"]},
                {"$set": {cents_key: cents}},
            )
        migrated += 1
    return {"collection": collection, "scanned": total, "migrated": migrated}


async def migrate_staff_stats(db, *, dry_run: bool, force: bool) -> dict:
    query: dict = {"stats.total_commission": {"$type": "number"}}
    if not force:
        query["stats.total_commission_cents"] = {"$exists": False}
    total = await db.staff_users.count_documents(query)
    migrated = 0
    async for doc in db.staff_users.find(query, {"stats.total_commission": 1}):
        legacy = (doc.get("stats") or {}).get("total_commission", 0)
        cents = to_cents(legacy)
        print(f"  [staff_users] _id={doc['_id']} stats.total_commission={legacy!r} -> ...commission_cents={cents}")
        if not dry_run:
            await db.staff_users.update_one(
                {"_id": doc["_id"]},
                {"$set": {"stats.total_commission_cents": cents}},
            )
        migrated += 1
    return {"collection": "staff_users.stats", "scanned": total, "migrated": migrated}


async def migrate_bonus_tiers(db, *, dry_run: bool, force: bool) -> dict:
    query: dict = {"tiers.amount": {"$type": "number"}}
    total = await db.staff_bonus_rules.count_documents(query)
    migrated = 0
    async for doc in db.staff_bonus_rules.find(query):
        new_tiers = []
        changed = False
        for tier in doc.get("tiers", []):
            if not isinstance(tier, dict):
                new_tiers.append(tier)
                continue
            cents_present = "amount_cents" in tier
            if cents_present and not force:
                new_tiers.append(tier)
                continue
            updated = dict(tier)
            updated["amount_cents"] = to_cents(tier.get("amount"))
            new_tiers.append(updated)
            changed = True
        if changed:
            print(f"  [staff_bonus_rules] _id={doc['_id']} updated {len(new_tiers)} tier(s)")
            if not dry_run:
                await db.staff_bonus_rules.update_one(
                    {"_id": doc["_id"]},
                    {"$set": {"tiers": new_tiers}},
                )
            migrated += 1
    return {"collection": "staff_bonus_rules.tiers", "scanned": total, "migrated": migrated}


async def verify(db) -> list[dict]:
    report: list[dict] = []
    for collection, legacy_key, cents_key in TARGETS:
        pending = await db[collection].count_documents({
            legacy_key: {"$type": "number"},
            cents_key: {"$exists": False},
        })
        report.append({"collection": collection, "still_missing_cents": pending})
    staff_pending = await db.staff_users.count_documents({
        "stats.total_commission": {"$type": "number"},
        "stats.total_commission_cents": {"$exists": False},
    })
    report.append({"collection": "staff_users.stats", "still_missing_cents": staff_pending})
    tiers_pending = await db.staff_bonus_rules.count_documents({
        "tiers": {"$elemMatch": {"amount": {"$type": "number"}, "amount_cents": {"$exists": False}}},
    })
    report.append({"collection": "staff_bonus_rules.tiers", "still_missing_cents": tiers_pending})
    return report


async def main(argv: list[str]) -> int:
    parser = argparse.ArgumentParser(description="Migrate float money -> integer cents.")
    parser.add_argument("--dry-run", action="store_true", help="Print planned changes; do not write.")
    parser.add_argument("--force", action="store_true", help="Recompute cents even when field already exists.")
    args = parser.parse_args(argv)

    await connect_db()
    db = get_db()
    try:
        print("=== Migration plan ===")
        results: list[dict] = []
        for collection, legacy_key, cents_key in TARGETS:
            result = await migrate_collection(
                db, collection, legacy_key, cents_key,
                dry_run=args.dry_run, force=args.force,
            )
            results.append(result)
        results.append(await migrate_staff_stats(db, dry_run=args.dry_run, force=args.force))
        results.append(await migrate_bonus_tiers(db, dry_run=args.dry_run, force=args.force))

        print("\n=== Summary ===")
        for result in results:
            print(f"  {result['collection']}: scanned={result['scanned']} migrated={result['migrated']}")

        print("\n=== Verification ===")
        verification = await verify(db)
        for entry in verification:
            print(f"  {entry['collection']}: still_missing_cents={entry['still_missing_cents']}")

        if args.dry_run:
            print("\nDry run complete — no writes performed.")
        return 0
    finally:
        await close_db()


if __name__ == "__main__":
    sys.exit(asyncio.run(main(sys.argv[1:])))
