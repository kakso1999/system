from datetime import datetime, timezone

from motor.motor_asyncio import AsyncIOMotorDatabase


async def is_revoked(db: AsyncIOMotorDatabase, jti: str | None) -> bool:
    if not jti:
        return False
    return bool(await db.revoked_tokens.find_one({"jti": jti}, {"_id": 1}))


async def revoke(db: AsyncIOMotorDatabase, jti: str | None, exp: int | float | None) -> None:
    if not jti:
        return
    expires_at = datetime.fromtimestamp(float(exp), tz=timezone.utc) if exp else datetime.now(timezone.utc)
    try:
        await db.revoked_tokens.insert_one({"jti": jti, "expires_at": expires_at})
    except Exception:
        pass
