# v2.5-rc Audit — Part C

## 1. Section F — Collections & Fields

### 1.1 Named collections
| Collection (docx) | Actual name in code | Present? | Evidence |
|---|---|---|---|
| settings | system_settings (renamed) | ✅ | backend/app/database.py:100 |
| settlement_logs | no single equivalent; split across `commission_logs` and `finance_action_logs` | ❌ | backend/app/routers/finance.py:223 |
| staff_bonus_rules | staff_bonus_rules | ✅ | backend/app/database.py:123 |
| bonus_claim_records | bonus_claim_records | ✅ | backend/app/database.py:124 |
| daily_bonus_settlements | daily_bonus_settlements | ✅ | backend/app/database.py:128 |
| promotion_activity_logs | promotion_activity_logs | ✅ | backend/app/database.py:119 |
| promo_live_tokens | promo_live_tokens | ✅ | backend/app/database.py:107 |
| promo_sessions | promo_sessions | ✅ | backend/app/database.py:111 |
| staff_registration_applications | staff_registration_applications | ✅ | backend/app/database.py:32 |

### 1.2 admins fields
| Field | Present? | Evidence |
|---|---|---|
| display_name | ✅ | backend/app/routers/admins.py:95 |
| role | ✅ | backend/app/routers/admins.py:96 |
| status | ✅ | backend/app/routers/admins.py:97 |
| must_change_password | ✅ | backend/app/routers/admins.py:98 |
| last_login_at | ✅ | backend/app/routers/admins.py:99 |
| created_by_admin_id | ✅ | backend/app/routers/admins.py:100 |
| updated_at | ✅ | backend/app/routers/admins.py:102 |

### 1.3 staff_users fields
| Field | Present? | Evidence |
|---|---|---|
| payout_method | ❌ | No `staff_users.payout_method` field found; payout data is modeled in separate payout/withdrawal docs (`backend/app/routers/promoter.py:192`) |
| payout_account_name | ❌ | Stored on withdrawal snapshots instead of `staff_users` (`backend/app/services/withdrawals.py:88`) |
| payout_account_number | ❌ | Stored on withdrawal snapshots instead of `staff_users` (`backend/app/services/withdrawals.py:89`) |
| payout_notes | ❌ | No `payout_notes` field found in backend/app |
| can_generate_qr | ❌ | No `can_generate_qr` field found in backend/app |
| can_use_signed_link | ❌ | No `can_use_signed_link` field found in backend/app |
| allow_static_link | ❌ | No `allow_static_link` field found in backend/app |
| must_start_work | ❌ | No `must_start_work` field found in backend/app |
| risk_frozen | ❌ | No `risk_frozen` field found in backend/app |
| daily_claim_limit | ❌ | No `daily_claim_limit` field found in backend/app |
| daily_redeem_limit | ❌ | No `daily_redeem_limit` field found in backend/app |
| work_status | ✅ | backend/app/routers/promoter.py:456 |
| promotion_paused | ✅ | backend/app/routers/promoter.py:457 |
| pause_reason | ✅ | backend/app/routers/promoter.py:458 |
| paused_at | ✅ | backend/app/routers/promoter.py:509 |
| resumed_at | ✅ | backend/app/routers/promoter.py:531 |
| qr_version | ✅ | backend/app/routers/promoter.py:403 |
| last_login_at | ✅ | backend/app/routers/staff_auth.py:141 |
| last_seen_at | ✅ | backend/app/routers/promoter.py:555 |
| last_logout_at | ❌ | No `last_logout_at` field found in backend/app |
| is_online | ❌ | Computed in response schema, not stored in `staff_users` (`backend/app/schemas/staff.py:127`) |

### 1.4 claims fields
| Field | Present? | Evidence |
|---|---|---|
| device_fingerprint | ✅ | backend/app/routers/user_flow.py:617 |
| promo_session_id | ❌ | Claim document insert omits any `promo_session_id` field (`backend/app/routers/user_flow.py:615`) |
| settlement_status | ✅ | backend/app/routers/user_flow.py:620 |
| commission_amount | ✅ | backend/app/routers/user_flow.py:621 |
| settled_at | ✅ | backend/app/routers/user_flow.py:622 |

