# v2.5-rc Audit — Part B

## 1. Section C Compliance

| # | Requirement | Status | Evidence | Note |
|---|---|---|---|---|
| C1 | 3 位 Live PIN 校验页 | ✅ | `frontend/src/app/(user)/pin/[code]/page.tsx:123`; `backend/app/routers/user_flow.py:658` | Dedicated PIN page plus `/api/claim/pin/verify` backend. |
| C2 | 一次性验证/过期/锁定/轮换/版本校验 | ⚠ | `backend/app/routers/promoter.py:389`; `backend/app/routers/user_flow.py:687` | One-time use, expiry, lockout, and QR rotation exist; server does not actually validate the `v` query parameter, so explicit QR-version checking is incomplete. |
| C3 | 签名链接 + 一次性会话 + 有效期 + 绑定首次设备 | ✅ | `backend/app/utils/live_token.py:9`; `backend/app/routers/promoter.py:413`; `backend/app/routers/user_flow.py:727` | QR link carries HMAC token, PIN success opens expiring `promo_sessions`, and session stores first device fingerprint. |
| C4 | 会话用过不可重复 + 拦截版本/链接/设备 | ⚠ | `backend/app/routers/user_flow.py:115`; `backend/app/routers/user_flow.py:518`; `backend/app/routers/user_flow.py:638` | Expired sessions and device mismatch are blocked, and session is consumed after claim; however session is not invalidated on QR-version refresh and can be reused before final claim. |
| C5 | +63 前缀 + 本地号 + 更改手机号重发 | ❌ | `frontend/src/app/(user)/wheel/[code]/otp-claim-card.tsx:80`; `frontend/src/app/(user)/wheel/[code]/otp-claim-card.tsx:86`; `backend/app/routers/user_flow.py:135` | UI shows only `+` and placeholder `639171234567`, not fixed `+63` with local-number-only input; after OTP is sent the phone field is disabled, so “change number then resend” is missing. |
| C6 | OTP 冷却/日限/IP窗口限/流程最大/输错次数 | ⚠ | `backend/app/routers/user_flow.py:355`; `backend/app/routers/user_flow.py:369`; `backend/app/routers/user_flow.py:379`; `backend/app/routers/user_flow.py:454` | Cooldown, per-phone window limit, per-IP window limit, and max wrong attempts exist; no clear per-flow max-send cap, and `phone_daily_limit` is implemented as a 10-minute rolling window rather than daily. |
| C7 | 测试模式演示码 + 正式模式真实短信 | ✅ | `backend/app/routers/user_flow.py:411`; `backend/app/utils/sms.py:46` | Demo code is returned when `sms_verification` is off; real HTTP SMS send path is used when on. |
| C8 | 成功页复制/打开网站/下载图片（含二维码） | ⚠ | `frontend/src/app/(user)/result/[id]/page.tsx:165`; `frontend/src/app/(user)/result/[id]/page.tsx:175`; `frontend/src/app/(user)/result/[id]/page.tsx:201` | Copy code, open website, and download image exist, but the generated card QR points to `/mock-redeem` instead of the partner jump URL required by the spec. |
| C9 | /mock-redeem 核销页面 | ✅ | `frontend/src/app/mock-redeem/page.tsx:8` | Demo redeem page is implemented at the required route. |

## 2. Section D Compliance

| # | Requirement | Status | Evidence | Note |
|---|---|---|---|---|
| D1 | POST /api/redeem/verify 只校验 | ❌ | `backend/app/routers/external.py:17`; `backend/app/main.py:178` | Only `GET /api/external/reward-code/{code}/check` exists; the required `POST /api/redeem/verify` endpoint is missing. |
| D2 | POST /api/redeem/claim 校验+核销 | ❌ | `backend/app/routers/external.py:36`; `backend/app/main.py:178` | Redemption exists only as `POST /api/external/reward-code/{code}/redeem`, not the required `POST /api/redeem/claim` contract. |
| D3 | X-API-Key 鉴权 + 后台可配 | ✅ | `backend/app/dependencies.py:92`; `backend/app/main.py:103`; `backend/app/routers/settings.py:19` | `X-API-Key` is enforced for external routes and the key lives in `system_settings`, editable through the admin settings API. |
| D4 | 指定网站奖自动生码 + 核销后 pending_redeem → unpaid | ✅ | `backend/app/routers/user_flow.py:604`; `backend/app/routers/user_flow.py:620`; `backend/app/routers/external.py:60` | Website-prize claims auto-generate reward codes and start at `pending_redeem`; successful redeem moves the linked claim to `unpaid`. |
| D5 | 核销不可重复 + 员工日上限冻结 | ⚠ | `backend/app/routers/external.py:45`; `backend/app/routers/claims.py:139` | Repeat redeem is blocked by `status: assigned -> redeemed`, but no automatic per-staff daily redeem cap or freeze logic was found; only manual admin freeze exists. |

