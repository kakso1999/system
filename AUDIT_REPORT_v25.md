# v2.5-rc Audit Report — Consolidated

**Date**: 2026-04-21
**Base commit**: `408e755` (v2.5 Waves 1–3 merged, not pushed)
**Method**: 3 parallel read-only Codex audits (Parts A/B/C) cross-referenced against client docx `4.17补充(1).docx` (sections A–H) + focused regression probe of Waves 1–3
**Raw parts**: `AUDIT_PART_A.md`, `AUDIT_PART_B.md`, `AUDIT_PART_C.md`

---

## 1. Executive Summary

**Verdict: HOLD.** The three v2.5 wave refactors (A1 H4/M1/M4, A2 HttpOnly cookies, A3 money cents) all landed cleanly — **zero regressions** found in A1/A2, and only two correctness bugs in A3. However, the cross-cutting audit against the client's 4.17 docx and the entire codebase surfaced **7 High-severity issues** that must be fixed before ship, including a fresh-install team-reward 100x overpay bug, website-prize commission leaking to withdrawable balance before redemption, a non-atomic withdrawal race, hard-coded SMS credentials in source, and unsafe JWT/admin defaults outside `PRODUCTION=1`.

**Finding counts**: H = 7 · M = 7 · L = 3

**Compliance vs 4.17 docx**:

| Section | Done | Partial | Missing |
|---|---|---|---|
| A. 管理后台 | 2 | 8 | 4 |
| B. 地推员前台 | 0 | 7 | 3 |
| C. 用户领奖端 | 4 | 4 | 1 |
| D. 兑奖接口 | 2 | 1 | 2 |
| E. 奖励码/结算 | 1 | 3 | 1 |
| F. 数据表/字段 | — | many partials | many fields missing on staff_users, otp_records |
| G. 系统配置 | ~19 | — | 5 key toggles missing |
| H. 业务规则 | 1 | 3 | 1 |

**Top 3 concerns**:
1. **Money correctness** — fresh-install team_reward fires at 100x, and website-prize commissions credit the withdrawable balance before external redeem, both directly contradicting client spec.
2. **QR invalidation gaps** — PIN verification doesn't check staff `disabled / paused / risk_frozen / not_started_promoting`, so paused-promoter QRs keep working until expiry.
3. **Admin-control surface** — no admin pause/resume, no per-promoter control switches (QR on/off, signed-link on/off, daily limits, risk-freeze, payout account), and no unified "业绩 + 奖励" merge-settle UI.

---

## 2. Regression Audit — v2.5 Waves 1–3

### Wave 1 (A1 — `2d3a258`) — H4/M1/M4
- PIN redirect: sessionStorage only, no URL query anywhere. ✅
- `welcome` endpoint: `session_token` query param removed, `X-Session-Token` header only. ✅
- Wheel upload: `validate_image_upload` + magic-byte sniff + 2MB cap. ✅
- `otp_reservations`: TTL + unique(phone, bucket) indexes live. ✅
- **Findings: 0**

### Wave 2 (A2 — `01f540d`) — HttpOnly cookies dual-mode
- Backend: cookie-first auth + Bearer fallback; `COOKIE_ONLY_AUTH=True` correctly disables Bearer. ✅
- Logout endpoints exist for both roles. ✅
- Refresh accepts cookie or body. ✅
- CORS `allow_credentials=True` + explicit origin list (no `*`). ✅
- Frontend: `withCredentials: true`, `auth.ts` free of `js-cookie`, compat shims return `undefined`. ✅
- Must-change-password modal no longer manually sets Authorization. ✅
- Dual-mode lets legacy Bearer clients keep working. ✅
- **Findings: 0** (note: 4 security concerns tracked in Section 3 below are new architectural risks, not Wave 2 regressions)

### Wave 3 (A3 — `408e755`) — money float → int cents
Every service-layer money write dual-writes `amount` + `amount_cents`. All aggregations converted to `$sum: "$amount_cents"`. Serializers emit float `amount` for API compat. Migration script is idempotent and path-resolves correctly.

**Findings: 3** (all listed in Section 3).

---

## 3. Findings (by severity, across all sources)