### 1.5 otp fields (actual collection: otp_records)
| Field | Present? | Evidence |
|---|---|---|
| ip_address | ❌ | OTP records store `ip`, not `ip_address` (`backend/app/routers/user_flow.py:425`) |
| promo_code | ❌ | No `promo_code` field found; OTP records store `code` only (`backend/app/routers/user_flow.py:422`) |
| flow_token | ❌ | No `flow_token` field found in backend/app |
| send_status | ❌ | No `send_status` field found in backend/app |
| send_mode | ❌ | No `send_mode` field found in backend/app |
| send_error | ❌ | No `send_error` field found in backend/app |
| verify_attempts | ❌ | OTP records store `attempts`, not `verify_attempts` (`backend/app/routers/user_flow.py:423`) |
| last_attempt_at | ❌ | Failed OTP attempts increment a counter only; no attempt timestamp is stored (`backend/app/routers/user_flow.py:480`) |

### 1.6 promo_live_tokens fields
| Field | Present? | Evidence |
|---|---|---|
| token / signature | ✅ | backend/app/routers/promoter.py:402 |
| PIN | ✅ | backend/app/routers/promoter.py:401 |
| failed attempts | ✅ | backend/app/routers/promoter.py:405 |
| expires_at | ✅ | backend/app/routers/promoter.py:406 |
| consumption context (`consumed_at` + `consumed_device_fingerprint`) | ✅ | backend/app/routers/promoter.py:408 |

### 1.7 promo_sessions fields
| Field | Present? | Evidence |
|---|---|---|
| session_token | ✅ | backend/app/routers/user_flow.py:731 |
| ip | ✅ | backend/app/routers/user_flow.py:733 |
| user_agent | ✅ | backend/app/routers/user_flow.py:734 |
| device_fingerprint | ✅ | backend/app/routers/user_flow.py:732 |
| status | ✅ | backend/app/routers/user_flow.py:735 |
| expires_at | ✅ | backend/app/routers/user_flow.py:737 |
| is_used | ❌ | Usage is inferred from `status`/`consumed_at`; no explicit boolean is stored (`backend/app/routers/user_flow.py:735`) |

### 1.8 staff_registration_applications fields
| Field | Present? | Evidence |
|---|---|---|
| applied_at | ✅ | backend/app/routers/staff_auth.py:209 |
| status | ✅ | backend/app/routers/staff_auth.py:207 |
| rejection_reason | ✅ | backend/app/routers/staff_auth.py:208 |
| reviewed_at | ✅ | backend/app/routers/staff_auth.py:210 |
| reviewed_by_admin_id | ✅ | backend/app/routers/staff_auth.py:211 |
| source_ip | ❌ | No `source_ip` field found in registration application writes (`backend/app/routers/staff_auth.py:201`) |
| approved_staff_id | ✅ | backend/app/routers/staff_auth.py:212 |

## 2. Section G — System Settings

Seeded keys found in `seed_settings`: `risk_phone_unique`, `risk_ip_unique`, `risk_device_unique`, `sms_verification`, `sms_api_url`, `sms_appkey`, `sms_appcode`, `sms_appsecret`, `sms_extend`, `sms_signature`, `sms_otp_template`, `live_qr_enabled`, `live_pin_max_fails`, `live_qr_expires_sec`, `promo_session_expires_min`, `commission_level1_default`, `commission_level2`, `commission_level3`, `commission_vip1`, `commission_vip2`, `commission_vip3`, `commission_svip`, `default_currency`, `vip_threshold_1`, `vip_threshold_2`, `vip_threshold_3`, `vip_threshold_svip`, `team_reward_100_threshold`, `team_reward_100`, `team_reward_1000_threshold`, `team_reward_1000`, `team_reward_10000_threshold`, `team_reward_10000`, `external_api_key`, `project_name`, `activity_title`, `activity_desc`, `default_redirect_url`, `sms_cooldown_sec`, `phone_daily_limit`, `ip_daily_limit`, `ip_window_min`, `customer_service_enabled`, `customer_service_whatsapp`, `customer_service_telegram` (`backend/app/main.py:70`-`114`).

