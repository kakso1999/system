from __future__ import annotations

from typing import Literal

from pydantic import BaseModel, ConfigDict, Field


class ManualCommissionCreate(BaseModel):
    model_config = ConfigDict(extra="forbid")

    beneficiary_staff_id: str
    amount: float = Field(..., gt=0)
    level: Literal[0, 1, 2, 3]
    claim_id: str | None = None
    source_staff_id: str | None = None
    campaign_id: str | None = None
    remark: str


class ManualCommissionAdjust(BaseModel):
    model_config = ConfigDict(extra="forbid")

    new_amount: float = Field(..., gt=0)
    remark: str


class ManualCommissionCancel(BaseModel):
    model_config = ConfigDict(extra="forbid")

    remark: str
