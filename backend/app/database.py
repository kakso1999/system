from motor.motor_asyncio import AsyncIOMotorClient, AsyncIOMotorDatabase
from app.config import get_settings

settings = get_settings()

client: AsyncIOMotorClient = None
db: AsyncIOMotorDatabase = None


async def connect_db():
    global client, db
    client = AsyncIOMotorClient(settings.MONGODB_URL)
    db = client[settings.DATABASE_NAME]
    await create_indexes()


async def close_db():
    global client
    if client:
        client.close()


async def create_indexes():
    # admins
    await db.admins.create_index("username", unique=True)
    # staff_users
    await db.staff_users.create_index("username", unique=True)
    await db.staff_users.create_index("invite_code", unique=True)
    await db.staff_users.create_index("phone")
    await db.staff_users.create_index("parent_id")
    # Migration note: existing deployments with the old full-unique indexes should drop them before these apply.
    await db.staff_registration_applications.create_index(
        "username",
        unique=True,
        partialFilterExpression={"status": {"$in": ["pending", "approved"]}},
        name="uniq_username_active",
    )
    await db.staff_registration_applications.create_index(
        "phone",
        unique=True,
        partialFilterExpression={"status": {"$in": ["pending", "approved"]}},
        name="uniq_phone_active",
    )
    await db.staff_registration_applications.create_index([("status", 1), ("applied_at", -1)])
    # staff_relations
    await db.staff_relations.create_index(
        [("staff_id", 1), ("ancestor_id", 1)], unique=True
    )
    await db.staff_relations.create_index([("ancestor_id", 1), ("level", 1)])
    # campaigns
    await db.campaigns.create_index("status")
    # wheel_items
    await db.wheel_items.create_index([("campaign_id", 1), ("enabled", 1)])
    # reward_codes
    await db.reward_codes.create_index("code", unique=True)
    await db.reward_codes.create_index([("campaign_id", 1), ("status", 1)])
    # claims
    try:
        await db.claims.drop_index("phone_1_campaign_id_1")
    except Exception:
        pass
    await db.claims.create_index([("phone", 1), ("campaign_id", 1), ("status", 1)])
    await db.claims.create_index("staff_id")
    await db.claims.create_index("settlement_status")
    await db.claims.create_index("promo_session_id", sparse=True)
    await db.claims.create_index([("ip", 1), ("campaign_id", 1)])
    await db.claims.create_index(
        [("device_fingerprint", 1), ("campaign_id", 1)]
    )
    # Unique index to prevent race-condition double claims
    await db.claims.create_index(
        [("phone", 1), ("campaign_id", 1)],
        unique=True,
        partialFilterExpression={"status": "success", "phone": {"$gt": ""}},
        name="unique_phone_campaign_success",
    )
    # commission_logs
    await db.commission_logs.create_index(
        [("beneficiary_staff_id", 1), ("status", 1)]
    )
    await db.commission_logs.create_index("claim_id")
    await db.commission_logs.create_index(
        [("claim_id", 1), ("beneficiary_staff_id", 1)],
        unique=True,
        partialFilterExpression={"type": "direct"},
    )
    await db.commission_logs.create_index("created_at")
    # otp_records - TTL index
    await db.otp_records.create_index("expires_at", expireAfterSeconds=0)
    await db.otp_records.create_index([("phone", 1), ("expires_at", 1)])
    await db.captcha_records.create_index("token", unique=True)
    await db.captcha_records.create_index("expires_at", expireAfterSeconds=0)
    # otp_reservations - TTL index for M4 atomic reservation cleanup
    await db.otp_reservations.create_index("expires_at", expireAfterSeconds=0)
    await db.otp_reservations.create_index(
        [("phone", 1), ("bucket", 1)],
        unique=True,
        name="uniq_phone_bucket",
    )
    # risk_logs
    await db.risk_logs.create_index([("created_at", -1)])
    # system_settings
    await db.system_settings.create_index("key", unique=True)
    await db.team_rewards.create_index([("staff_id", 1), ("milestone", 1)], unique=True)
    await db.vip_upgrade_logs.create_index([("staff_id", 1), ("created_at", -1)])
    await db.staff_payout_accounts.create_index("staff_id")
    await db.withdrawal_requests.create_index([("staff_id", 1), ("status", 1)])
    await db.withdrawal_requests.create_index("created_at")
    # F2.2 withdrawal reservation - TTL auto-cleanup + uniqueness
    await db.withdrawal_reservations.create_index("expires_at", expireAfterSeconds=0)
    await db.withdrawal_reservations.create_index([("staff_id", 1), ("expires_at", 1)])
    await db.withdrawal_reservations.create_index("reservation_id", unique=True)
    # promo_live_tokens
    await db.promo_live_tokens.create_index([("staff_id", 1), ("status", 1)])
    await db.promo_live_tokens.create_index("token_signature", unique=True)
    await db.promo_live_tokens.create_index("expires_at", expireAfterSeconds=3600)
    # promo_sessions
    await db.promo_sessions.create_index("session_token", unique=True)
    await db.promo_sessions.create_index([("staff_id", 1), ("status", 1)])
    await db.promo_sessions.create_index("expires_at", expireAfterSeconds=3600)
    # spin_outcomes
    await db.spin_outcomes.create_index("spin_token", unique=True)
    await db.spin_outcomes.create_index("expires_at", expireAfterSeconds=0)
    await db.spin_outcomes.create_index([("staff_id", 1), ("created_at", -1)])
    # promotion_activity_logs
    await db.promotion_activity_logs.create_index([("staff_id", 1), ("created_at", -1)])
    # staff_users last_seen_at for online filtering
    await db.staff_users.create_index("last_seen_at")
    # staff daily sprint bonus
    await db.staff_bonus_rules.create_index("staff_id", unique=True, sparse=True)
    await db.bonus_claim_records.create_index(
        [("staff_id", 1), ("date", 1), ("tier_threshold", 1)], unique=True
    )
    await db.bonus_claim_records.create_index([("staff_id", 1), ("created_at", -1)])
    await db.daily_bonus_settlements.create_index(
        [("staff_id", 1), ("date", 1)], unique=True
    )
    # sponsors
    await db.sponsors.create_index("enabled")
    await db.sponsors.create_index([("sort_order", 1), ("created_at", -1)])
    # revoked_tokens
    await db.revoked_tokens.create_index("jti", unique=True)
    await db.revoked_tokens.create_index("expires_at", expireAfterSeconds=0)
    # claim_receipts
    await db.claim_receipts.create_index("receipt_token", unique=True)
    await db.claim_receipts.create_index("expires_at", expireAfterSeconds=0)


def get_db() -> AsyncIOMotorDatabase:
    return db