### H1 — `team_reward` setting treated as float PHP but seeded as cents → 100× overpay on fresh install
**Severity**: High
**Area**: money
**File**: `backend/app/main.py:97–101`; `backend/app/services/team_reward.py:75`; `backend/app/routers/promoter.py:345–346`
**Summary**: Wave 3 changed `seed_settings()` to write `team_reward_100=30000, team_reward_1000=50000, team_reward_10000=100000` as *cents*, but the readers still call `to_cents(raw_amount)` which multiplies by 100 again. Fresh-install tier amount becomes ₱30 000 instead of ₱300.
**Impact**: Any new deployment awards 100× the intended team reward. Existing deployments with legacy values (300/500/1000 in PHP) work correctly via the same `to_cents()` path — the bug only hits fresh installs. Same inflated number is also shown in the promoter `/team-rewards` UI.
**Fix** (pick one, apply consistently):
- A: Revert seed values to PHP and keep `to_cents()` in readers (`300 / 500 / 1000`).
- B: Drop `to_cents()` in `check_team_rewards` and `team_rewards` endpoint, treat the setting as authoritative cents, and add a migration to multiply existing deployments' values by 100.

### H2 — Claim insert skips `commission_amount_cents` on first write
**Severity**: High
**Area**: money
**File**: `backend/app/routers/user_flow.py:617–627`
**Summary**: `complete()` inserts a claim with `commission_amount: 0.0` but no `commission_amount_cents: 0`. `calculate_commissions()` later adds the cents field via `update_one`, but during the gap any read via `read_cents(claim)` falls back to `int(round(float(0.0) * 100)) = 0` — correct by accident, but the dual-write contract is broken.
**Impact**: Low in practice (zero fallback matches zero cents), but any future code path that reads the freshly inserted claim and expects `amount_cents` to be present (e.g., admin "cancel unprocessed claim") will observe missing-field states and could drift. Violates the A3 invariant that "every money write dual-writes both fields".
**Fix**: Add `"commission_amount_cents": 0,` alongside `"commission_amount": 0.0,` in the insert dict at `user_flow.py:621`.

### H3 — Website-prize commissions credit withdrawable balance before external redeem
**Severity**: High
**Area**: money / business-rule
**File**: `backend/app/routers/user_flow.py:620`; `backend/app/services/commission.py:46`; `backend/app/services/withdrawals.py:34–36`
**Summary**: Website prizes set the claim's `settlement_status` to `pending_redeem`, but `calculate_commissions` still writes the commission log with `status="approved"` immediately. The withdrawal balance snapshot sums commission logs where `status == "approved"`, so the promoter can withdraw commissions that were never externally redeemed.
**Impact**: Directly violates "核销后入账" rule in the docx. Payout leakage risk: if a campaign is abandoned mid-flow, promoter cashes out commissions for codes that were never consumed by the partner site. High financial-reconciliation risk.
**Fix**: Add `commission_after_redeem` system setting (Section G missing item). When `website`-type claim + setting on → `create_commission_log` should write `status="pending_redeem"` (or skip entirely); `/api/external/reward-code/{code}/redeem` should flip the matching commission logs to `approved` at the same time it flips claim to `unpaid`.

### H4 — Withdrawal creation is not atomic (race → oversubscription)
**Severity**: High
**Area**: money
**File**: `backend/app/services/withdrawals.py:103–131`
**Summary**: `create_withdrawal_request` reads the available-balance snapshot, then inserts a new withdrawal doc. The two ops are not transactional. Two concurrent requests from the same promoter can both pass the `amount_cents > available_cents` check and both insert.
**Impact**: A promoter submitting two withdrawals in parallel (fast tap, browser double-click, scripted) can drain more than their approved balance. Causes negative availability + manual reconciliation work.
**Fix**: Use MongoDB transaction (`with await client.start_session()` + `session.with_transaction`), or implement a compare-and-set reservation pattern (insert a "reservation" doc with unique token, verify balance minus open reservations, then commit/insert).

### H5 — SMS provider credentials hard-coded in `seed_settings`
**Severity**: High
**Area**: config / supply-chain
**File**: `backend/app/main.py:74–80`
**Summary**: `seed_settings()` ships concrete values for `sms_api_url`, `sms_appkey=9N9Q8M`, `sms_appcode=1000`, `sms_appsecret=wW3mjj` directly in source control. If those are real partner credentials, they are now leaked in the repo history forever. If placeholders, they may end up in production unchanged.
**Impact**: Potential unauthorized SMS sending at partner expense; attribution/audit trail pollution; startup with known-bad creds.
**Fix**: Remove the concrete values from `seed_settings()`, leave empty strings. Refuse startup (or visibly warn with a `WARNING` at boot) if `sms_verification=True` and `sms_appkey`/`sms_appsecret` are empty. Rotate the leaked creds with the SMS provider. Document in `.env.example` that these must be set per environment.

