# GroundRewards v2.2 Audit Report — 2026-04-20

## Summary
- Findings: 13 total
- Audit passes completed: Pass 1 complete; Pass 2 complete; Pass 3 partial

## Critical Findings (production-exploitable, money/data loss)
### C1 — Prize selection is client-controlled at claim time
- **Location:** `backend/app/routers/user_flow.py:224`, `backend/app/routers/user_flow.py:411`
- **Category:** security | correctness
- **Problem:** `/spin` computes a prize but does not persist it anywhere. `/complete` then trusts the caller-supplied `wheel_item_id` and creates a successful claim for any enabled item in the campaign.
- **Evidence:**
```python
return {
    "result_index": chosen,
    "wheel_item": {"id": str(item["_id"]), "display_name": item["display_name"]},
}
...
wid = parse_object_id(payload.get("wheel_item_id", ""), "wheel_item_id")
item = await db.wheel_items.find_one({"_id": wid, "campaign_id": cid, "enabled": True})
claim = {"campaign_id": cid, "staff_id": staff["_id"], "wheel_item_id": wid, "status": "success"}
```
- **Impact:** Any user who completes the flow can skip server-side randomness and claim arbitrary enabled prizes, causing direct prize and money loss.
- **Fix:** Persist the spin outcome server-side and require `/complete` to consume exactly that stored result once; do not accept a raw prize ID as authority.

### C2 — Reward codes can be redeemed anonymously through a public endpoint
- **Location:** `backend/app/routers/external.py:8`, `backend/app/routers/external.py:30`
- **Category:** security | auth
- **Problem:** The external router has no auth dependency, and `/reward-code/{code}/redeem` updates any `assigned` code to `redeemed` based only on the path parameter.
- **Evidence:**
```python
router = APIRouter()

@router.post("/reward-code/{code}/redeem")
async def redeem_reward_code(code: str, db: AsyncIOMotorDatabase = Depends(get_db)):
    rc = await db.reward_codes.find_one_and_update(
        {"code": normalized, "status": "assigned"},
        {"$set": {"status": "redeemed", "redeemed_at": now, "updated_at": now}},
    )
```
- **Impact:** Anyone who learns a reward code can redeem it before the intended recipient uses it.
- **Fix:** Protect the endpoint with service authentication or signed callbacks, and bind redemption to a trusted caller plus claim context.

### C3 — Fresh deployments seed a known super-admin account and do not force rotation
- **Location:** `backend/app/config.py:16`, `backend/app/config.py:17`, `backend/app/main.py:40`
- **Category:** security | auth
- **Problem:** The application ships with `admin` / `admin123` defaults and auto-creates a `super_admin` account from them. The seeded account is also created with `must_change_password=False`.
- **Evidence:**
```python
DEFAULT_ADMIN_USERNAME: str = "admin"
DEFAULT_ADMIN_PASSWORD: str = "admin123"
...
await db.admins.insert_one({
    "username": settings.DEFAULT_ADMIN_USERNAME,
    "password_hash": hash_password(settings.DEFAULT_ADMIN_PASSWORD),
    "role": "super_admin",
    "must_change_password": False,
})
```
- **Impact:** A default deployment can be fully taken over with publicly guessable credentials.
- **Fix:** Refuse startup with default admin credentials, require operator-supplied bootstrap secrets, and force password change on first login.

### C4 — The default JWT secret allows full token forgery
- **Location:** `backend/app/config.py:12`, `backend/app/utils/security.py:19`
- **Category:** security | auth
- **Problem:** JWT signing and verification use a hardcoded fallback secret, `change-me`, when the environment does not override it.
- **Evidence:**
```python
JWT_SECRET_KEY: str = "change-me"
...
return jwt.encode(to_encode, settings.JWT_SECRET_KEY, algorithm=settings.JWT_ALGORITHM)
...
payload = jwt.decode(token, settings.JWT_SECRET_KEY, algorithms=[settings.JWT_ALGORITHM])
```
- **Impact:** In any deployment that keeps the default secret, an attacker can mint arbitrary admin or staff tokens.
- **Fix:** Fail fast on default secrets, rotate existing tokens, and move signing keys into managed secret storage.