## 3. Section E Compliance

| # | Requirement | Status | Evidence | Note |
|---|---|---|---|---|
| E1 | 奖励码导入（粘贴+txt/csv）+ 筛选 + 作废 + 统计 | ⚠ | `backend/app/routers/reward_codes.py:40`; `backend/app/routers/reward_codes.py:83`; `backend/app/routers/reward_codes.py:124` | CSV upload, basic filters, and manual block/unblock exist; no txt import, no paste-text workflow/UI, and no today/history assignment-redemption stats endpoints were found. |
| E2 | 领取记录字段（promo_session_id/设备/码/结算） | ⚠ | `backend/app/routers/user_flow.py:615`; `backend/app/routers/claims.py:17`; `frontend/src/types/index.ts:68` | Claim records include `device_fingerprint`, `reward_code`, and `settlement_status`, but the claim document and serializers do not store or expose `promo_session_id`. |
| E3 | 结算状态枚举完整 | ✅ | `frontend/src/types/index.ts:66`; `frontend/src/app/(admin)/claims/page.tsx:7` | `pending_redeem / unpaid / paid / cancelled / frozen` are all defined and surfaced in admin filters/UI. |
| E4 | "核销后入账"开关 + 延后计佣 | ⚠ | `backend/app/routers/user_flow.py:620`; `backend/app/routers/external.py:60`; `backend/app/services/withdrawals.py:34`; `backend/app/routers/promoter.py:91` | Website claims stay `pending_redeem` until external redeem, so claim-settlement APIs delay payout; however there is no configurable toggle, and promoter available balance/withdrawal math still counts approved commission logs before redeem. |
| E5 | 层次/冲单按日统计 + 管理员统一结算 | ❌ | `backend/app/routers/bonus.py:220`; `backend/app/routers/bonus.py:238`; `backend/app/schemas/bonus.py:45`; `frontend/src/app/bonus/admin-records-tab.tsx:76` | Daily bonus records and summary reads exist, but no admin unified settlement action/writer was found, settlement time is absent from bonus responses, and `team_reward` remains milestone-based rather than daily settlement stats. |

## 4. Wave 3 A3 Regression — money cents migration (commit 408e755)

### 4.1 Dual-write audit — every money write

Grep `backend/app/` for every `.insert_one(` and `.update_one(` / `.update_many(` / `find_one_and_update` that touches money. For each, verify it writes BOTH `amount: float` AND `amount_cents: int` (or equivalent for claim `commission_amount`, bonus `total_bonus`, finance `amount_change`, stats `total_commission`). Tabulate:

| File:Line | Collection | Legacy key | Cents key | Both written? |
|---|---|---|---|---|
| `backend/app/routers/user_flow.py:621` | claims | commission_amount | commission_amount_cents | ❌ |
| `backend/app/services/commission.py:50` | commission_logs | amount | amount_cents | ✅ |
| `backend/app/services/commission.py:53` | staff_users.stats | stats.total_commission | stats.total_commission_cents | ✅ |
| `backend/app/services/commission.py:122` | claims | commission_amount | commission_amount_cents | ✅ |
| `backend/app/services/bonus.py:191` | bonus_claim_records | amount | amount_cents | ✅ |
| `backend/app/services/bonus.py:204` | commission_logs | amount | amount_cents | ✅ |
| `backend/app/services/bonus.py:221` | staff_users.stats | stats.total_commission | stats.total_commission_cents | ✅ |
| `backend/app/services/team_reward.py:43` | team_rewards | amount | amount_cents | ✅ |
| `backend/app/services/team_reward.py:46` | commission_logs | amount | amount_cents | ✅ |
| `backend/app/services/team_reward.py:62` | staff_users.stats | stats.total_commission | stats.total_commission_cents | ✅ |
| `backend/app/services/withdrawals.py:131` | withdrawal_requests | amount | amount_cents | ✅ |
| `backend/app/services/withdrawals.py:212` | finance_action_logs | amount_change | amount_change_cents | ✅ |
| `backend/app/main.py:129` | staff_bonus_rules.tiers | tiers.amount | tiers.amount_cents | ✅ |
| `backend/app/routers/bonus.py:188` | staff_bonus_rules.tiers | tiers.amount | tiers.amount_cents | ✅ |

