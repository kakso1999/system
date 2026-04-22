import logging
from datetime import datetime, timezone
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from contextlib import asynccontextmanager
from pathlib import Path
from app.database import connect_db, close_db, get_db
from app.config import get_settings
from app.utils.security import hash_password

logger = logging.getLogger(__name__)


@asynccontextmanager
async def lifespan(app: FastAPI):
    await connect_db()
    await seed_admin()
    await seed_settings()
    await seed_bonus_default_rule()
    yield
    await close_db()


async def seed_admin():
    settings = get_settings()
    db = get_db()
    now = datetime.now(timezone.utc)
    await db.admins.update_many(
        {"role": {"$exists": False}},
        {
            "$set": {
                "display_name": "Default Admin",
                "role": "super_admin",
                "status": "active",
                "must_change_password": True,
                "last_login_at": None,
                "created_by_admin_id": None,
                "created_at": now,
                "updated_at": now,
            }
        },
    )
    existing = await db.admins.find_one({"username": settings.DEFAULT_ADMIN_USERNAME})
    if not existing:
        if settings.DEFAULT_ADMIN_PASSWORD == "admin123":
            logger.warning(
                "Seeding default admin with insecure password 'admin123'. "
                "Will be forced to change on first login."
            )
        await db.admins.insert_one(
            {
                "username": settings.DEFAULT_ADMIN_USERNAME,
                "password_hash": hash_password(settings.DEFAULT_ADMIN_PASSWORD),
                "display_name": settings.DEFAULT_ADMIN_USERNAME,
                "role": "super_admin",
                "status": "active",
                "must_change_password": True,
                "last_login_at": None,
                "created_by_admin_id": None,
                "created_at": now,
                "updated_at": now,
            }
        )


async def seed_settings():
    db = get_db()
    defaults = [
        {"key": "risk_phone_unique", "value": True, "group": "risk_control", "description": "Phone unique claim"},
        {"key": "risk_ip_unique", "value": True, "group": "risk_control", "description": "IP unique claim"},
        {"key": "risk_device_unique", "value": False, "group": "risk_control", "description": "Device fingerprint unique"},
        {"key": "sms_verification", "value": False, "group": "risk_control", "description": "SMS OTP verification"},
        {"key": "sms_api_url", "value": "", "group": "sms_config", "description": "SMS API endpoint (set per-env)"},
        {"key": "sms_appkey", "value": "", "group": "sms_config", "description": "SMS appkey (set per-env; rotate before production)"},
        {"key": "sms_appcode", "value": "", "group": "sms_config", "description": "SMS appcode (set per-env)"},
        {"key": "sms_appsecret", "value": "", "group": "sms_config", "description": "SMS appsecret (set per-env; rotate before production)"},
        {"key": "sms_extend", "value": "", "group": "sms_config", "description": "SMS extend field"},
        {"key": "sms_signature", "value": "GroundRewards", "group": "sms_config", "description": "SMS signature name"},
        {"key": "sms_otp_template", "value": "[{signature}] Your OTP code is {code}. Valid for 10 minutes.", "group": "sms_config", "description": "SMS message template"},
        {"key": "live_qr_enabled", "value": False, "group": "live_qr", "description": "Enable secure QR+PIN flow"},
        {"key": "live_pin_max_fails", "value": 5, "group": "live_qr", "description": "Max wrong PIN attempts before locking a token"},
        {"key": "live_qr_expires_sec", "value": 300, "group": "live_qr", "description": "Live QR + PIN expiry seconds"},
        {"key": "promo_session_expires_min", "value": 30, "group": "live_qr", "description": "One-time claim session expiry minutes"},
        {"key": "commission_level1_default", "value": 1.0, "group": "commission", "description": "Level 1 default commission"},
        {"key": "commission_level2", "value": 0.3, "group": "commission", "description": "Level 2 commission"},
        {"key": "commission_level3", "value": 0.1, "group": "commission", "description": "Level 3 commission"},
        {"key": "commission_after_redeem", "value": False, "group": "commission", "description": "If True, website-prize commissions stay in 'pending_redeem' until the reward code is externally redeemed, then flipped to 'approved'."},
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
        {"key": "team_reward_100", "value": 300, "group": "team_reward", "description": "Team reward 100 amount (PHP; converted via to_cents on read)"},
        {"key": "team_reward_1000_threshold", "value": 1000, "group": "team_reward", "description": "Team reward 1000 threshold"},
        {"key": "team_reward_1000", "value": 500, "group": "team_reward", "description": "Team reward 1000 amount (PHP; converted via to_cents on read)"},
        {"key": "team_reward_10000_threshold", "value": 10000, "group": "team_reward", "description": "Team reward 10000 threshold"},
        {"key": "team_reward_10000", "value": 1000, "group": "team_reward", "description": "Team reward 10000 amount (PHP; converted via to_cents on read)"},
        {"key": "external_api_key", "value": "PLEASE_SET_API_KEY", "group": "integration", "description": "X-API-Key required for /api/external/* endpoints (rotate before production)"},
        {"key": "project_name", "value": "GroundRewards", "group": "general", "description": "Brand / project name shown in headers"},
        {"key": "activity_title", "value": "Lucky Wheel", "group": "general", "description": "Activity title shown to end users"},
        {"key": "activity_desc", "value": "", "group": "general", "description": "Activity description shown to end users"},
        {"key": "default_redirect_url", "value": "", "group": "general", "description": "Default redirect URL used by reward codes when no per-item redirect_url is set"},
        {"key": "sms_cooldown_sec", "value": 60, "group": "risk_control", "description": "Minimum seconds between OTP requests for the same phone"},
        {"key": "phone_daily_limit", "value": 3, "group": "risk_control", "description": "Maximum OTP requests per phone in a rolling 10-minute window"},
        {"key": "ip_daily_limit", "value": 20, "group": "risk_control", "description": "Maximum OTP requests per IP inside ip_window_min"},
        {"key": "ip_window_min", "value": 60, "group": "risk_control", "description": "Rolling window in minutes for ip_daily_limit"},
        {"key": "customer_service_enabled", "value": False, "group": "customer_service", "description": "Show floating customer-service button on user pages"},
        {"key": "customer_service_whatsapp", "value": "", "group": "customer_service", "description": "WhatsApp link or number (e.g., https://wa.me/63XXXXXXXXXX)"},
        {"key": "customer_service_telegram", "value": "", "group": "customer_service", "description": "Telegram link (e.g., https://t.me/yourhandle)"},
    ]
    for item in defaults:
        await db.system_settings.update_one(
            {"key": item["key"]},
            {"$setOnInsert": item},
            upsert=True,
        )

    # Runtime warning: SMS is enabled but credentials are blank (common misconfig)
    sms_doc = await db.system_settings.find_one({"key": "sms_verification"})
    if sms_doc and sms_doc.get("value") is True:
        missing = []
        for cred_key in ("sms_api_url", "sms_appkey", "sms_appcode", "sms_appsecret"):
            cred_doc = await db.system_settings.find_one({"key": cred_key})
            if not cred_doc or not str(cred_doc.get("value") or "").strip():
                missing.append(cred_key)
        if missing:
            logger.warning(
                "sms_verification=True but these credentials are empty: %s. "
                "OTP sends will fail until these are set via /api/admin/settings.",
                ", ".join(missing),
            )


