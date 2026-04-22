"""SMS provider abstraction.

Providers:
- DemoSMSProvider: logs the OTP, used for dev / when sms_real_send_enabled=False
- HttpApiSMSProvider: real HTTP API (MD5-signed), matches the 162_1 reference
  endpoint http://101.44.162.101:9090/sms/batch/v1

Settings (system_settings) consumed by build_provider():
  sms_verification          bool  master switch (verified in router)
  sms_real_send_enabled     bool  if False -> DemoSMSProvider even when verification=True
  sms_api_url               str   full POST URL
  sms_appkey                str
  sms_appcode               str
  sms_appsecret             str
  sms_extend                str   optional
"""

from __future__ import annotations

import asyncio
import hashlib
import json
import logging
import time
from typing import Any, Protocol
from urllib.error import URLError
from urllib.request import Request, urlopen

logger = logging.getLogger(__name__)


def _render_message(template: str, code: str, signature: str) -> str:
    try:
        return template.format(signature=signature, code=code) if template else f"[{signature}] OTP {code}"
    except Exception:
        return f"[{signature}] OTP {code}"


class SMSProvider(Protocol):
    async def send_otp(self, phone: str, code: str, template: str, signature: str) -> bool: ...


class DemoSMSProvider:
    """Logs the OTP instead of sending — used when sms_real_send_enabled=False."""

    async def send_otp(self, phone: str, code: str, template: str, signature: str) -> bool:
        msg = _render_message(template, code, signature)
        logger.info("DEMO SMS to %s: %s", phone, msg)
        return True


class HttpApiSMSProvider:
    """Custom HTTP API provider (MD5 signature). Mirrors the 162_1 integration.

    Signature: md5(appkey + appsecret + timestamp_ms).
    Request body (JSON POST):
        {appkey, appcode, sign, phone, msg, timestamp, extend?}
    Success criterion: response JSON contains code == "00000".
    """

    def __init__(self, api_url: str, appkey: str, appcode: str, appsecret: str, extend: str = "", timeout: int = 15):
        self.api_url = api_url
        self.appkey = appkey
        self.appcode = appcode
        self.appsecret = appsecret
        self.extend = extend
        self.timeout = timeout

    def _send_sync(self, phone: str, msg: str) -> tuple[bool, str]:
        timestamp = str(int(time.time() * 1000))
        sign = hashlib.md5(f"{self.appkey}{self.appsecret}{timestamp}".encode("utf-8")).hexdigest()
        payload: dict[str, Any] = {
            "appkey": self.appkey,
            "appcode": self.appcode,
            "sign": sign,
            "phone": phone,
            "msg": msg,
            "timestamp": timestamp,
        }
        if self.extend:
            payload["extend"] = self.extend
        try:
            req = Request(
                self.api_url,
                data=json.dumps(payload).encode("utf-8"),
                headers={"Content-Type": "application/json"},
                method="POST",
            )
            with urlopen(req, timeout=self.timeout) as resp:
                body = resp.read().decode("utf-8", errors="ignore")
            parsed = json.loads(body) if body else {}
            if parsed.get("code") == "00000":
                return True, "ok"
            return False, str(parsed.get("desc") or parsed.get("message") or body or "sms_send_failed")
        except URLError as e:
            return False, f"sms_network_error: {e}"
        except Exception as e:
            return False, f"sms_exception: {e}"

    async def send_otp(self, phone: str, code: str, template: str, signature: str) -> bool:
        msg = _render_message(template, code, signature)
        # urllib is blocking; offload to thread to avoid stalling the event loop.
        ok, detail = await asyncio.to_thread(self._send_sync, phone, msg)
        if ok:
            logger.info("SMS OK to %s (masked %s***)", phone[:3] + "***" + phone[-2:], code[:1])
        else:
            logger.warning("SMS FAIL to %s: %s", phone, detail)
        return ok


async def _get(db: Any, key: str, default: Any = "") -> Any:
    doc = await db.system_settings.find_one({"key": key})
    return doc["value"] if doc and "value" in doc else default


async def build_provider(db: Any) -> SMSProvider:
    """Select provider based on system_settings.

    Returns DemoSMSProvider unless:
      sms_verification=True AND sms_real_send_enabled=True AND all credentials present.
    """
    verification = bool(await _get(db, "sms_verification", False))
    real_send = bool(await _get(db, "sms_real_send_enabled", False))
    if not (verification and real_send):
        return DemoSMSProvider()

    api_url = str(await _get(db, "sms_api_url", "") or "").strip()
    appkey = str(await _get(db, "sms_appkey", "") or "").strip()
    appcode = str(await _get(db, "sms_appcode", "") or "").strip()
    appsecret = str(await _get(db, "sms_appsecret", "") or "").strip()
    extend = str(await _get(db, "sms_extend", "") or "").strip()

    if not all([api_url, appkey, appcode, appsecret]):
        logger.warning("sms_real_send_enabled=True but credentials incomplete; falling back to demo")
        return DemoSMSProvider()

    return HttpApiSMSProvider(api_url, appkey, appcode, appsecret, extend=extend)
