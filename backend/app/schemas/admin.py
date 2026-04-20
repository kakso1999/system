from datetime import datetime
from typing import Literal

from pydantic import BaseModel, ConfigDict


AdminRole = Literal["admin", "super_admin"]
AdminStatus = Literal["active", "disabled"]


class AdminCreateRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")

    username: str
    password: str
    display_name: str
    role: AdminRole = "admin"
    status: AdminStatus = "active"
    must_change_password: bool = True


class AdminUpdateRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")

    display_name: str | None = None
    role: AdminRole | None = None


class AdminStatusRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")

    status: AdminStatus


class AdminResetPasswordRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")

    new_password: str


class AdminListItem(BaseModel):
    id: str
    username: str
    display_name: str
    role: AdminRole
    status: AdminStatus
    must_change_password: bool
    last_login_at: datetime | None = None
    created_at: datetime
    updated_at: datetime


class AdminListResponse(BaseModel):
    items: list[AdminListItem]
    total: int
    page: int
    page_size: int
    pages: int