Hard-coded `get_setting()` keys used elsewhere: `vip_threshold_1`, `vip_threshold_2`, `vip_threshold_3`, `vip_threshold_svip`, `live_qr_expires_sec`, `risk_phone_unique`, `risk_ip_unique`, `risk_device_unique`, `live_qr_enabled`, `sms_verification`, `sms_cooldown_sec`, `phone_daily_limit`, `ip_daily_limit`, `ip_window_min`, `live_pin_max_fails`, `promo_session_expires_min`, `commission_level2`, `commission_level3`, `team_reward_100_threshold`, `team_reward_1000_threshold`, `team_reward_10000_threshold` (for example: `backend/app/routers/user_flow.py:82`, `backend/app/routers/promoter.py:394`, `backend/app/services/commission.py:87`).

| Docx setting | Key in code | Present in seed? | Evidence |
|---|---|---|---|
| 项目名称 | project_name | ✅ | backend/app/main.py:104 |
| 活动标题 | activity_title | ✅ | backend/app/main.py:105 |
| 活动说明 | activity_desc | ✅ | backend/app/main.py:106 |
| 默认跳转网址 | default_redirect_url | ✅ | backend/app/main.py:107 |
| 兑奖接口 API Key | external_api_key | ✅ | backend/app/main.py:103 |
| WhatsApp 客服 | customer_service_whatsapp | ✅ | backend/app/main.py:113 |
| Telegram 客服 | customer_service_telegram | ✅ | backend/app/main.py:114 |
| 客服按钮开关 | customer_service_enabled | ✅ | backend/app/main.py:112 |
| 地推注册入口开关 | no key found | ❌ | Public `/staff-register` page and `/api/auth/staff/register` exist, but no setting gates them (`frontend/src/app/(auth)/staff-register/page.tsx:32`) |
| 地推注册验证码开关 | no key found | ❌ | No captcha setting or captcha implementation found in repo; registration posts directly to backend (`frontend/src/app/(auth)/staff-register/page.tsx:32`) |
| 签名推广链接开关 | live_qr_enabled | ✅ | backend/app/main.py:81 |
| 签名 QR 有效秒数 | live_qr_expires_sec | ✅ | backend/app/main.py:83 |
| 一次性领奖会话开关 | live_qr_enabled (same toggle as secure QR flow) | ✅ | backend/app/routers/user_flow.py:206 |
| 会话有效分钟数 | promo_session_expires_min | ✅ | backend/app/main.py:84 |
| 必须先开始推广 | no key found | ❌ | Work-state fields exist, but no setting controls “must start work before QR is valid” (`backend/app/routers/promoter.py:445`) |
| 允许旧版固定链接 | no key found | ❌ | Static `/welcome/{invite_code}` QR remains available with no config toggle (`backend/app/routers/promoter.py:118`) |
| 核销后入账 | no key found | ❌ | Website claims are marked `pending_redeem`, but commission is still created immediately; no setting controls this (`backend/app/routers/user_flow.py:620`) |
| 设备唯一 | risk_device_unique | ✅ | backend/app/main.py:72 |
| IP 频率 | no dedicated key; claim IP rate-limit is hard-coded | ❌ | Claim flow hard-codes 5 claims per IP per hour instead of a toggleable setting (`backend/app/routers/user_flow.py:96`) |
| IP 窗口限 | ip_daily_limit + ip_window_min | ✅ | backend/app/main.py:110 |
| SMS api_url | sms_api_url | ✅ | backend/app/main.py:74 |
| SMS appkey | sms_appkey | ✅ | backend/app/main.py:75 |
| SMS appcode | sms_appcode | ✅ | backend/app/main.py:76 |
| SMS appsecret | sms_appsecret | ✅ | backend/app/main.py:77 |
| SMS extend | sms_extend | ✅ | backend/app/main.py:78 |
| SMS signature | sms_signature | ✅ | backend/app/main.py:79 |
| SMS template | sms_otp_template | ✅ | backend/app/main.py:80 |
| live PIN 最大失败 | live_pin_max_fails | ✅ | backend/app/main.py:82 |

Missing-setting notes:
- `地推注册入口开关`: registration feature exists, but there is no configurable system setting to disable it.
- `地推注册验证码开关`: feature is fully missing.
- `必须先开始推广`: work-state endpoints exist, but there is no configurable setting and no QR/session enforcement tied to it.
- `允许旧版固定链接`: old static link flow exists, but there is no on/off control.
- `核销后入账`: feature is not configurable, and current behavior does not delay commission availability until redeem.
- `IP 频率`: there is a hard-coded claim/IP rate limit plus OTP/IP numeric limits, but no docx-style enable/disable switch.

## 3. Section H — Business Rules

