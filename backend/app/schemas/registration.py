from datetime import datetime

from pydantic import BaseModel, ConfigDict, Field


class RegistrationApplicationResponse(BaseModel):
    model_config = ConfigDict(extra="forbid")

    id: str
    name: str
    phone: str
    username: str
    invite_code: str | None
    referrer_staff: dict | None
    status: str
    rejection_reason: str
    applied_at: datetime
    reviewed_at: datetime | None
    reviewed_by_admin_id: str | None
    approved_staff_id: str | None


class RegistrationApplicationListResponse(BaseModel):
    model_config = ConfigDict(extra="forbid")

    items: list[RegistrationApplicationResponse]
    total: int
    page: int
    page_size: int


class RejectRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")

    reason: str = Field(..., min_length=1)
