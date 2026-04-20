import hmac

from fastapi import Depends, Header, HTTPException, status
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from motor.motor_asyncio import AsyncIOMotorDatabase
from bson import ObjectId
from bson.errors import InvalidId
from app.database import get_db
from app.utils.security import decode_token

bearer_scheme = HTTPBearer(auto_error=False)


def get_subject_object_id(payload: dict | None) -> ObjectId:
    subject = (payload or {}).get("sub")
    if not isinstance(subject, str) or not subject:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid token")
    try:
        return ObjectId(subject)
    except (InvalidId, TypeError):
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid token")


async def get_current_admin(
    credentials: HTTPAuthorizationCredentials | None = Depends(bearer_scheme),
    db: AsyncIOMotorDatabase = Depends(get_db),
) -> dict:
    if not credentials:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Not authenticated")
    payload = decode_token(credentials.credentials)
    if not payload or payload.get("role") != "admin":
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid token")
    admin = await db.admins.find_one({"_id": get_subject_object_id(payload)})
    if not admin:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Admin not found")
    if admin.get("status") == "disabled":
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Account disabled")
    return admin


async def get_current_staff(
    credentials: HTTPAuthorizationCredentials | None = Depends(bearer_scheme),
    db: AsyncIOMotorDatabase = Depends(get_db),
) -> dict:
    if not credentials:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Not authenticated")
    payload = decode_token(credentials.credentials)
    if not payload or payload.get("role") != "staff":
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid token")
    staff = await db.staff_users.find_one({"_id": get_subject_object_id(payload)})
    if not staff:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Staff not found")
    if staff.get("status") != "active":
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Account disabled")
    return staff


async def get_super_admin(
    admin: dict = Depends(get_current_admin),
) -> dict:
    if admin.get("role") != "super_admin":
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Super admin required")
    if admin.get("status") == "disabled":
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Account disabled")
    return admin


async def get_api_key(
    x_api_key: str | None = Header(None, alias="X-API-Key"),
    db: AsyncIOMotorDatabase = Depends(get_db),
) -> str:
    if x_api_key is None:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Missing X-API-Key")
    setting = await db.system_settings.find_one({"key": "external_api_key"})
    expected_key = setting.get("value") if setting else None
    if not isinstance(expected_key, str) or not expected_key or expected_key == "PLEASE_SET_API_KEY":
        raise HTTPException(status_code=status.HTTP_503_SERVICE_UNAVAILABLE, detail="external api key not configured")
    if not hmac.compare_digest(x_api_key, expected_key):
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Invalid X-API-Key")
    return x_api_key
