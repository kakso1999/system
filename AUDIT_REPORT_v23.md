# GroundRewards v2.3 Post-Ship Audit — 2026-04-21

## Scope
- Verify previous fix resolutions (C1/C3/C4/H2/H5/M1/M2) — see AUDIT_REPORT.md
- Audit v2.3 new code: F1/G1/H1/F2/G2/F3/G3/H2

## Summary
- Findings: 7 new findings
- Fix verifications: 5 passed / 0 regressed / 2 concerns

## Fix Verifications
### C1 — server-authoritative spin: _CONCERN_
`/complete` now consumes `spin_outcomes` and uses `outcome["wheel_item_id"]`, so the client no longer controls prize selection. `staff_id` and `campaign_id` are checked, but the atomic consume filter still matches only `spin_token` and `status`, so an expired or mismatched token is consumed before those checks run.

### C3 — default admin must_change_password: _PASS_
`seed_admin()` now sets `must_change_password=True` in both the legacy `update_many()` backfill and the seeded `insert_one()` path in `backend/app/main.py`. I did not find another admin-creation path that accidentally omits the field; `backend/app/routers/admins.py` sets it explicitly from the request payload.

### C4 — JWT fail-fast: _CONCERN_
`Settings._validate_secrets()` raises on `PRODUCTION=1` when `JWT_SECRET_KEY == "change-me"` and warns otherwise, so the exact default secret is covered. An explicitly empty `JWT_SECRET_KEY=\"\"` still bypasses that equality-only check and initializes `backend/app/utils/security.py` with an empty signing key.

### H2 — empty fingerprint reject: _PASS_
`pin_verify()` strips the fingerprint and rejects empty or whitespace-only values. `/complete` also strips and rejects empty or whitespace-only fingerprints whenever `live_qr_enabled=True` before comparing them against the stored session fingerprint.

### H5 — result_token: _PASS_
`/result/{claim_id}` now requires `result_token` and verifies it with an HMAC bound to the requested `claim_id` using `hmac.compare_digest()`. A token learned for claim A does not authorize claim B; rotating `JWT_SECRET_KEY` invalidates existing result tokens.

### M1 — reward_code rollback: _PASS_
The `DuplicateKeyError` branch in `/complete` now deletes the just-created `reward_codes` document by `_id` before returning the duplicate-claim response. Broader non-`DuplicateKeyError` insert failures can still orphan generated codes, but the specific previously-audited race is fixed.

### M2 — OTP campaign scope: _PASS_
`verify_otp()` now requires `campaign_id`, scopes the "latest OTP" lookup by `campaign_id`, and includes the same `campaign_id` in the atomic `find_one_and_update()` consume filter. I did not find a path that consumes another campaign's OTP record.

## New Findings in v2.3

### Critical
_(none)_

### High
### H1 — Bonus rule mutations are not restricted to super admins
- **Location:** `backend/app/routers/bonus.py:35`
- **Category:** auth
- **Problem:** The admin bonus router is guarded only by `get_current_admin`, so any active admin can create, overwrite, or delete bonus rules for arbitrary staff. That is broader authority than the rest of the admin-management surface and allows lower-privilege admins to change payout configuration.
- **Evidence:**
```python
router = APIRouter(dependencies=[Depends(get_current_admin)])

@router.post("/rules", response_model=BonusRuleResponse)
async def upsert_bonus_rule(...)

@router.delete("/rules/{rule_id}", response_model=SuccessResponse)
async def delete_bonus_rule(...)
```
- **Impact:** A non-super-admin can change bonus eligibility and payout rules for any promoter.
- **Fix:** Require `get_super_admin` for bonus-rule mutations, or add and enforce a narrower ownership policy per rule.

### H2 — Claim cancellation bypasses the new settlement state machine
- **Location:** `backend/app/routers/claims.py:92`
- **Category:** correctness | data-integrity
- **Problem:** `cancel_claim()` unconditionally writes `settlement_status="cancelled"` for any claim ID. Unlike `freeze` and `unfreeze`, it does not validate an allowed source state or use a compare-and-set filter.
- **Evidence:**
```python
updated = await db.claims.find_one_and_update(
    {"_id": oid},
    {"$set": {"settlement_status": "cancelled", "cancelled_at": datetime.now(timezone.utc), "cancel_reason": reason}},
    return_document=ReturnDocument.AFTER,
)
await db.commission_logs.update_many(
    {"claim_id": oid},
    {"$set": {"status": "cancelled", "cancelled_at": datetime.now(timezone.utc), "cancel_reason": reason}},
)
```
- **Impact:** Admins can cancel already-paid or otherwise terminal claims and rewrite finance history after settlement.
- **Fix:** Restrict cancel to explicit pre-terminal states and enforce that transition inside the update filter.

