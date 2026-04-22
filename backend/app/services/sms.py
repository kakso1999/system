"""SMS provider abstraction. Current providers: 'demo' (no-op logs), 'huawei' (stub)."""

import logging
from typing import Any, Protocol

logger = logging.getLogger(__name__)


def _render_message(template: str, code: str, signature: str) -> str:
    try:
        return template.format(signature=signature, code=code) if template else f"[{signature}] OTP {code}"
    except Exception:
        return f"[{signature}] OTP {code}"


class SMSProvider(Protocol):
    async def send_otp(self, phone: str, code: str, template: str, signature: str) -> bool: ...


class DemoSMSProvider:
    """Logs the OTP instead of sending — used when sms_verification=False or credentials missing."""

    async def send_otp(self, phone: str, code: str, template: str, signature: str) -> bool:
        msg = _render_message(template, code, signature)
        logger.info("DEMO SMS to %s: %s", phone, msg)
        return True


class HuaweiSMSProvider:
    """Stub for Huawei Cloud SMS. Reads credentials at __init__ time."""

    def __init__(self, api_url: str, app_key: str, app_secret: str, extend: str = ""):
        self.api_url = api_url
        self.app_key = app_key
        self.app_secret = app_secret
        self.extend = extend

    async def send_otp(self, phone: str, code: str, template: str, signature: str) -> bool:
        logger.info("[HUAWEI STUB] would send %s to %s via %s", code, phone, self.api_url)
        return True


async def build_provider(db: Any) -> SMSProvider:
    async def get(key: str, default: Any = "") -> Any:
        doc = await db.system_settings.find_one({"key": key})
        return doc["value"] if doc else default

    enabled = await get("sms_verification", False)
    if not enabled:
        return DemoSMSProvider()

    api_url = await get("sms_api_url", "")
    app_key = await get("sms_appkey", "")
    app_secret = await get("sms_appsecret", "")
    if not (api_url and app_key and app_secret):
        logger.warning("sms_verification=True but credentials missing; falling back to demo")
        return DemoSMSProvider()

    return HuaweiSMSProvider(
        api_url,
        app_key,
        app_secret,
        extend=await get("sms_extend", ""),
    )