### H6 — Insecure JWT secret & admin password allowed outside `PRODUCTION=1`
**Severity**: High
**Area**: auth / config
**File**: `backend/app/config.py:17, 22, 28–42`; `backend/app/main.py:46–50`
**Summary**: `JWT_SECRET_KEY` defaults to `"change-me"` and `DEFAULT_ADMIN_PASSWORD` defaults to `"admin123"`. The only startup gate is `if os.getenv("PRODUCTION") == "1"`. Any deployment that forgets this env var boots with the defaults (a warning is logged but boot continues).
**Impact**: Predictable JWT signing key + known admin password = trivial compromise path for any non-prod-flagged deployment, which easily ends up internet-reachable during staging or a demo.
**Fix**: Flip the default-refuse logic. Boot must fail unless either `JWT_SECRET_KEY` is changed from default or `ALLOW_INSECURE_JWT=1` is explicitly set (locally). Same for admin password. Force password rotation on first login regardless of env (already partially done via `must_change_password=True`, verify it fires for the seed path).

### H7 — Live QR/PIN verification does not re-check staff state (disabled / paused / frozen / not-started)
**Severity**: High
**Area**: auth / business-rule
**File**: `backend/app/routers/user_flow.py:683`
**Summary**: `pin_verify` validates token existence, expiry, PIN failures, and rotation — but never re-queries `staff_users` to check `status`, `work_status`, `promotion_paused`, or `risk_frozen`. Docx Section H explicitly says all of those must invalidate the QR immediately.
**Impact**: Admin pauses a promoter at 10:00 AM, but the promoter's 5-minute live-QR issued at 09:59 AM still serves claims until 10:04 AM. Or: staff is disabled mid-flow; prior-generated QRs keep working. Breaks the business-rule promise.
**Fix**: In `pin_verify`, after loading `staff`, check `status == "active"`, `work_status == "promoting"`, `promotion_paused == False`, and any risk-freeze flag; reject with a specific error code when any fails. Also rotate outstanding `promo_live_tokens` to `status=expired` inside the pause/disable handlers.

---

### M1 — `dashboard.py` aggregation still sums legacy `$amount`
**Severity**: Medium
**Area**: money
**File**: `backend/app/routers/dashboard.py:22`
**Summary**: Wave 3 flipped every other aggregation from `$amount` to `$amount_cents`, but the dashboard's "today total" pipeline was missed.
**Impact**: After migration, commission_logs have both `amount` and `amount_cents`; current dashboard still returns the float sum (which is still correct for migrated docs because dual-write). But new-only writes (post-migration, if we drop `amount` in v2.6) will break dashboard immediately. Also inconsistent with `promoter.py::home` which uses cents.
**Fix**: Change `{"$group": {"_id": None, "total": {"$sum": "$amount"}}}` → `"$amount_cents"` and wrap the result with `from_cents(...)`.

### M2 — Session device fingerprint only enforced at `/complete`, not at welcome/spin
**Severity**: Medium
**Area**: auth
**File**: `backend/app/routers/user_flow.py:108–132`, `:518`
**Summary**: `_require_active_session` checks staff_id and campaign_id but not device_fingerprint. Only `/complete` compares fingerprint. Any holder of a valid session token can open welcome and spin from another device; only the final claim step blocks them.
**Impact**: If a session token leaks (e.g., copy/paste from URL), an attacker can proceed through the funnel and only fail at claim. Information leak (see prize list, attempt flow). Client spec in Section H says "非原设备继续使用同一会话时会被拒绝" — should apply at all stages.
**Fix**: Pass the claimed device_fingerprint to `_require_active_session` and compare there; pull it from header or request body uniformly.

### M3 — Cookie-auth lacks CSRF defense beyond `SameSite=lax`
**Severity**: Medium
**Area**: auth
**File**: `backend/app/utils/auth_cookies.py:29–40`
**Summary**: Wave 2 moved auth into HttpOnly cookies with `SameSite=lax`. There is no CSRF token, no Origin/Referer enforcement on mutating endpoints, and admin surfaces do not use `SameSite=strict`.
**Impact**: `lax` closes most cross-site POST attacks but does not protect against same-site (subdomain takeover, browser extension on same site, hosted content with script injection). For an admin mutation surface this is still a gap.
**Fix**: Either: (a) issue a CSRF token cookie + matching request header on all POST/PUT/DELETE to admin/finance endpoints; or (b) enforce strict Origin header check against `CORS_ORIGINS` on all cookie-authenticated mutations. Consider `SameSite=strict` for admin cookies only.

