from pydantic import BaseModel, Field
from typing import Any


class PageParams(BaseModel):
    page: int = Field(1, ge=1)
    page_size: int = Field(20, ge=1, le=100)


class PageResponse(BaseModel):
    items: list[Any]
    total: int
    page: int
    page_size: int
    pages: int


class MessageResponse(BaseModel):
    message: str


class TokenResponse(BaseModel):
    access_token: str
    refresh_token: str | None = None
    token_type: str = "bearer"
    role: str


class RefreshRequest(BaseModel):
    refresh_token: str