| # | Rule | Status | Evidence |
|---|---|---|---|
| H1 | QR 安全链路（live QR + PIN → scan → pin → session → flow） | ✅ | Live QR + PIN are generated at `/api/promoter/live-qr/generate`, PIN verify creates a one-time session, and welcome/spin/complete enforce session when `live_qr_enabled` is on (`backend/app/routers/promoter.py:380`, `backend/app/routers/user_flow.py:658`, `backend/app/routers/user_flow.py:206`) |
| H2 | QR 立即失效：管理员暂停/员工禁用/风控冻结/未开工/过期/版本变化/PIN 上限 | ⚠️ Partial | Expiry, PIN-fail lock, and token rotation exist (`backend/app/routers/promoter.py:389`, `backend/app/routers/user_flow.py:693`, `backend/app/routers/user_flow.py:700`), but `pin_verify` does not check disabled/frozen/not-started/paused staff state (`backend/app/routers/user_flow.py:683`) |
| H3 | 会话绑定首个设备 + 非原设备拒绝 | ⚠️ Partial | Session stores `device_fingerprint` and `/complete` rejects mismatches (`backend/app/routers/user_flow.py:732`, `backend/app/routers/user_flow.py:519`), but `_require_active_session` used by welcome/spin does not compare device (`backend/app/routers/user_flow.py:108`) |
| H4 | 领奖上下文保存用于再查看/生成图片 | ⚠️ Partial | Backend exposes claim result by `claim_id` + signed token (`backend/app/routers/user_flow.py:754`), while frontend keeps the token in sessionStorage and generates the reward image client-side (`frontend/src/app/(user)/wheel/[code]/page.tsx:236`, `frontend/src/app/(user)/result/[id]/page.tsx:57`) |
| H5 | /_version 接口（版本 + 功能标记） | ❌ | No `/_version` route exists in backend/app; the app only exposes `/api/health` at top level (`backend/app/main.py:190`) |

## 4. Cross-Cutting Security & Correctness Findings

### H1 — Live QR invalidation omits required staff-state checks
**Severity**: High
**Area**: auth
**File**: `backend/app/routers/user_flow.py:683`, `backend/app/routers/promoter.py:445`
**Summary**: `pin_verify` validates token status, expiry, and PIN failures, but it does not re-check whether the promoter is disabled, paused, frozen, or has not started work. The required invalidation conditions exist as workflow concepts, but they are not enforced during QR consumption.
**Impact**: A QR generated before an admin/staff state change can remain usable until expiry, allowing claims to proceed in states that the docx says should invalidate immediately.
**Evidence**:
```text
backend/app/routers/user_flow.py:683:     staff = await db.staff_users.find_one({"invite_code": staff_code})
backend/app/routers/user_flow.py:687:     token = await db.promo_live_tokens.find_one({
backend/app/routers/user_flow.py:693:     token_exp = token["expires_at"]
backend/app/routers/user_flow.py:700:     max_fails = int(await get_setting(db, "live_pin_max_fails") or 5)

backend/app/routers/promoter.py:445: @router.post("/work/start")
backend/app/routers/promoter.py:491: @router.post("/work/pause")
```
**Fix**: Before accepting a PIN, load the latest staff document and reject if `status != active`, promotion is paused, the user has not started work, or any risk-freeze flag is active; invalidate outstanding live tokens on those state transitions.

### H2 — Session device binding is enforced only at final claim
**Severity**: Medium
**Area**: auth
**File**: `backend/app/routers/user_flow.py:108`, `backend/app/routers/user_flow.py:518`
**Summary**: The session document stores the first device fingerprint, but welcome and spin only check that a session token exists and matches staff/campaign. Device mismatch is enforced only in `/complete`.
**Impact**: If a session token leaks, a second device can still open the secured flow and spin the wheel; rejection happens only at the final claim step.
**Evidence**:
```text
backend/app/routers/user_flow.py:118:     session = await db.promo_sessions.find_one({
backend/app/routers/user_flow.py:128:     if session.get("staff_id") != staff_oid:
backend/app/routers/user_flow.py:131:     if campaign_oid is not None and session.get("campaign_id") != campaign_oid:

backend/app/routers/user_flow.py:518:         session = await _require_active_session(db, session_token_header, staff["_id"], campaign_oid=cid)
backend/app/routers/user_flow.py:519:         if session.get("device_fingerprint", "") != payload.get("device_fingerprint", ""):
```
**Fix**: Require device fingerprint on all session-bound endpoints and compare it inside `_require_active_session`, or bind session use to an HMAC of the first device and enforce it consistently.