### M4 — Logout only clears browser cookies, does not revoke JWTs server-side
**Severity**: Medium
**Area**: auth
**File**: `backend/app/routers/admin_auth.py:93–96`; `backend/app/routers/staff_auth.py:244–247`
**Summary**: The `/logout` endpoint clears cookies but does not invalidate the JWT. If an access token leaked before logout, it continues to be accepted until its natural expiry. No refresh-token blacklist, no session registry.
**Impact**: Moderate — JWT leakage is uncommon with HttpOnly cookies, but logout should revoke, not just forget. Also a risk on shared-computer or compromised-browser scenarios.
**Fix** (two options):
- Simple: keep a `revoked_tokens` collection with TTL = refresh-token expiry; reject any JWT whose jti matches.
- Robust: replace JWT with opaque random session id stored in MongoDB; logout deletes the record.

### M5 — No brute-force throttle on admin/staff login
**Severity**: Medium
**Area**: auth
**File**: `backend/app/routers/admin_auth.py:19`; `backend/app/routers/staff_auth.py:124`
**Summary**: PIN verify has a dedicated 20-reqs-per-minute rate limit (via `risk_logs`), but login does not. Password spraying across all admin usernames is un-gated.
**Impact**: Standard credential-stuffing exposure for any internet-facing deployment.
**Fix**: Mirror the PIN rate-limit pattern: count failed admin/staff login attempts per IP + per username in the last N minutes; throttle/lockout past threshold; log the events to `risk_logs` for observability.

### M6 — Mutating endpoints still accept raw `dict` payloads
**Severity**: Medium
**Area**: api / correctness
**File**: `backend/app/routers/user_flow.py:342, 490, 659`; `backend/app/routers/finance.py:143`; `backend/app/routers/claims.py:98`
**Summary**: Money/auth-critical handlers (`verify_phone`, `complete`, `pin_verify`, `manual_settle`, `cancel_claim`) take `payload: dict` instead of a typed Pydantic model with `extra="forbid"`. Validation is ad-hoc via `.get(...)`.
**Impact**: Type confusion, silent acceptance of unknown fields, harder-to-audit contracts. No immediate security bug found, but brittle. Every future change risks a regression.
**Fix**: Define a request schema per handler, use `Depends()` or `payload: SpinPayload` in signatures, set `model_config = ConfigDict(extra="forbid")`.

### M7 — Public staff registration has no toggle / captcha
**Severity**: Medium
**Area**: api / spam
**File**: `frontend/src/app/(auth)/staff-register/page.tsx:32`; `backend/app/routers/staff_auth.py:178`
**Summary**: Section G requires `地推注册入口开关` and `地推注册验证码开关`; both settings are missing. `/api/auth/staff/register` is always open and has no captcha/CAPTCHA-like challenge. Registration spam would waste reviewer time and enumerate invite codes.
**Impact**: Operational — spam / noise in the review queue. Mild enumeration risk on invite codes.
**Fix**: Add the two missing settings. Gate the endpoint on `staff_register_enabled` server-side; hide the link in frontend when off. Add a simple math/image captcha (or reCAPTCHA v3) controlled by `staff_register_captcha`.

---

### L1 — `BonusRuleListResponse` schema filters out `amount_cents` from tier responses
**Severity**: Low
**Area**: api
**File**: `backend/app/schemas/bonus.py:10`; `backend/app/routers/bonus.py:150`
**Summary**: `BonusTier` declares only `threshold` and `amount`; `sorted_tiers()` returns dicts with `amount_cents` but pydantic `response_model` strips extras. Forward-compat signal is lost on this endpoint.
**Impact**: Cosmetic — frontend doesn't currently read `amount_cents`, so no breakage. Means v2.6 cannot gracefully migrate to cents-only on this endpoint without a schema bump.
**Fix**: Add `amount_cents: int` to `BonusTier` (or switch `response_model` to the dict path). Defer to v2.6 unless frontend opts in.

