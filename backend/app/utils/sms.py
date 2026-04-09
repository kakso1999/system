import json
import logging
from tencentcloud.common import credential
from tencentcloud.sms.v20210111 import sms_client, models
from app.config import get_settings

logger = logging.getLogger(__name__)


def send_sms(phone: str, code: str, minutes: str = "10") -> dict:
    """
    Send OTP via Tencent Cloud SMS.
    phone: E.164 format, e.g. "+639171234567"
    code: the OTP code string
    minutes: validity in minutes
    Returns: {"success": bool, "message": str}
    """
    settings = get_settings()

    if not settings.TENCENT_SECRET_ID or not settings.TENCENT_SMS_SDK_APP_ID:
        logger.warning("Tencent SMS not configured, skipping send")
        return {"success": False, "message": "SMS not configured"}

    try:
        cred = credential.Credential(settings.TENCENT_SECRET_ID, settings.TENCENT_SECRET_KEY)
        client = sms_client.SmsClient(cred, "ap-guangzhou")

        req = models.SendSmsRequest()
        # Phone must include + prefix
        if not phone.startswith("+"):
            phone = f"+{phone}"
        req.PhoneNumberSet = [phone]
        req.SmsSdkAppId = settings.TENCENT_SMS_SDK_APP_ID
        req.TemplateId = settings.TENCENT_SMS_TEMPLATE_ID
        req.TemplateParamSet = [code, minutes]
        # SignName is optional for international SMS
        if settings.TENCENT_SMS_SIGN_NAME:
            req.SignName = settings.TENCENT_SMS_SIGN_NAME

        resp = client.SendSms(req)
        result = json.loads(resp.to_json_string())
        status_set = result.get("SendStatusSet", [])

        if status_set and status_set[0].get("Code") == "Ok":
            logger.info(f"SMS sent to ***{phone[-4:]}: {status_set[0].get('SerialNo')}")
            return {"success": True, "message": "SMS sent"}
        else:
            err_msg = status_set[0].get("Message", "Unknown error") if status_set else "Empty response"
            logger.error(f"SMS failed for ***{phone[-4:]}: {err_msg}")
            return {"success": False, "message": err_msg}

    except Exception as e:
        logger.error(f"SMS exception for ***{phone[-4:]}: {e}")
        return {"success": False, "message": str(e)}
