from pydantic import BaseModel, ConfigDict


class ReissueRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")

    staff_id: str = ""
    milestone: str = ""
    remark: str | None = ""


class VoidRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")

    remark: str | None = ""