### L2 — External reward-code check returns full claimant phone
**Severity**: Low
**Area**: data / PII
**File**: `backend/app/routers/external.py:27–32`
**Summary**: `GET /api/external/reward-code/{code}/check` returns the claimant phone in full plus `created_at`. Endpoint is X-API-Key protected, but the response is more than a validity check needs.
**Impact**: Partner-key scope/blast-radius: a leaked API key exposes claimant PII beyond what's needed for code-validity checks.
**Fix**: Return `{code, status, expires_at}` only; drop or mask `phone` (`+63***4567`). If the partner really needs the phone, add an explicit per-key scope flag.

### L3 — Large compliance gap against Section F field inventory
**Severity**: Low (individually — aggregate is Medium)
**Area**: schema / feature
**File**: multiple `backend/app/...`
**Summary**: Client docx enumerates fields that aren't present in the code:
- `staff_users`: `payout_method`, `payout_account_name/number/notes`, `can_generate_qr`, `can_use_signed_link`, `allow_static_link`, `must_start_work`, `risk_frozen`, `daily_claim_limit`, `daily_redeem_limit`, `last_logout_at`, `is_online` (stored).
- `claims`: `promo_session_id`.
- `otp_records`: `promo_code`, `flow_token`, `send_status`, `send_mode`, `send_error`, `last_attempt_at` (and naming mismatches: `ip` vs `ip_address`, `attempts` vs `verify_attempts`).
- `staff_registration_applications`: `source_ip`.
- `promo_sessions`: explicit `is_used` boolean (currently inferred from `status`).
**Impact**: Each missing field corresponds to an unimplemented feature on the admin control surface (see Section A gaps — A13 especially). Some (like `promo_session_id` on claims) would enable richer audit trails.
**Fix**: Batch these into a v2.6 "Section F field backfill" mini-wave. Prioritize by feature demand — `promo_session_id` on claims is the most useful audit trail addition.

---

## 4. Compliance Gap Summary (docx ↔ code)

### Section A — 管理后台 (Done 2 / Partial 8 / Missing 4)

**Must-fix for v2.5**:
- **A10 Missing**: admin pause/resume promotion endpoint + button. Currently only promoter self-pause exists. Tied to H7 — pausing must also invalidate live QRs.
- **A13 Missing**: staff edit page is a basic profile form. All the control switches (QR toggles, signed-link toggle, static-link toggle, must-start-work, risk_frozen, daily_claim_limit, daily_redeem_limit, payout account fields) are absent.

**Should-fix**:
- A1 Partial: admin create form doesn't send `role`.
- A3 Partial: no "per 有效领取结算单价" setting.
- A7 Missing: "奖励管理视角" dashboard.
- A11 Missing: "员工推广记录" page (backend writes `promotion_activity_logs` but no admin view).
- A14 Partial: merge-settle (业绩 + 奖励) UI not implemented.

### Section B — 地推员前台 (Done 0 / Partial 7 / Missing 3)

**Must-fix**:
- **B8 Missing**: "Recent Claim Records" module on home.
- **B10 Missing**: pause/risk-freeze status banner + block "Start Promotion" button.

**Should-fix**:
- B1 Partial: confirm-password + register-captcha fields.
- B2 Missing: admin WhatsApp contact link on register page.
- B6 Partial: QR auto-rotate after successful PIN consumption (currently only manual refresh).
- B7 Partial: bonus counter includes all `success` claims, should filter to redeemed website codes only.

### Section C — 用户领奖端 (Done 4 / Partial 4 / Missing 1)

**Must-fix**:
- **C5 Missing**: fixed `+63` prefix with local-number-only input; "change number + resend OTP" flow.
- **C2 Partial**: server doesn't validate the `v` (QR version) query param.
- **C6 Partial**: `phone_daily_limit` is 10-min rolling not daily; no per-flow max-send cap.

### Section D — 兑奖接口 (Done 2 / Partial 1 / Missing 2)

**Must-fix**:
- **D1 Missing**: `POST /api/redeem/verify` endpoint — only `GET /api/external/reward-code/{code}/check` exists.
- **D2 Missing**: `POST /api/redeem/claim` endpoint — only `POST /api/external/reward-code/{code}/redeem` exists.

These are **contract mismatches** — client docs call for one shape, we ship another. Either (a) add thin aliases at the docx paths that delegate to existing endpoints, or (b) update client docs.

- **D5 Partial**: per-staff daily redeem cap + auto-freeze not implemented (only manual admin freeze).

### Section E — 奖励码/结算 (Done 1 / Partial 3 / Missing 1)

