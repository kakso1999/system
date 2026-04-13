import asyncio
import hashlib
import json
import logging
from datetime import datetime, timezone
from urllib.request import Request, urlopen

logger = logging.getLogger(__name__)


async def get_sms_setting(db, key: str, default: str = "") -> str:
    doc = await db.system_settings.find_one({"key": key})
    if doc is None:
        return default
    val = doc.get("value", default)
    return str(val) if val is not None else default


def _build_sms_message(template: str, code: str, signature: str) -> str:
    try:
        return template.format(code=code, signature=signature)
    except Exception:
        return f"[{signature}] Your OTP code is {code}. Valid for 10 minutes."


def _do_send(api_url: str, payload: dict) -> dict:
    """Blocking HTTP POST — run in executor."""
    try:
        req = Request(
            api_url,
            data=json.dumps(payload).encode("utf-8"),
            headers={"Content-Type": "application/json"},
            method="POST",
        )
        with urlopen(req, timeout=15) as resp:
            body = resp.read().decode("utf-8", errors="ignore")
        parsed = json.loads(body) if body else {}
        if parsed.get("code") == "00000":
            return {"success": True, "message": "SMS sent"}
        err = parsed.get("desc") or parsed.get("message") or "Unknown error"
        return {"success": False, "message": err}
    except Exception as e:
        return {"success": False, "message": str(e)}


async def send_sms(db, phone: str, code: str, minutes: str = "10") -> dict:
    """
    Send OTP via custom HTTP SMS API.
    phone: E.164 format, e.g. "+639171234567"
    code: the OTP code string
    Returns: {"success": bool, "message": str}
    """
    api_url = (await get_sms_setting(db, "sms_api_url")).strip()
    appkey = (await get_sms_setting(db, "sms_appkey")).strip()
    appcode = (await get_sms_setting(db, "sms_appcode")).strip()
    appsecret = (await get_sms_setting(db, "sms_appsecret")).strip()
    extend = (await get_sms_setting(db, "sms_extend")).strip()
    signature = (await get_sms_setting(db, "sms_signature", "GroundRewards")).strip() or "GroundRewards"
    template = (await get_sms_setting(db, "sms_otp_template",
                "[{signature}] Your OTP code is {code}. Valid for 10 minutes.")).strip()

    if not all([api_url, appkey, appcode, appsecret]):
        logger.warning("SMS API not configured, skipping send")
        return {"success": False, "message": "SMS not configured"}

    if not phone.startswith("+"):
        phone = f"+{phone}"

    timestamp = str(int(datetime.now(timezone.utc).timestamp() * 1000))
    sign_src = f"{appkey}{appsecret}{timestamp}"
    sign = hashlib.md5(sign_src.encode("utf-8")).hexdigest()

    msg = _build_sms_message(template, code, signature)

    payload = {
        "appkey": appkey,
        "appcode": appcode,
        "sign": sign,
        "phone": phone,
        "msg": msg,
        "timestamp": timestamp,
    }
    if extend:
        payload["extend"] = extend

    loop = asyncio.get_event_loop()
    result = await loop.run_in_executor(None, _do_send, api_url, payload)

    if result["success"]:
        logger.info(f"SMS sent to ***{phone[-4:]}")
    else:
        logger.error(f"SMS failed for ***{phone[-4:]}: {result['message']}")

    return result
