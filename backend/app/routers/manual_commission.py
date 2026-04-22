from fastapi import APIRouter, Depends, status
from motor.motor_asyncio import AsyncIOMotorDatabase

from app.database import get_db
from app.dependencies import get_current_admin
from app.schemas.manual_commission import (
    ManualCommissionAdjust,
    ManualCommissionCancel,
    ManualCommissionCreate,
)
from app.services.manual_commission_admin import (
    adjust_manual_commission_entry,
    cancel_manual_commission_entry,
    create_manual_commission_entry,
)

router = APIRouter(dependencies=[Depends(get_current_admin)])


@router.post("/manual", status_code=status.HTTP_201_CREATED)
async def create_manual_commission(
    payload: ManualCommissionCreate,
    current_admin: dict = Depends(get_current_admin),
    db: AsyncIOMotorDatabase = Depends(get_db),
) -> dict:
    return await create_manual_commission_entry(db, payload, current_admin)


@router.post("/{commission_id}/adjust")
async def adjust_manual_commission(
    commission_id: str,
    payload: ManualCommissionAdjust,
    current_admin: dict = Depends(get_current_admin),
    db: AsyncIOMotorDatabase = Depends(get_db),
) -> dict:
    return await adjust_manual_commission_entry(db, commission_id, payload, current_admin)


@router.post("/{commission_id}/cancel")
async def cancel_manual_commission(
    commission_id: str,
    payload: ManualCommissionCancel,
    current_admin: dict = Depends(get_current_admin),
    db: AsyncIOMotorDatabase = Depends(get_db),
) -> dict:
    return await cancel_manual_commission_entry(db, commission_id, payload, current_admin)