No app-side `insert_one`/`update_*` writer for `daily_bonus_settlements` was found in `backend/app/`.

### 4.2 Aggregation audit

Grep for `"$amount"` (double quotes, no `_cents`) anywhere in `backend/app/`. Any remaining aggregation that should have been swapped to `$amount_cents`? List file:line with context.

- `backend/app/routers/dashboard.py:22` still does `"$sum": "$amount"` over `commission_logs`; this should be cents-based plus `from_cents(...)` for consistency with A3.

### 4.3 Response serialization audit

Every API endpoint that returns money should emit `amount: float` (not only `amount_cents`). Spot-check serializers:
- `serialize_claim`
- `serialize_bonus_record`, `serialize_bonus_settlement`
- `serialize_commission_log`, `serialize_finance_log`
- `serialize_withdrawal_item`
- `serialize_promoter_commission`, `serialize_team_reward`
- `staff_performance` stats transformation
- `promoter/home` stats transformation

For each, confirm `amount: float` is present in the output (even if `amount_cents` also is).

| Target | Evidence | Float field present? | Note |
|---|---|---|---|
| `serialize_claim` | `backend/app/routers/claims.py:20` | ✅ | Emits `commission_amount` as float and keeps `commission_amount_cents`. |
| `serialize_bonus_record` | `backend/app/routers/bonus.py:124` | ✅ | Emits `amount` as float. |
| `serialize_bonus_settlement` | `backend/app/routers/bonus.py:139` | ✅ | Emits `total_bonus` as float. |
| `serialize_commission_log` | `backend/app/routers/finance.py:32` | ✅ | Emits `amount` as float and strips `amount_cents`. |
| `serialize_finance_log` | `backend/app/routers/finance.py:39` | ✅ | Emits `amount_change` as float and strips `amount_change_cents`. |
| `serialize_withdrawal_item` | `backend/app/services/withdrawals.py:160` | ✅ | Emits `amount` as float. |
| `serialize_promoter_commission` | `backend/app/routers/promoter.py:56` | ✅ | Rehydrates `amount` from `amount_cents`. |
| `serialize_team_reward` | `backend/app/routers/promoter.py:64` | ✅ | Rehydrates `amount` from `amount_cents`. |
| `staff_performance` stats transformation | `backend/app/routers/finance.py:119` | ✅ | Recomputes `stats.total_commission` float from cents and also emits float `paid_amount/pending_amount/total_bonus`. |
| `promoter/home` stats transformation | `backend/app/routers/promoter.py:83`; `backend/app/routers/promoter.py:101` | ✅ | `today.commission`, `settlement.*`, and `staff.stats.total_commission` are all float outputs. |

### 4.4 Leftover float math

Search for risky patterns in money code paths:
- `round(.., 2)` on money
- `1e-9` epsilon comparisons
- `float(amount)` on what should be cents
- `* 0.3`, `* 0.1`, `* 1.0` on money floats (now that rates are applied to cents)

Report any remaining occurrences in `services/` or `routers/`.

None found with the requested searches in `backend/app/services` and `backend/app/routers`.

### 4.5 Seed correctness (potential bug)

`backend/app/main.py::seed_settings` now writes team_reward values in cents:
```
"team_reward_100": 30000  # 300 PHP
"team_reward_1000": 50000 # 500 PHP
"team_reward_10000": 100000 # 1000 PHP
```

`backend/app/services/team_reward.py::check_team_rewards` reads these via `to_cents(raw_amount)` which multiplies by 100. **Question**: on a fresh install, does this produce 30000 cents (= ₱300) or 30000 * 100 = 3_000_000 cents (= ₱30_000)?

Trace the logic carefully: `get_setting` returns the raw value (30000 int). `to_cents(30000)` = `int(round(float(30000) * 100))` = 3_000_000. So on fresh install the tier amount is ₱30,000 not ₱300 — **this looks like a bug**. Verify by reading both files and confirming.

If confirmed, write it as a **High** finding. If a guard exists (e.g., check if value is already cents), explain where.

