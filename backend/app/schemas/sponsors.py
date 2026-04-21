from datetime import datetime
from urllib.parse import urlparse

from pydantic import BaseModel, Field, field_validator


class SponsorBase(BaseModel):
    name: str = Field(..., min_length=1, max_length=100)
    logo_url: str = Field(default="", max_length=500)
    link_url: str = Field(default="", max_length=500)
    enabled: bool = True
    sort_order: int = 0

    @field_validator("logo_url")
    @classmethod
    def _validate_logo_url(cls, v: str) -> str:
        if not v:
            return ""
        v = v.strip()
        if v.startswith("/uploads/"):
            return v
        parsed = urlparse(v)
        if parsed.scheme.lower() not in {"http", "https"}:
            raise ValueError("logo_url scheme must be http or https")
        if not parsed.netloc:
            raise ValueError("logo_url must include a host")
        return v

    @field_validator("link_url")
    @classmethod
    def _validate_link_url(cls, v: str) -> str:
        if not v:
            return ""
        v = v.strip()
        parsed = urlparse(v)
        if parsed.scheme.lower() not in {"http", "https"}:
            raise ValueError("link_url scheme must be http or https")
        if not parsed.netloc:
            raise ValueError("link_url must include a host")
        return v


class SponsorCreateRequest(SponsorBase):
    pass


class SponsorUpdateRequest(BaseModel):
    name: str | None = Field(default=None, min_length=1, max_length=100)
    logo_url: str | None = Field(default=None, max_length=500)
    link_url: str | None = Field(default=None, max_length=500)
    enabled: bool | None = None
    sort_order: int | None = None

    @field_validator("logo_url")
    @classmethod
    def _validate_logo_url(cls, v: str | None) -> str | None:
        if v is None:
            return None
        if not v:
            return ""
        v = v.strip()
        if v.startswith("/uploads/"):
            return v
        parsed = urlparse(v)
        if parsed.scheme.lower() not in {"http", "https"}:
            raise ValueError("logo_url scheme must be http or https")
        if not parsed.netloc:
            raise ValueError("logo_url must include a host")
        return v

    @field_validator("link_url")
    @classmethod
    def _validate_link_url(cls, v: str | None) -> str | None:
        if v is None:
            return None
        if not v:
            return ""
        v = v.strip()
        parsed = urlparse(v)
        if parsed.scheme.lower() not in {"http", "https"}:
            raise ValueError("link_url scheme must be http or https")
        if not parsed.netloc:
            raise ValueError("link_url must include a host")
        return v


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