### H3 — Manual settlement is non-atomic across claims and commission logs
- **Location:** `backend/app/routers/finance.py:140`
- **Category:** concurrency | data-integrity
- **Problem:** `manual_settle()` first marks claims as `paid`, then separately marks `commission_logs` as `paid` without a transaction and without validating how many log rows changed. A partial failure between those writes leaves the claims ledger and commission ledger inconsistent.
- **Evidence:**
```python
claim_update_result = await db.claims.update_many(
    {"_id": {"$in": settle_claim_ids}, **unpaid_settlement_filter()},
    {"$set": {"settlement_status": "paid", "settled_at": now}},
)
if claim_update_result.modified_count != len(settle_claim_ids):
    raise HTTPException(status_code=409, detail="Settlement conflict, please retry")
await db.commission_logs.update_many(
    {"claim_id": {"$in": settle_claim_ids}, "status": "approved"},
    {"$set": {"status": "paid", "paid_at": now, "settled_by": admin.get("username", "admin")}},
)
```
- **Impact:** Finance screens and downstream accounting can disagree on what has actually been settled.
- **Fix:** Move both updates into a single Mongo transaction, or at minimum validate both modified counts and compensate on mismatch.

### Medium
### M1 — Rejected applicants cannot reapply despite route logic allowing it
- **Location:** `backend/app/database.py:31`, `backend/app/routers/staff_auth.py:181`
- **Category:** correctness | data-integrity
- **Problem:** `/register` only blocks usernames and phones tied to `pending` or `approved` applications, implying rejected applicants may resubmit. The collection-level unique indexes on `username` and `phone` still make that second insert fail.
- **Evidence:**
```python
await db.staff_registration_applications.create_index("username", unique=True)
await db.staff_registration_applications.create_index("phone", unique=True)

if await db.staff_registration_applications.find_one(
    {"username": payload.username, "status": {"$in": ["pending", "approved"]}},
):
    raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="Username already applied")
await db.staff_registration_applications.insert_one(document)
```
- **Impact:** A rejected user can be permanently blocked from reapplying unless an admin edits or deletes the old application manually.
- **Fix:** Make uniqueness conditional on active statuses, or update the existing rejected application instead of inserting a new one.

### M2 — Registration approval can strand an active staff user behind a pending application
- **Location:** `backend/app/routers/registrations.py:136`
- **Category:** concurrency | data-integrity
- **Problem:** Approval checks `status == pending`, then inserts into `staff_users`, creates relation rows, and only afterward marks the application approved. If the request fails after `staff_users.insert_one()`, the applicant exists but the application remains pending; concurrent approvals also race on the stale pre-check.
- **Evidence:**
```python
application = await get_application_or_404(db, application_id)
if application.get("status") != "pending":
    raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="not_pending")
result = await db.staff_users.insert_one(staff_document)
await create_relation_records(db, result.inserted_id, staff_document["parent_id"], now)
await db.staff_registration_applications.update_one(
    {"_id": application["_id"]},
    {"$set": {"status": "approved", "approved_staff_id": result.inserted_id}},
)
```
- **Impact:** Admins can end up with orphaned active staff accounts or an application that is visibly still pending even though a staff user was created.
- **Fix:** Claim the application with an atomic `status: pending -> approving/approved` compare-and-set before creating the staff user, and wrap approval side effects in a transaction.

### M3 — Disabled rules erase same-day claimed bonus state from the promoter "today" view
- **Location:** `backend/app/services/bonus.py:29`
- **Category:** correctness
- **Problem:** `get_active_rule()` returns `None` as soon as the current rule is disabled. `get_today_bonus_progress()` then returns `rule=None`, `tiers=[]`, and `total_earned_today=0.0` without preserving already-created `bonus_claim_records` for the current day.
- **Evidence:**
```python
async def get_active_rule(db, staff_id: ObjectId) -> dict | None:
    staff_rule = await db.staff_bonus_rules.find_one({"staff_id": staff_id})
    if staff_rule:
        return staff_rule if staff_rule.get("enabled") else None

if rule is None:
    return {"date": date_str, "valid_count": valid_count, "rule": None, "tiers": [], "total_earned_today": 0.0}
```
- **Impact:** A promoter who already claimed sprint bonuses can see the day reset to "no rule / zero earned" after an admin disables the rule mid-day.
- **Fix:** Build the "today" response from today's claim records first and preserve already-earned state even when further claiming is disabled.