## High Findings (money math wrong, auth bypass with preconditions)
### H1 — Commission and settlement math uses binary floats throughout
- **Location:** `backend/app/services/commission.py:64`, `backend/app/services/withdrawals.py:11`, `backend/app/routers/finance.py:76`
- **Category:** correctness | data-integrity
- **Problem:** Commission amounts, balance snapshots, and settlement totals are computed with Python `float` and compared using ad hoc tolerances. This is unsafe for currency and accumulates rounding error across approval, withdrawal, and settlement paths.
- **Evidence:**
```python
level1_rate = float(await get_setting(db, level1_key, 1.0))
{"$inc": {"stats.total_commission": amount}}
...
total_approved = sum(float(log.get("amount", 0)) for log in approved_logs)
...
if remaining > 1e-9:
    raise HTTPException(status_code=400, detail="Settlement amount must match full approved commission records")
```
- **Impact:** Staff balances and settlement requests can drift or fail even when the business amounts are logically equal.
- **Fix:** Store money in integer cents or Mongo `Decimal128`, and do exact arithmetic end-to-end.

### H2 — The live QR session is not actually device-bound when `device_fingerprint` is empty
- **Location:** `backend/app/routers/user_flow.py:520`, `backend/app/routers/user_flow.py:586`, `backend/app/routers/user_flow.py:416`
- **Category:** security | auth
- **Problem:** `pin_verify` accepts an empty `device_fingerprint`, stores it in `promo_sessions`, and `/complete` only compares the request value against the stored value. An empty string therefore satisfies the device-binding check.
- **Evidence:**
```python
fp = str(payload.get("device_fingerprint", "")).strip()
...
await db.promo_sessions.insert_one({
    "session_token": session_token,
    "device_fingerprint": fp,
})
...
device_fp = payload.get("device_fingerprint", "")
if session.get("device_fingerprint", "") != payload.get("device_fingerprint", ""):
```
- **Impact:** The advertised device-bound QR/PIN protection can be bypassed by omitting the fingerprint, weakening session replay and uniqueness controls.
- **Fix:** Reject empty fingerprints at PIN verification and claim time, or replace this with a stronger server-issued binding primitive.

### H3 — Browser JavaScript can read both access and refresh tokens
- **Location:** `frontend/src/lib/auth.ts:11`
- **Category:** security | auth
- **Problem:** The frontend writes tokens with `js-cookie`, which means they are not `HttpOnly` and remain accessible to any injected script.
- **Evidence:**
```typescript
export function setAuth(token: string, role: AuthRole, refreshToken?: string) {
  const options = getCookieOptions();
  Cookies.set(getCookieName(role, "token"), token, options);
  Cookies.set(getCookieName(role, "role"), role, options);
  if (refreshToken) {
    Cookies.set(getCookieName(role, "refresh_token"), refreshToken, options);
```
- **Impact:** Any XSS in the frontend can steal long-lived admin or staff credentials and fully hijack accounts.
- **Fix:** Move auth cookies to server-set `HttpOnly` cookies and keep refresh tokens out of browser JavaScript.

### H4 — The promotion session token is carried in the URL query string
- **Location:** `backend/app/routers/user_flow.py:176`, `frontend/src/app/(user)/welcome/[code]/page.tsx:37`, `frontend/src/app/(user)/wheel/[code]/page.tsx:39`
- **Category:** security | auth
- **Problem:** The backend accepts `session_token` as a query parameter on `/welcome`, and the frontend keeps routing users with `?session_token=...` in page URLs.
- **Evidence:**
```python
async def welcome(..., session_token: str | None = None, ...):
    ...
    await _require_active_session(db, session_token, staff["_id"])
```
```typescript
const sessionToken = searchParams.get("session_token");
const url = sessionToken ? `/api/claim/welcome/${code}?session_token=${encodeURIComponent(sessionToken)}` : ...
```
- **Impact:** The session token can leak into browser history, logs, screenshots, analytics, copied links, and referrer chains.
- **Fix:** Keep the session token in a header or secure cookie and stop exposing it through navigable URLs.

### H5 — Claim results are publicly readable and include raw reward codes
- **Location:** `backend/app/routers/user_flow.py:613`
- **Category:** security | data-integrity
- **Problem:** `/result/{claim_id}` has no auth or ownership check and returns `reward_code` directly for any valid claim ID.
- **Evidence:**
```python
@router.get("/result/{claim_id}")
async def get_result(claim_id: str, db: AsyncIOMotorDatabase = Depends(get_db)):
    claim = await db.claims.find_one({"_id": parse_object_id(claim_id, "claim_id")})
    return {
        "id": str(claim["_id"]), "prize_type": claim["prize_type"],
        "reward_code": claim.get("reward_code"), "status": claim["status"],
```
- **Impact:** Anyone who gets a claim URL can recover the reward code and prize redirect metadata.
- **Fix:** Require a signed result token or session ownership, and avoid returning raw reward codes from a public GET endpoint.

