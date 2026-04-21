from datetime import datetime

from pydantic import BaseModel, Field


class SponsorBase(BaseModel):
    name: str = Field(..., min_length=1, max_length=100)
    logo_url: str = Field(default="", max_length=500)
    link_url: str = Field(default="", max_length=500)
    enabled: bool = True
    sort_order: int = 0


class SponsorCreateRequest(SponsorBase):
    pass


class SponsorUpdateRequest(BaseModel):
    name: str | None = Field(default=None, min_length=1, max_length=100)
    logo_url: str | None = Field(default=None, max_length=500)
    link_url: str | None = Field(default=None, max_length=500)
    enabled: bool | None = None
    sort_order: int | None = None


class SponsorDetail(SponsorBase):
    id: str
    created_at: datetime
    updated_at: datetime | None = None


class SponsorPublic(BaseModel):
    """Public listing — excludes created_by / updated_at noise."""

    id: str
    name: str
    logo_url: str
    link_url: str
    sort_order: int