### M4 — Zero-commission claims can never leave `unpaid`
- **Location:** `backend/app/routers/finance.py:125`
- **Category:** correctness | data-integrity
- **Problem:** `manual_settle()` skips every claim whose computed commission is `<= 0` and only settles the remaining IDs. Claims with zero commission therefore stay stuck in `unpaid` forever.
- **Evidence:**
```python
for claim in claims:
    claim_amount = await claim_commission_amount(db, claim)
    if claim_amount <= 0:
        continue
    settle_claim_ids.append(claim["_id"])

if not settle_claim_ids:
    raise HTTPException(status_code=400, detail="No approved commission records to settle")
```
- **Impact:** Settlement queues can accumulate permanently unsettlable claims and overstate outstanding finance work.
- **Fix:** Decide whether zero-commission claims should auto-settle or transition to a different terminal state, then implement that transition explicitly.

### Low
_(none)_

### Informational
### I1 — New deployment toggles are still code-only
- **Location:** `backend/app/config.py:30`, `backend/app/main.py:103`
- **Category:** correctness
- **Problem:** `PRODUCTION`, `ALLOW_INSECURE_JWT`, and the seeded `external_api_key` setting are now operationally important, but I only found them referenced in code paths and startup defaults during this pass. I did not find matching operator guidance in the usual project-facing config docs.
- **Evidence:**
```python
if os.getenv("PRODUCTION") == "1":
    raise RuntimeError(...)
if os.getenv("ALLOW_INSECURE_JWT") != "1":
    logger.warning(...)
{"key": "external_api_key", "value": "PLEASE_SET_API_KEY", ...}
```
- **Impact:** Deployments can miss required hardening steps or misunderstand how to safely override insecure-development behavior.
- **Fix:** Document these toggles in `backend/.env.example`, `README.md`, and `EXTERNAL_API.md`.

## Not Audited
- Exhaustive frontend build/runtime verification for Next 16 route-segment behavior under `frontend/src/app/bonus/`
- Production migration behavior for new unique indexes when legacy duplicate data already exists
- Unrelated pre-v2.3 routers beyond targeted auth/index checks and the seven prior-fix verification items

## Auditor Notes
This pass stayed intentionally narrow: I verified the seven previously "Fixed" items with targeted grep-based inspection, then concentrated the remaining time on the newly landed F/G/H code paths where auth, state transitions, and data consistency could fail silently. I stopped after the highest-signal issues rather than broadening into low-value style or completeness checks.

## Resolution Status (2026-04-21)

| ID | Severity | Status | Notes |
|----|----------|--------|-------|
| C1 (concern) | Critical | **Fixed** | staff_id/campaign_id/expires_at moved into atomic find_one_and_update filter in `/complete`; diagnostics differentiate invalid/consumed/expired/mismatched without burning pending records |
| C4 (concern) | Critical | **Fixed** | Empty / whitespace-only `JWT_SECRET_KEY` now treated as insecure alongside literal `"change-me"` |
| H1 | High | **Fixed** | Admin bonus router now requires `get_super_admin` |
| H2 | High | **Fixed** | `claims.cancel` is a compare-and-set on `{pending_redeem, unpaid, frozen}`; terminal states → 400 `invalid_transition` |
| H3 | High | **Fixed** | `finance.manual_settle` snapshots approved commission_logs, verifies modified counts, rolls claims back if log commit fails |
| M1 | Medium | **Fixed** | `staff_registration_applications` uses partial unique indexes on `username`/`phone` (only when status ∈ {pending, approved}) so rejected applicants can reapply |
| M2 | Medium | **Fixed** | `registrations.approve` atomically claims pending → approving first, then does side effects, releases on failure |
| M3 | Medium | **Fixed** | `get_today_bonus_progress` now reports `total_earned_today` and claimed tier entries even when the rule is disabled mid-day |
| M4 | Medium | **Fixed** | Zero-commission claims are included in `manual_settle` and advance `unpaid → paid` |
| I1 | Info | **Fixed** | `backend/.env.example` documents `PRODUCTION`, `ALLOW_INSECURE_JWT`, and the `external_api_key` rotation requirement |

