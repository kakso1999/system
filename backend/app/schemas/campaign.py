from datetime import datetime
from typing import Literal

from pydantic import BaseModel, ConfigDict, Field

CampaignStatus = Literal["draft", "active", "paused", "ended"]
CampaignPublishStatus = Literal["active", "paused", "ended"]
WheelItemType = Literal["onsite", "website"]
RewardCodeStatus = Literal["unused", "used", "blocked", "assigned", "redeemed"]


class CampaignCreateRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")

    name: str
    description: str
    start_time: datetime
    end_time: datetime
    rules_text: str = ""
    prize_url: str = ""
    max_claims_per_user: int = Field(1, ge=1)
    no_prize_weight: int = 10


class CampaignUpdateRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")

    name: str | None = None
    description: str | None = None
    start_time: datetime | None = None
    end_time: datetime | None = None
    status: CampaignStatus | None = None
    rules_text: str | None = None
    prize_url: str | None = None
    max_claims_per_user: int | None = Field(None, ge=1)
    no_prize_weight: int | None = None


class CampaignStatusUpdateRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")

    status: CampaignPublishStatus


class CampaignDetail(BaseModel):
    id: str
    name: str
    description: str
    start_time: datetime
    end_time: datetime
    status: CampaignStatus
    rules_text: str = ""
    prize_url: str = ""
    max_claims_per_user: int
    no_prize_weight: int
    created_at: datetime
    updated_at: datetime | None = None


class WheelItemCreateRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")

    campaign_id: str
    name: str
    display_name: str
    type: WheelItemType
    weight: int = 10
    sort_order: int = 0
    max_per_staff: int = Field(0, ge=0)
    enabled: bool = True
    needs_reward_code: bool = False
    reward_code_pool: str = ""
    redirect_url: str = ""
    display_text: str = ""
    remark: str = ""


class WheelItemUpdateRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")

    campaign_id: str | None = None
    name: str | None = None
    display_name: str | None = None
    type: WheelItemType | None = None
    weight: int | None = None
    sort_order: int | None = None
    max_per_staff: int | None = Field(None, ge=0)
    enabled: bool | None = None
    needs_reward_code: bool | None = None
    reward_code_pool: str | None = None
    redirect_url: str | None = None
    display_text: str | None = None
    remark: str | None = None


class WheelItemDetail(BaseModel):
    id: str
    campaign_id: str
    name: str
    display_name: str
    type: WheelItemType
    weight: int
    sort_order: int
    max_per_staff: int = 0
    enabled: bool
    needs_reward_code: bool
    reward_code_pool: str = ""
    redirect_url: str = ""
    display_text: str = ""
    remark: str = ""
    image_url: str = ""
    created_at: datetime | None = None
    updated_at: datetime | None = None


class RewardCodeDetail(BaseModel):
    id: str
    code: str
    campaign_id: str
    wheel_item_id: str
    pool_type: str
    status: RewardCodeStatus
    created_at: datetime
    updated_at: datetime | None = None