### H6 — Public reward-code checks disclose linked phone and campaign metadata
- **Location:** `backend/app/routers/external.py:15`
- **Category:** security
- **Problem:** `/reward-code/{code}/check` is also public and returns phone and campaign metadata for any known code.
- **Evidence:**
```python
@router.get("/reward-code/{code}/check")
async def check_reward_code(code: str, db: AsyncIOMotorDatabase = Depends(get_db)):
    return {
        "exists": True,
        "status": rc.get("status", "unknown"),
        "campaign_id": str(rc["campaign_id"]) if rc.get("campaign_id") else None,
        "phone": rc.get("phone", ""),
```
- **Impact:** Reward codes double as an oracle for user-linked data and campaign reconnaissance.
- **Fix:** Remove phone/campaign fields from public responses or require authenticated partner access.

### H7 — IP-based risk checks are coupled to proxy peer IP, not the real client
- **Location:** `frontend/src/middleware.ts:6`, `backend/app/routers/user_flow.py:84`, `backend/app/routers/user_flow.py:304`, `backend/app/routers/user_flow.py:415`
- **Category:** security | correctness
- **Problem:** The frontend proxies `/api/*` through Next.js middleware, while the backend derives `ip` from `request.client.host`. In common proxy deployments, that value is the proxy/Next server, not the end user.
- **Evidence:**
```typescript
if (pathname.startsWith("/api/") || pathname.startsWith("/uploads/")) {
  const target = new URL(`${pathname}${search}`, backendUrl);
  return NextResponse.rewrite(target);
}
```
```python
ip = request.client.host if request.client else ""
if await db.claims.find_one({"ip": ip, "campaign_id": cid, "status": "success"}):
```
- **Impact:** OTP throttles, duplicate-IP checks, scan logs, and PIN attempt limits can collapse onto the proxy IP and either over-block everyone or fail to identify abusive clients correctly.
- **Fix:** Extract client IP from a trusted forwarded-header chain at the proxy boundary and centralize that logic before using IP-based controls.

## Medium Findings (correctness, data integrity with preconditions)
### M1 — Reward codes are assigned before the claim write and are not rolled back on failure
- **Location:** `backend/app/routers/user_flow.py:153`, `backend/app/routers/user_flow.py:472`
- **Category:** data-integrity
- **Problem:** Website prize codes are generated and inserted as `assigned` before the claim document is written. If the claim insert then fails, the handler returns an error without releasing or deleting the code.
- **Evidence:**
```python
if item.get("type") == "website":
    reward_code, reward_code_id = await create_generated_reward_code(...)
...
try:
    result = await db.claims.insert_one(claim)
except DuplicateKeyError:
    return {"success": False, "message": "This phone number has already claimed a prize."}
```
- **Impact:** Claim races can strand reward codes in `assigned` state and shrink usable inventory over time.
- **Fix:** Insert the claim first and allocate the code afterward inside a transaction, or add compensating rollback logic on claim failure.

### M2 — OTP verification is not scoped to campaign and can consume the wrong OTP
- **Location:** `backend/app/routers/user_flow.py:339`, `backend/app/routers/user_flow.py:355`
- **Category:** correctness
- **Problem:** OTP creation stores `campaign_id`, but `/verify-otp` looks up the latest unused OTP for a phone number without including campaign. A phone active in multiple campaigns can therefore burn the wrong record.
- **Evidence:**
```python
await db.otp_records.insert_one({
    "phone": phone, "code": code, "used": False,
    "campaign_id": safe_object_id(campaign_id),
})
...
latest = await db.otp_records.find_one(
    {"phone": phone, "used": False, "expires_at": {"$gt": now}},
```
- **Impact:** Users can verify one campaign’s OTP and still fail the later claim step because the verified record belongs to a different campaign.
- **Fix:** Include `campaign_id` in the verify request and in every OTP lookup/update filter.

## Low Findings (code quality, minor bugs)
_(none)_

## Informational
_(none)_

## Not Audited
- Full route-by-route review of backend routers outside the prioritized auth, user-flow, promoter, finance, and config paths
- Dead-code and never-called endpoint sweep beyond the sampled public/external flows
- Frontend UI-state correctness outside auth/session transport and claim-flow entry points
- End-to-end behavior under real proxy headers, load, and Mongo transactions

## Auditor Notes
The highest-risk problems are concentrated in the public claim path and the way tokens/codes are transported and redeemed. Admin-side dependency wiring looked mostly consistent in the sampled routers, but the codebase still relies on unsafe defaults, client-supplied authority, and float-based money handling in places that should be server-authoritative and exact. GroundRewards v2.2 is close to having the right primitives, but several of the new QR/session/reward features are only partially enforced, which leaves exploitable gaps despite otherwise reasonable structure and indexing.