### H3 — Website prizes credit withdrawable commission before redeem
**Severity**: High
**Area**: money
**File**: `backend/app/routers/user_flow.py:620`, `backend/app/services/commission.py:46`, `backend/app/services/withdrawals.py:34`
**Summary**: Website claims are marked `pending_redeem`, but commission logs are created immediately in `approved` state and counted toward withdrawal availability. External redeem only flips claim settlement status later.
**Impact**: Promoters can accrue and potentially withdraw commission for website prizes that have not yet been redeemed, which conflicts with the docx’s “核销后入账” requirement and creates payout leakage risk.
**Evidence**:
```text
backend/app/routers/user_flow.py:620:         "settlement_status": "pending_redeem" if item["type"] == "website" else "unpaid",

backend/app/services/commission.py:46:         "status": "approved",
backend/app/services/commission.py:53:     await db.staff_users.update_one(

backend/app/services/withdrawals.py:34:     total_approved_cents = await sum_amount_cents(
backend/app/services/withdrawals.py:36:         {"beneficiary_staff_id": staff_id, "status": "approved"},
```
**Fix**: Add an explicit “commission after redeem” setting and enforce it across commission creation, commission visibility, and withdrawal-balance calculation. For website prizes, defer commission approval until `/api/external/redeem` succeeds.

### H4 — Withdrawal request creation is not atomic
**Severity**: High
**Area**: money
**File**: `backend/app/services/withdrawals.py:103`
**Summary**: Withdrawal creation calculates available balance and then inserts a request without a transaction or compare-and-set guard. Two concurrent requests can both see the same available amount.
**Impact**: Parallel withdrawal submissions can oversubscribe the same approved balance, producing negative availability or manual reconciliation work.
**Evidence**:
```text
backend/app/services/withdrawals.py:112:     amount_cents = to_cents(amount)
backend/app/services/withdrawals.py:113:     snapshot_cents = {
backend/app/services/withdrawals.py:122:     if amount_cents > max(snapshot_cents["available_cents"], 0):
backend/app/services/withdrawals.py:131:     result = await db.withdrawal_requests.insert_one(document)
```
**Fix**: Use a MongoDB transaction or an atomic reservation/update model so “check available” and “create withdrawal request” succeed or fail together.

### H5 — SMS provider credentials are hard-coded in seed data
**Severity**: High
**Area**: config
**File**: `backend/app/main.py:74`
**Summary**: `seed_settings()` injects a concrete SMS API URL, app key, app code, and app secret into `system_settings`. These values are present in source control instead of being provisioned per environment.
**Impact**: If the values are real, the repository leaks third-party credentials. Even if they are placeholders, operators may accidentally ship shared credentials into production.
**Evidence**:
```text
backend/app/main.py:74: {"key": "sms_api_url", "value": "http://101.44.162.101:9090/sms/batch/v1", ...}
backend/app/main.py:75: {"key": "sms_appkey", "value": "9N9Q8M", ...}
backend/app/main.py:76: {"key": "sms_appcode", "value": "1000", ...}
backend/app/main.py:77: {"key": "sms_appsecret", "value": "wW3mjj", ...}
```
**Fix**: Remove seeded secrets from source, require environment-specific provisioning, rotate any exposed credentials, and fail startup if production SMS settings are unset or defaulted.

### H6 — Insecure JWT/admin defaults are still allowed outside `PRODUCTION=1`
**Severity**: High
**Area**: auth
**File**: `backend/app/config.py:17`, `backend/app/main.py:46`
**Summary**: The application defaults to `JWT_SECRET_KEY="change-me"` and `DEFAULT_ADMIN_PASSWORD="admin123"`. Startup only refuses insecure JWT settings when `PRODUCTION=1`; otherwise it logs a warning and continues.
**Impact**: A misconfigured deployment can run with predictable secrets and seed a known admin password, creating straightforward compromise paths.
**Evidence**:
```text
backend/app/config.py:17:     JWT_SECRET_KEY: str = "change-me"
backend/app/config.py:22:     DEFAULT_ADMIN_PASSWORD: str = "admin123"
backend/app/config.py:36:             if os.getenv("PRODUCTION") == "1":

backend/app/main.py:46:         if settings.DEFAULT_ADMIN_PASSWORD == "admin123":
backend/app/main.py:48:                 "Seeding default admin with insecure password 'admin123'. "
```
**Fix**: Refuse startup whenever JWT secret or default admin password is insecure unless an explicit local-dev override is set, and require operators to rotate them before first boot.