Similarly check: `promoter/team_rewards` endpoint reads the same setting and does `to_cents(raw_amount)` — same bug path. Verify.

- High: confirmed bug. `backend/app/main.py:98` seeds `team_reward_100 = 30000` as cents, but `backend/app/services/team_reward.py:75` calls `to_cents(await get_setting(...))`, so fresh-install values become 100x too large (`30000 -> 3_000_000` cents). No guard for “already in cents” exists.
- High: same bug path is present in the read API. `backend/app/routers/promoter.py:345` reads the raw setting and `backend/app/routers/promoter.py:346` runs `to_cents(raw_amount)`, so the promoter-facing milestone amounts are also inflated 100x on fresh installs.

### 4.6 Migration script correctness

- `backend/scripts/migrate_money_to_cents.py` — does `sys.path.insert(0, Path(__file__).resolve().parents[1])` correctly make `app.database` importable when run as `python -m backend.scripts.migrate_money_to_cents`? (The script sits at `backend/scripts/`, so `parents[1]` is `backend/` — and `app/` is inside that. Should work.) Confirm or identify fix.
- Idempotency: re-running without `--force` skips docs that already have `*_cents`. Good.
- Verification pass at the end — does it correctly detect missing cents? Confirm.

- Confirmed: `backend/scripts/migrate_money_to_cents.py:19` prepends the `backend/` directory to `sys.path`, so `from app.database import ...` resolves correctly for `python -m backend.scripts.migrate_money_to_cents`.
- Confirmed: idempotency is implemented. `backend/scripts/migrate_money_to_cents.py:46`, `backend/scripts/migrate_money_to_cents.py:64`, and `backend/scripts/migrate_money_to_cents.py:93` all skip docs/tiers that already have cents unless `--force` is passed.
- Confirmed: the verification pass is meaningful. `backend/scripts/migrate_money_to_cents.py:112` checks every target collection plus `staff_users.stats` and `staff_bonus_rules.tiers` for missing cents fields.

### 4.7 Pydantic response-model mismatch

The A3 prompt kept response schema `amount: float` unchanged. But the serializer includes extra keys (`amount_cents`, `commission_amount_cents`). Pydantic response_model by default will filter extras. Check whether any endpoint uses `response_model=` that would drop the new `*_cents` fields — is this intentional? (If yes, Low finding about forward-compat leak; if no, Medium.)

Specifically check:
- `@router.get("/rules", response_model=BonusRuleListResponse)` in bonus.py
- `staff-performance response_model=PageResponse` in finance.py (PageResponse.items is list[Any] — no filtering; fine)
- `bonus_claim_records response_model=BonusClaimRecordListResponse` — items are `BonusClaimRecordResponse` which declares `amount: float` only; `amount_cents` extra would be dropped. Check if OK.

Report observations (no need to recommend schema change — just flag).

Findings:

- Low: `backend/app/routers/bonus.py:150` returns `BonusRuleListResponse`, but `serialize_bonus_rule()` feeds `sorted_tiers()` objects that contain `amount_cents`; `backend/app/schemas/bonus.py:10` defines `BonusTier` with only `threshold` and `amount`, so the cents field is filtered out. This looks intentional for backward compatibility, but it prevents the new field from surfacing.
- None on `staff-performance`: `backend/app/routers/finance.py:101` uses `PageResponse`, and `backend/app/schemas/common.py:10` declares `items: list[Any]`, so extra money keys are preserved.
- `bonus_claim_records` is legacy-only rather than a runtime mismatch: `backend/app/routers/bonus.py:122` serializes only `amount`, and `backend/app/schemas/bonus.py:45` also only declares `amount`, so there is no extra-field drop there. The same “cents hidden by schema” pattern also applies to promoter bonus tier outputs (`BonusTodayResponse` / `BonusTier`).

## 5. Summary for Part B

- Section C: Done 4 / Partial 4 / Missing 1
- Section D: Done 2 / Partial 1 / Missing 2
- Section E: Done 1 / Partial 3 / Missing 1
- A3 regression findings: 4; top 3 are the fresh-install `team_reward_*` 100x inflation bug, missing `commission_amount_cents` on initial `claims.insert_one`, and the leftover dashboard `$amount` aggregation
- Top 3 concerns: fresh installs overpay/display team rewards by 100x; required `/api/redeem/verify` and `/api/redeem/claim` contracts are missing; website-prize commissions still appear in promoter available balance before external redeem