- **E1 Partial**: no `.txt` import, no paste-text UI, no today/history assignment-redemption stats.
- **E2 Partial**: `claims.promo_session_id` not stored.
- **E4 Partial**: "核销后入账" is not configurable, and current behavior doesn't actually delay commission. (Same as H3 above.)
- **E5 Missing**: no admin unified-settlement action for bonus records.

### Section F — 数据表/字段
See L3 above. Aggregate gap is a Medium-priority v2.6 cleanup.

### Section G — 系统配置 (19 seeded / 5 missing)
Missing settings: `staff_register_enabled`, `staff_register_captcha_enabled`, `must_start_work_before_qr`, `allow_static_link`, `commission_after_redeem` (+ `ip_rate_limit_enabled` as a toggle — currently only numeric limits).

### Section H — 业务规则
- **H2 Partial**: QR invalidation misses staff state. See H7 finding.
- **H3 Partial**: session device binding only at `/complete`. See M2 finding.
- **H4 Partial**: success context stored in sessionStorage + signed token — fine for "reopen success page" but frontend-dependent.
- **H5 Missing**: `/_version` endpoint. Easy add. Return `{version, waves: ["A1","A2","A3"], features: {cookie_only_auth, live_qr_enabled, ...}}`.

---

## 5. Roll-up Recommendations

### 5.1 Must-fix before tagging v2.5 (block ship)

Order by dependency:

1. **H1** — `team_reward` cents seed bug. One-line fix or revert. **~10 min.**
2. **H2** — Add `commission_amount_cents: 0` on claim insert. **~5 min.**
3. **M1** — `dashboard.py` aggregation `$amount` → `$amount_cents`. **~10 min.**
4. **H5** — Strip hard-coded SMS creds from `seed_settings()`, add startup warning. **~15 min + rotate creds externally.**
5. **H6** — Flip insecure-default logic: refuse boot unless explicitly overridden. **~20 min.**
6. **H7** — `pin_verify` must check staff state (status/work_status/paused/frozen). **~30 min.**
7. **H3 + G (核销后入账)** — Add `commission_after_redeem` setting + gate commission approval. **~2–3 hours** (touches commission service, external redeem router, withdrawal balance calc).
8. **H4** — Atomic withdrawal creation. **~1–2 hours** (transactional or reservation pattern).

**Estimated total: 4–7 hours** of focused work if done sequentially. Could parallelize H1/H2/M1/H5/H6 in a single Codex pass (independent small edits).

### 5.2 Recommended for v2.5 (ship-worthy improvements)

- **M2** — Session device binding on welcome/spin, not just `/complete`.
- **M3** — CSRF for cookie-authenticated mutations (token or strict Origin check).
- **M5** — Brute-force throttle on login.
- **M7** — `staff_register_enabled` + captcha toggle.
- **A10** — Admin pause/resume endpoint + UI button (also forces QR invalidation — ties to H7).
- **A13** — Staff edit page control switches (at minimum `risk_frozen`, `daily_claim_limit`, payout account fields).
- **H5 (/_version)** — Add `/_version` endpoint. 5 min.
- **D1/D2** — Add alias routes `POST /api/redeem/verify` + `POST /api/redeem/claim` (thin wrappers over existing external routes).

### 5.3 Defer to v2.6

- **M4** — Server-side JWT revocation (requires session registry rewrite).
- **M6** — Pydantic-ify all raw `dict` payloads (wide-touch refactor).
- **L1** — `BonusTier` schema bump for `amount_cents`.
- **L2** — External API PII minimization.
- **L3 / Section F** — Field backfill wave: add missing `staff_users`/`claims`/`otp_records` fields + features they enable.
- Compliance gaps in A7 (奖励管理视角), A11 (推广记录页), A14 (合并结算 UI), B7 (bonus counter filter), B8 (Recent Claims module), C5 (+63 prefix), C6 (phone_daily_limit semantics), E1 (txt import + stats), E5 (unified bonus settlement), G (remaining toggles).

### 5.4 Ship verdict

**HOLD for v2.5-rc.** After Section 5.1 fixes ship and smoke, re-tag as `v2.5-rc.2`, re-run a focused audit on the 5.1 diff, then tag `v2.5` + push.

Do **not** push the existing 79 commits (76 v2.4 + 3 v2.5 waves) to `origin/main` until at minimum H1 + H2 + M1 + H5 + H6 are fixed — those are correctness or security smells that ship to every new deployment.
