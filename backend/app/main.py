from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from contextlib import asynccontextmanager
from pathlib import Path
from app.database import connect_db, close_db, get_db
from app.config import get_settings
from app.utils.security import hash_password


@asynccontextmanager
async def lifespan(app: FastAPI):
    await connect_db()
    await seed_admin()
    await seed_settings()
    yield
    await close_db()


async def seed_admin():
    settings = get_settings()
    db = get_db()
    existing = await db.admins.find_one({"username": settings.DEFAULT_ADMIN_USERNAME})
    if not existing:
        await db.admins.insert_one({
            "username": settings.DEFAULT_ADMIN_USERNAME,
            "password_hash": hash_password(settings.DEFAULT_ADMIN_PASSWORD),
        })


async def seed_settings():
    db = get_db()
    defaults = [
        {"key": "risk_phone_unique", "value": True, "group": "risk_control", "description": "Phone unique claim"},
        {"key": "risk_ip_unique", "value": True, "group": "risk_control", "description": "IP unique claim"},
        {"key": "risk_device_unique", "value": False, "group": "risk_control", "description": "Device fingerprint unique"},
        {"key": "sms_verification", "value": False, "group": "risk_control", "description": "SMS OTP verification"},
        {"key": "commission_level1_default", "value": 1.0, "group": "commission", "description": "Level 1 default commission"},
        {"key": "commission_level2", "value": 0.3, "group": "commission", "description": "Level 2 commission"},
        {"key": "commission_level3", "value": 0.1, "group": "commission", "description": "Level 3 commission"},
        {"key": "commission_vip1", "value": 1.2, "group": "commission", "description": "VIP1 level 1 commission"},
        {"key": "commission_vip2", "value": 1.5, "group": "commission", "description": "VIP2 level 1 commission"},
        {"key": "commission_vip3", "value": 1.6, "group": "commission", "description": "VIP3 level 1 commission"},
        {"key": "commission_svip", "value": 2.0, "group": "commission", "description": "Super VIP level 1 commission"},
        {"key": "default_currency", "value": "PHP", "group": "general", "description": "Default currency"},
        {"key": "vip_threshold_1", "value": 10, "group": "vip", "description": "VIP1 threshold"},
        {"key": "vip_threshold_2", "value": 100, "group": "vip", "description": "VIP2 threshold"},
        {"key": "vip_threshold_3", "value": 1000, "group": "vip", "description": "VIP3 threshold"},
        {"key": "vip_threshold_svip", "value": 10000, "group": "vip", "description": "Super VIP threshold"},
        {"key": "team_reward_100_threshold", "value": 100, "group": "team_reward", "description": "Team reward 100 threshold"},
        {"key": "team_reward_100", "value": 300, "group": "team_reward", "description": "Team reward 100 amount"},
        {"key": "team_reward_1000_threshold", "value": 1000, "group": "team_reward", "description": "Team reward 1000 threshold"},
        {"key": "team_reward_1000", "value": 500, "group": "team_reward", "description": "Team reward 1000 amount"},
        {"key": "team_reward_10000_threshold", "value": 10000, "group": "team_reward", "description": "Team reward 10000 threshold"},
        {"key": "team_reward_10000", "value": 1000, "group": "team_reward", "description": "Team reward 10000 amount"},
    ]
    for item in defaults:
        await db.system_settings.update_one(
            {"key": item["key"]},
            {"$setOnInsert": item},
            upsert=True,
        )


app = FastAPI(title="GroundRewards API", version="1.0.0", lifespan=lifespan)

settings = get_settings()
app.add_middleware(
    CORSMiddleware,
    allow_origins=[o.strip() for o in settings.CORS_ORIGINS.split(",")],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Import and register routers
from app.routers import admin_auth, staff_auth, campaigns, wheel, reward_codes
from app.routers import staff, claims, user_flow, risk_control, settings as settings_router
from app.routers import promoter, finance, dashboard

app.include_router(admin_auth.router, prefix="/api/auth/admin", tags=["Admin Auth"])
app.include_router(staff_auth.router, prefix="/api/auth/staff", tags=["Staff Auth"])
app.include_router(campaigns.router, prefix="/api/admin/campaigns", tags=["Campaigns"])
app.include_router(wheel.router, prefix="/api/admin/wheel-items", tags=["Wheel Items"])
app.include_router(reward_codes.router, prefix="/api/admin/reward-codes", tags=["Reward Codes"])
app.include_router(staff.router, prefix="/api/admin/staff", tags=["Staff Management"])
app.include_router(claims.router, prefix="/api/admin/claims", tags=["Claims Records"])
app.include_router(risk_control.router, prefix="/api/admin/risk-control", tags=["Risk Control"])
app.include_router(settings_router.router, prefix="/api/admin/settings", tags=["System Settings"])
app.include_router(finance.router, prefix="/api/admin/finance", tags=["Finance"])
app.include_router(dashboard.router, prefix="/api/admin/dashboard", tags=["Dashboard"])
app.include_router(user_flow.router, prefix="/api/claim", tags=["User Claim Flow"])
app.include_router(promoter.router, prefix="/api/promoter", tags=["Promoter"])

# Static files for uploaded images
upload_dir = Path(__file__).parent.parent / "uploads"
upload_dir.mkdir(exist_ok=True)
app.mount("/uploads", StaticFiles(directory=str(upload_dir)), name="uploads")


@app.get("/api/health")
async def health():
    return {"status": "ok"}