### H7 — Cookie-auth has no CSRF defense beyond `SameSite=lax`
**Severity**: Medium
**Area**: auth
**File**: `backend/app/utils/auth_cookies.py:29`, `backend/app/dependencies.py:36`
**Summary**: Mutating endpoints accept authentication from HttpOnly cookies, but there is no CSRF token, Origin/Referer validation, or same-site request nonce. `SameSite=lax` helps against basic cross-site POSTs but does not close same-site or browser-extension attack paths.
**Impact**: If an attacker can run script in a same-site origin or extension context, authenticated state-changing requests can be replayed with victim cookies.
**Evidence**:
```text
backend/app/utils/auth_cookies.py:35:         "httponly": True,
backend/app/utils/auth_cookies.py:37:         "samesite": samesite,

backend/app/dependencies.py:36:     cookie_token = request.cookies.get(access_cookie_name(role))
backend/app/dependencies.py:37:     if cookie_token:
backend/app/dependencies.py:38:         return cookie_token
```
**Fix**: Add CSRF tokens or strict Origin/Referer checks for cookie-authenticated mutations, and consider `SameSite=strict` for admin surfaces.

### H8 — Logout does not invalidate issued JWTs
**Severity**: Medium
**Area**: auth
**File**: `backend/app/routers/admin_auth.py:46`, `backend/app/routers/admin_auth.py:93`, `backend/app/routers/staff_auth.py:149`, `backend/app/routers/staff_auth.py:244`
**Summary**: Logout only clears browser cookies; the backend does not track sessions or revoke refresh/access tokens. Refresh endpoints accept any still-valid signed token.
**Impact**: If a token leaks before logout, it remains usable until expiry. Logout is therefore local-browser cleanup, not server-side session termination.
**Evidence**:
```text
backend/app/routers/admin_auth.py:46: @router.post("/refresh", response_model=TokenResponse)
backend/app/routers/admin_auth.py:56:     data = decode_token(raw_refresh)
backend/app/routers/admin_auth.py:93: @router.post("/logout", response_model=MessageResponse)
backend/app/routers/admin_auth.py:95:     clear_auth_cookies(response, "admin")
```
**Fix**: Store refresh/session identifiers server-side, rotate on refresh, and revoke them on logout or password reset.

### H9 — Admin and staff login endpoints have no brute-force throttling
**Severity**: Medium
**Area**: auth
**File**: `backend/app/routers/admin_auth.py:19`, `backend/app/routers/staff_auth.py:124`
**Summary**: Admin and staff login handlers perform direct password verification with no per-IP or per-account rate limit. The codebase already applies a dedicated rate limit to PIN verification, so the gap is specific to login.
**Impact**: Internet-facing login endpoints are exposed to password spraying and credential-stuffing attempts.
**Evidence**:
```text
backend/app/routers/admin_auth.py:25:     admin = await db.admins.find_one({"username": payload.username})
backend/app/routers/admin_auth.py:26:     if not admin or not verify_password(payload.password, admin["password_hash"]):

backend/app/routers/staff_auth.py:130:     staff = await db.staff_users.find_one({"username": payload.username})
backend/app/routers/staff_auth.py:131:     if not staff or not verify_password(payload.password, staff["password_hash"]):
```
**Fix**: Add per-IP and per-account throttling, temporary lockout, and audit logging for repeated login failures.

