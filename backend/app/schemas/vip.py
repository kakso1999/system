from pydantic import BaseModel, ConfigDict, Field


class VipMemberUpdate(BaseModel):
    model_config = ConfigDict(extra="forbid")

    vip_level: int = Field(..., ge=0, le=4)
    remark: str | None = Field(default=None, max_length=500)


class VipThresholds(BaseModel):
    vip1: int
    vip2: int
    vip3: int
    svip: int


class VipLevel1Rates(BaseModel):
    default: float
    vip1: float
    vip2: float
    vip3: float
    svip: float


class VipRulesResponse(BaseModel):
    thresholds: VipThresholds
    level1_rates: VipLevel1Rates
    level2_rate: float
    level3_rate: float
