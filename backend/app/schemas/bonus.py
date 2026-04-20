from datetime import datetime
from typing import Literal

from pydantic import BaseModel, ConfigDict, Field, field_validator


BonusRecordStatus = Literal["claimed", "settled"]


class BonusTier(BaseModel):
    threshold: int = Field(..., gt=0)
    amount: float = Field(..., ge=0)


class BonusRuleUpsertRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")

    staff_id: str | None = None
    tiers: list[BonusTier]
    enabled: bool

    @field_validator("tiers")
    @classmethod
    def validate_tiers(cls, tiers: list[BonusTier]) -> list[BonusTier]:
        if not tiers:
            raise ValueError("tiers must not be empty")
        return tiers


class BonusRuleResponse(BaseModel):
    id: str
    staff_id: str | None = None
    staff_name: str | None = None
    tiers: list[BonusTier]
    enabled: bool
    created_at: datetime
    updated_at: datetime


class BonusRuleListResponse(BaseModel):
    items: list[BonusRuleResponse]
    global_default: BonusRuleResponse | None = None


class BonusClaimRecordResponse(BaseModel):
    id: str
    staff_id: str
    date: str
    tier_threshold: int
    amount: float
    valid_count_at_claim: int
    status: str
    created_at: datetime


class BonusClaimRecordListResponse(BaseModel):
    items: list[BonusClaimRecordResponse]
    total: int
    page: int
    page_size: int


class DailyBonusSettlementResponse(BaseModel):
    id: str
    staff_id: str
    date: str
    total_valid: int
    total_bonus: float
    created_at: datetime


class DailyBonusSettlementListResponse(BaseModel):
    items: list[DailyBonusSettlementResponse]
    total: int
    page: int
    page_size: int


class SuccessResponse(BaseModel):
    success: bool


class BonusTodayTier(BaseModel):
    threshold: int
    amount: float
    reached: bool
    claimed: bool
    claimable: bool


class BonusTodayResponse(BaseModel):
    date: str
    valid_count: int
    rule: dict | None
    tiers: list[BonusTodayTier]
    total_earned_today: float


class BonusClaimRequest(BaseModel):
    tier_threshold: int = Field(..., ge=1)


class BonusClaimResponse(BaseModel):
    id: str
    date: str
    tier_threshold: int
    amount: float
    valid_count_at_claim: int
    status: str
    created_at: datetime