### H10 — High-impact mutation endpoints still accept raw `dict` payloads
**Severity**: Medium
**Area**: api
**File**: `backend/app/routers/user_flow.py:342`, `backend/app/routers/finance.py:143`, `backend/app/routers/claims.py:98`
**Summary**: Many money/auth/business-critical handlers still accept `payload: dict` instead of a Pydantic model with `extra="forbid"`. Validation is therefore ad hoc and inconsistent.
**Impact**: Type confusion, silent coercion, and undocumented fields can slip into request handling, increasing the chance of correctness bugs and authorization bypass mistakes during future edits.
**Evidence**:
```text
backend/app/routers/user_flow.py:342: async def verify_phone(payload: dict, request: Request, db: AsyncIOMotorDatabase = Depends(get_db)):
backend/app/routers/user_flow.py:490: async def complete(payload: dict, request: Request, background_tasks: BackgroundTasks, ...)
backend/app/routers/user_flow.py:659: async def pin_verify(payload: dict, request: Request, db: AsyncIOMotorDatabase = Depends(get_db)):
backend/app/routers/finance.py:144: async def manual_settle(payload: dict, admin: dict = Depends(get_current_admin), ...)
backend/app/routers/claims.py:98:     payload: dict,
```
**Fix**: Replace raw dict payloads with request schemas for all mutating endpoints, and set `extra="forbid"` to lock the API contract.

### H11 — Public staff registration is always exposed and has no captcha gate
**Severity**: Medium
**Area**: api
**File**: `frontend/src/app/(auth)/staff-login/page.tsx:82`, `frontend/src/app/(auth)/staff-register/page.tsx:32`, `backend/app/routers/staff_auth.py:178`
**Summary**: The frontend always advertises public registration, and the backend accepts public registration directly. There is no `staff_register_enabled` switch and no captcha or equivalent challenge.
**Impact**: Attackers can automate public application spam, consume reviewer time, and enumerate invite-code existence without any operator-controlled kill switch.
**Evidence**:
```text
frontend/src/app/(auth)/staff-login/page.tsx:82:               <a href="/staff-register" className="text-primary font-bold hover:underline">Register here</a>
frontend/src/app/(auth)/staff-register/page.tsx:32:       await api.post("/api/auth/staff/register", {
backend/app/routers/staff_auth.py:178: @router.post("/register", response_model=MessageResponse)
```
**Fix**: Add docx-aligned settings for registration enable/captcha enable, enforce them server-side, and add abuse controls before exposing the page publicly.

### H12 — External reward-code check leaks claimant phone to API-key holders
**Severity**: Low
**Area**: data
**File**: `backend/app/routers/external.py:27`
**Summary**: The reward-code check endpoint returns the claimant phone number and creation timestamp. The endpoint is API-key protected, but the response still exposes more PII than is required to check code validity.
**Impact**: Any partner or operator with API-key access can enumerate reward codes and retrieve claimant phone data, increasing blast radius if a key is over-shared or leaked.
**Evidence**:
```text
backend/app/routers/external.py:27:     return {
backend/app/routers/external.py:29:         "status": rc.get("status", "unknown"),
backend/app/routers/external.py:31:         "phone": rc.get("phone", ""),
backend/app/routers/external.py:32:         "created_at": rc["created_at"].isoformat() if rc.get("created_at") else None,
```
**Fix**: Return only existence/status by default, mask phone data, and scope external API keys per partner or endpoint.

## 5. Roll-up Recommendations

### 5.1 Must-fix before v2.5 ship
- Enforce live-QR invalidation against current staff state: disabled, paused, frozen, and not-started workers must fail at PIN/session entry, not only on token expiry.
- Make commission availability consistent with redemption state, or implement the missing `核销后入账` setting and enforce it across commission, settlement, and withdrawal calculations.
- Make withdrawal-request creation atomic to prevent balance oversubscription on concurrent submissions.
- Remove hard-coded SMS credentials from source, rotate any exposed values, and refuse insecure JWT/admin defaults by default.
- Add the missing docx configuration items and version surface that materially affect behavior: registration enable/captcha, “must start work,” fixed-link compatibility, and `/_version`.

### 5.2 Recommended for v2.5
- Add CSRF protection for cookie-authenticated mutations and login throttling for admin/staff auth.
- Replace raw `dict` request bodies with Pydantic request models on money/auth endpoints.
- Enforce device binding across all session-gated endpoints, not only `/complete`.
- Persist a dedicated success/result context if the product requirement is to re-open the success page independently of sessionStorage.

### 5.3 Defer to v2.6
- Backfill Section F field parity where the implementation currently uses related collections or computed fields instead of docx-named fields (`staff_users`, `otp_records`, `promo_sessions`).
- Normalize settings discovery into a single authoritative schema so seeded keys, validators, admin UI, and docx naming cannot drift.

### 5.4 Verdict
Single line: **HOLD**
