from __future__ import annotations

from typing import Any

from pydantic import BaseModel, ConfigDict, Field

RequestValue = str | int | float | bool | list[Any] | dict[str, Any] | None


class PayoutAccountRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")

    type: str | None = ""
    account_name: str | None = ""
    account_number: str | None = ""
    bank_name: str | None = ""


class WithdrawalCreateRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")

    amount: str | int | float | None = 0
    payout_account_id: str | None = ""


class ManualSettleRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")

    staff_id: str | None = ""
    amount: str | int | float | None = None
    remark: str | None = ""


class CombinedSettleRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")

    staff_id: str | None = None
    campaign_id: str | None = None
    include_bonus: object = True


class SettlementBatchRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")

    staff_ids: list[str] | None = None
    include_bonus: object = True
    note: object | None = None


class CommissionRejectRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")

    reason: str = ""


class WithdrawalRejectRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")

    reason: str | None = ""


class WithdrawalCompleteRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")

    transaction_no: str | None = ""
    remark: str | None = ""


class SpinRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")

    staff_code: str | None = ""
    campaign_id: str | None = ""
    device_fingerprint: str | None = None


class VerifyPhoneRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")

    phone: str = ""
    campaign_id: str = ""


class VerifyOtpRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")

    campaign_id: str = ""
    phone: str = ""
    code: str = ""


class ClaimCompleteRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")

    campaign_id: str | None = ""
    phone: str = ""
    spin_token: str | None = ""
    device_fingerprint: str | None = ""
    staff_code: str | None = ""


class PinVerifyRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")

    staff_code: str | None = ""
    pin: str | None = ""
    device_fingerprint: str | None = ""
    token_signature: str | None = ""


class UpdateSettingRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")

    value: RequestValue = None


class RiskSettingUpdateRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")

    key: str | None = None
    value: RequestValue = None


class ClaimActionRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")

    reason: str | None = ""


class BonusSettleBatchRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")

    record_ids: list[str] = Field(default_factory=list)


class CampaignMutationRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")

    staff_ids: list[str] = Field(default_factory=list)
