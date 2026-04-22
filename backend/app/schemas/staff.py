from datetime import datetime, timedelta, timezone
from typing import Literal

from pydantic import BaseModel, ConfigDict, model_validator


StaffStatus = Literal["active", "disabled", "pending_review"]
STAFF_ONLINE_WINDOW = timedelta(minutes=5)


def _ensure_utc(value: datetime | None) -> datetime | None:
    if value is None:
        return None
    return value.astimezone(timezone.utc) if value.tzinfo else value.replace(tzinfo=timezone.utc)


def _is_online(last_seen_at: datetime | None) -> bool:
    return bool(last_seen_at and datetime.now(timezone.utc) - last_seen_at < STAFF_ONLINE_WINDOW)


class LoginRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")

    username: str
    password: str


class ChangePasswordRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")

    old_password: str
    new_password: str


class StaffRegisterRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")

    name: str
    phone: str
    username: str
    password: str
    invite_code: str | None = None


class StaffCreateRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")

    name: str
    phone: str
    username: str
    password: str
    campaign_id: str | None = None
    parent_id: str | None = None


class StaffUpdateRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")

    name: str | None = None
    phone: str | None = None
    status: StaffStatus | None = None
    campaign_id: str | None = None
    risk_frozen: bool | None = None
    daily_claim_limit: int | None = None
    daily_redeem_limit: int | None = None
    payout_method: str | None = None
    payout_account_name: str | None = None
    payout_account_number: str | None = None
    payout_notes: str | None = None
    can_generate_qr: bool | None = None
    can_use_signed_link: bool | None = None
    allow_static_link: bool | None = None
    must_start_work: bool | None = None


class StaffStatusUpdateRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")

    status: StaffStatus


class StaffResetPasswordRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")

    new_password: str


class WorkPauseRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")

    reason: str


class StaffStats(BaseModel):
    total_scans: int
    total_valid: int
    total_commission: float
    team_size: int
    level1_count: int
    level2_count: int
    level3_count: int


class StaffListItem(BaseModel):
    id: str
    staff_no: str
    name: str
    phone: str
    username: str
    status: StaffStatus
    vip_level: int
    qr_version: int = 0
    stats: StaffStats
    created_at: datetime
    work_status: str = "stopped"
    promotion_paused: bool = False
    pause_reason: str = ""
    paused_at: datetime | None = None
    resumed_at: datetime | None = None
    started_promoting_at: datetime | None = None
    stopped_promoting_at: datetime | None = None
    last_seen_at: datetime | None = None
    last_login_at: datetime | None = None
    is_online: bool = False

    @model_validator(mode="after")
    def populate_runtime_state(self):
        for field_name in (
            "created_at",
            "paused_at",
            "resumed_at",
            "started_promoting_at",
            "stopped_promoting_at",
            "last_seen_at",
            "last_login_at",
        ):
            setattr(self, field_name, _ensure_utc(getattr(self, field_name)))
        if hasattr(self, "last_logout_at"):
            self.last_logout_at = _ensure_utc(self.last_logout_at)
        self.is_online = _is_online(self.last_seen_at)
        return self


class StaffDetail(StaffListItem):
    invite_code: str
    parent_id: str | None = None
    campaign_id: str | None = None
    updated_at: datetime | None = None
    risk_frozen: bool = False
    daily_claim_limit: int = 0
    daily_redeem_limit: int = 0
    payout_method: str = ""
    payout_account_name: str = ""
    payout_account_number: str = ""
    payout_notes: str = ""
    can_generate_qr: bool = True
    can_use_signed_link: bool = True
    allow_static_link: bool = True
    must_start_work: bool = False
    last_logout_at: datetime | None = None