async def seed_bonus_default_rule():
    db = get_db()
    if await db.staff_bonus_rules.find_one({"staff_id": None}):
        return
    now = datetime.now(timezone.utc)
    await db.staff_bonus_rules.insert_one(
        {
            "staff_id": None,
            "tiers": [
                {"threshold": 5, "amount": 50.0, "amount_cents": 5000},
                {"threshold": 10, "amount": 100.0, "amount_cents": 10000},
                {"threshold": 20, "amount": 300.0, "amount_cents": 30000},
            ],
            "enabled": True,
            "created_at": now,
            "updated_at": now,
            "created_by_admin_id": None,
        }
    )


app = FastAPI(title="GroundRewards API", version="1.0.0", lifespan=lifespan)

settings = get_settings()
app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origin_list,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Import and register routers
from app.routers import admin_auth, staff_auth, campaigns, wheel, reward_codes, admins
from app.routers import staff, claims, user_flow, risk_control, settings as settings_router
from app.routers import promoter, finance, dashboard, external, bonus, registrations, sponsors, public_settings, qr

app.include_router(admin_auth.router, prefix="/api/auth/admin", tags=["Admin Auth"])
app.include_router(staff_auth.router, prefix="/api/auth/staff", tags=["Staff Auth"])
app.include_router(admins.router, prefix="/api/admin/admins", tags=["Admin Management"])
app.include_router(campaigns.router, prefix="/api/admin/campaigns", tags=["Campaigns"])
app.include_router(wheel.router, prefix="/api/admin/wheel-items", tags=["Wheel Items"])
app.include_router(reward_codes.router, prefix="/api/admin/reward-codes", tags=["Reward Codes"])
app.include_router(staff.router, prefix="/api/admin/staff", tags=["Staff Management"])
app.include_router(registrations.router, prefix="/api/admin/registrations", tags=["Registrations"])
app.include_router(claims.router, prefix="/api/admin/claims", tags=["Claims Records"])
app.include_router(risk_control.router, prefix="/api/admin/risk-control", tags=["Risk Control"])
app.include_router(settings_router.router, prefix="/api/admin/settings", tags=["System Settings"])
app.include_router(finance.router, prefix="/api/admin/finance", tags=["Finance"])
app.include_router(dashboard.router, prefix="/api/admin/dashboard", tags=["Dashboard"])
app.include_router(bonus.router, prefix="/api/admin/bonus", tags=["Bonus"])
app.include_router(bonus.promoter_router, prefix="/api/promoter/bonus", tags=["Promoter Bonus"])
app.include_router(user_flow.router, prefix="/api/claim", tags=["User Claim Flow"])
app.include_router(promoter.router, prefix="/api/promoter", tags=["Promoter"])
app.include_router(external.router, prefix="/api/external", tags=["External"])
app.include_router(external.alias_router, prefix="/api/redeem", tags=["Redeem Alias"])
app.include_router(sponsors.router, prefix="/api/admin/sponsors", tags=["Sponsors"])
app.include_router(sponsors.public_router, prefix="/api/sponsors", tags=["Sponsors Public"])
app.include_router(public_settings.router, prefix="/api/public", tags=["Public Settings"])
app.include_router(qr.router, prefix="/api/public", tags=["Public QR"])

# Static files for uploaded images
upload_dir = Path(__file__).parent.parent / "uploads"
upload_dir.mkdir(exist_ok=True)
app.mount("/uploads", StaticFiles(directory=str(upload_dir)), name="uploads")


@app.get("/api/health")
async def health():
    return {"status": "ok"}


@app.get("/_version")
async def version():
    return {
        "version": "2.5.0-f1",
        "waves": ["A1", "A2", "A3", "F1"],
        "features": {
            "cookie_only_auth": settings.COOKIE_ONLY_AUTH,
            "cors_origins": settings.cors_origin_list,
        },
    }
