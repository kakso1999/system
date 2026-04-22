import hmac

from fastapi import Depends, Header, HTTPException, Request, status
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from motor.motor_asyncio import AsyncIOMotorDatabase
from bson import ObjectId
from bson.errors import InvalidId
from app.config import get_settings
from app.database import get_db
from app.utils.auth_cookies import access_cookie_name
from app.utils.security import decode_token
from app.utils.token_revocation import is_revoked

bearer_scheme = HTTPBearer(auto_error=False)


def get_subject_object_id(payload: dict | None) -> ObjectId:
    subject = (payload or {}).get("sub")
    if not isinstance(subject, str) or not subject:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid token")
    try:
        return ObjectId(subject)
    except (InvalidId, TypeError):
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid token")


def _extract_token(
    request: Request,
    role: str,
    credentials: HTTPAuthorizationCredentials | None,
) -> str | None:
    """Extract access JWT from cookie (preferred) or Authorization header.

    Bearer fallback is skipped when COOKIE_ONLY_AUTH=True so clients are
    forced onto cookie-based auth once the rollout is complete.
    """
    cookie_token = request.cookies.get(access_cookie_name(role))
    if cookie_token:
        return cookie_token
    if get_settings().COOKIE_ONLY_AUTH:
        return None
    return credentials.credentials if credentials else None


async def get_current_admin(
    request: Request,
    credentials: HTTPAuthorizationCredentials | None = Depends(bearer_scheme),
    db: AsyncIOMotorDatabase = Depends(get_db),
) -> dict:
    token = _extract_token(request, "admin", credentials)
    if not token:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Not authenticated")
    payload = decode_token(token)
    if not payload or payload.get("role") != "admin":
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid token")
    if await is_revoked(db, payload.get("jti")):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail={"code": "token_revoked"},
        )
    admin = await db.admins.find_one({"_id": get_subject_object_id(payload)})
    if not admin:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Admin not found")
    if admin.get("status") == "disabled":
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Account disabled")
    return admin


async def get_current_staff(
    request: Request,
    credentials: HTTPAuthorizationCredentials | None = Depends(bearer_scheme),
    db: AsyncIOMotorDatabase = Depends(get_db),
) -> dict:
    token = _extract_token(request, "staff", credentials)
    if not token:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Not authenticated")
    payload = decode_token(token)
    if not payload or payload.get("role") != "staff":
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid token")
    if await is_revoked(db, payload.get("jti")):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail={"code": "token_revoked"},
        )
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
