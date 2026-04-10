from datetime import datetime, timezone
from zoneinfo import ZoneInfo, ZoneInfoNotFoundError

from app.config import get_settings


def get_reporting_timezone():
    timezone_name = get_settings().REPORT_TIMEZONE.strip()
    try:
        return ZoneInfo(timezone_name)
    except ZoneInfoNotFoundError:
        return timezone.utc


def get_day_start_utc(reference: datetime | None = None) -> datetime:
    current_time = reference or datetime.now(timezone.utc)
    if current_time.tzinfo is None:
        current_time = current_time.replace(tzinfo=timezone.utc)
    local_time = current_time.astimezone(get_reporting_timezone())
    return local_time.replace(hour=0, minute=0, second=0, microsecond=0).astimezone(timezone.utc)
