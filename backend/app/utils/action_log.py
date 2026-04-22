from datetime import datetime, timezone

from motor.motor_asyncio import AsyncIOMotorDatabase


async def log_admin_action(
    db: AsyncIOMotorDatabase,
    admin_id,
    action: str,
    target_type: str,
    target_id=None,
    metadata: dict | None = None,
) -> None:
    try:
        await db.finance_action_logs.insert_one({
            "admin_id": admin_id,
            "action": action,
            "target_type": target_type,
            "target_id": target_id,
            "metadata": metadata or {},
            "created_at": datetime.now(timezone.utc),
        })
    except Exception:
        pass
