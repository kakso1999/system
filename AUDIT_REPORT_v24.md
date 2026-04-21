# GroundRewards v2.4 Post-Ship Audit — 2026-04-21

## Scope
- Verify v2.2/v2.3 carryover: AUDIT-H7 (implemented in v2.4), AUDIT-H4 (implemented in v2.4), any regression in C1/H5
- Audit new v2.4 code: J1/L1/H7/I/J2/K/H4/L2

## Summary
- Findings: 7 new findings (Critical: 0, High: 3, Medium: 4, Low: 0)
- Fix verifications: 2 passed / 1 concerns / 1 regressed

## Fix Verifications

### AUDIT-H7 — real client IP: _FAIL_
`extract_client_ip()` is now used consistently at the new v2.4 user-flow IP call sites, and I did not find new business logic reading raw `request.client.host` outside the helper. The trust boundary is still wrong, though: `frontend/src/middleware.ts` accepts attacker-controlled `x-forwarded-for` / `x-real-ip` headers from the inbound request and forwards them to FastAPI, so the new backend helper can be spoofed whenever the backend trusts the Next proxy. v2.4 therefore improves wiring but does not actually make the recorded client IP authoritative.

### AUDIT-H4 — session_token out of URL: _CONCERN_
The migration to `sessionStorage` plus `X-Session-Token` is a real improvement, but the URL pattern is still active. `frontend/src/app/(user)/pin/[code]/page.tsx:254` still redirects through `?session_token=...`, `frontend/src/app/(user)/welcome/[code]/page.tsx:40` and `frontend/src/app/(user)/wheel/[code]/page.tsx:67` still read from the query string, and `backend/app/routers/user_flow.py:187` keeps the backend query fallback. The token can still land in browser history, copied links, logs, and analytics on the first hop.

### AUDIT-C1 / AUDIT-H5 / AUDIT-H3 / AUDIT-H1
AUDIT-C1 — still holds: `/complete` consumes a server-side `spin_outcomes` record and does not trust a caller-supplied prize id.

AUDIT-H5 — still holds: `/result/{claim_id}` still requires a valid HMAC `result_token`.

AUDIT-H3 — still deferred: access/refresh tokens remain JS-readable cookies; v2.4 also stores the shorter-lived promo session token in `sessionStorage`.

AUDIT-H1 — still deferred: v2.4 adds more float-based aggregation (`total_bonus`) and keeps commission / settlement arithmetic on `float`.

## New Findings in v2.4

### Critical
_none_

### High
### H1 — Client IP is still spoofable through the Next middleware forwarding chain
- **Location:** `frontend/src/middleware.ts:6`, `frontend/src/middleware.ts:20`, `backend/app/utils/request_ip.py:47`
- **Category:** auth | rate-limit-bypass
- **Problem:** v2.4 moved the backend to `extract_client_ip()`, but the frontend middleware still derives the “client IP” from attacker-controlled request headers. `pickClientIp()` trusts inbound `x-forwarded-for` first, then `x-real-ip`, before falling back to runtime metadata. The middleware then copies the original headers and appends the chosen value back into `x-forwarded-for`. On the backend side, `extract_client_ip()` trusts `X-Forwarded-For` whenever the immediate peer is in `TRUSTED_PROXY_IPS` (which is exactly the local Next proxy case). The result is that a caller can hit the frontend with `x-forwarded-for: 8.8.8.8` and make the backend believe the claim, OTP, scan-log, and PIN-verification traffic came from `8.8.8.8`.
- **Evidence:**
```ts
// frontend/src/middleware.ts
function pickClientIp(request: NextRequest): string {
  const forwarded = request.headers.get("x-forwarded-for");
  if (forwarded) return forwarded.split(",")[0].trim();
  const real = request.headers.get("x-real-ip");
  if (real) return real.trim();
  return (request as NextRequest & { ip?: string }).ip || "";
}

const existingXff = request.headers.get("x-forwarded-for");
const newXff =
  existingXff && clientIp
    ? `${existingXff}, ${clientIp}`
    : clientIp || existingXff || "";
if (newXff) headers.set("x-forwarded-for", newXff);
```
```python
# backend/app/utils/request_ip.py
if not peer or peer not in trusted:
    return peer

xff = request.headers.get("X-Forwarded-For") or request.headers.get(
    "x-forwarded-for"
)
if xff:
    hops = _parse_xff(xff)
    for candidate in reversed(hops):
        if candidate in trusted:
            continue
        if _is_private(candidate):
            continue
        return candidate
```
- **Impact:** Attackers can evade or poison OTP per-IP throttles, duplicate-IP checks, PIN brute-force controls, scan logs, and risk investigations by sending arbitrary forwarded headers to the frontend.
- **Fix:** At the proxy boundary, discard caller-supplied forwarding headers and overwrite them with trusted runtime/platform IP metadata only; the backend helper should only consume headers that were sanitized by that trusted edge.

### H2 — Reward codes are disclosed to a third-party QR service
- **Location:** `frontend/src/app/(user)/result/[id]/page.tsx:92`
- **Category:** data-exposure
- **Problem:** The v2.4 “Download Reward Image” flow sends each redeemed `reward_code` to `https://api.qrserver.com/v1/create-qr-code/` as a query parameter. That makes a redeemable reward secret leave GroundRewards entirely: the third-party QR provider, any upstream logs, and network observers can all see the code in the request URL. This is a privacy leak and, because the QR embeds the live reward code, potentially a redemption-security leak as well.
- **Evidence:**
```ts
const qrUrl = `https://api.qrserver.com/v1/create-qr-code/?size=320x320&data=${encodeURIComponent(
  `${window.location.origin}/mock-redeem?code=${data.reward_code}`
)}`;
const qrImage = new Image();
qrImage.crossOrigin = "anonymous";
qrImage.src = qrUrl;
```
- **Impact:** Every user who downloads a reward image discloses a redeemable reward code to a third-party service outside the operator’s control.
- **Fix:** Generate QR codes locally in the browser or via a first-party/self-hosted endpoint; do not send raw reward codes to external QR APIs.

### H3 — Admin-controlled URLs are rendered without scheme allowlisting
- **Location:** `backend/app/routers/settings.py:22`, `backend/app/schemas/sponsors.py:8`, `frontend/src/components/customer-service-fab.tsx:33`, `frontend/src/components/sponsors-carousel.tsx:26`
- **Category:** xss | input-validation
- **Problem:** v2.4 adds two new operator-controlled link surfaces: customer-service links from `/api/public/settings` and sponsor `link_url` values from the new sponsors CRUD. Neither path validates URL schemes server-side. The generic settings route writes arbitrary `payload["value"]`, sponsor schemas accept raw `str`, and the frontend renders those strings directly into `<a href=...>`. Browser `type="url"` controls do not reject `javascript:` or other dangerous schemes. Any admin who can edit system settings or sponsors can therefore plant a stored malicious link on user pages, and sponsor links are also rendered inside the admin UI itself.
- **Evidence:**
```python
# backend/app/routers/settings.py
await db.system_settings.update_one({"key": key}, {"$set": {"value": payload["value"]}}, upsert=True)
```
```python
# backend/app/schemas/sponsors.py
logo_url: str = Field(default="", max_length=500)
link_url: str = Field(default="", max_length=500)
```
```tsx
// frontend/src/components/customer-service-fab.tsx
{whatsapp && <ChannelLink href={whatsapp} title="WhatsApp" icon={<Phone className="h-5 w-5" />} />}
{telegram && <ChannelLink href={telegram} title="Telegram" icon={<Send className="h-5 w-5" />} />}
```
```tsx
// frontend/src/components/sponsors-carousel.tsx
<a href={item.link_url || undefined} target={item.link_url ? "_blank" : undefined} rel={item.link_url ? "noreferrer" : undefined}>
```
- **Impact:** A lower-privileged admin can plant persistent phishing / script URLs that execute when users or other admins click them, and admin-browser token theft is especially risky because auth tokens are still JS-readable.
- **Fix:** Validate these values server-side to a strict allowlist of schemes and hosts (`https://` only, plus any explicit `wa.me` / `t.me` patterns), and reject `javascript:`, `data:`, and other non-web schemes.

### Medium
### M1 — Sponsor logo upload accepts arbitrary files and writes them straight into a public static directory
- **Location:** `backend/app/routers/sponsors.py:138`
- **Category:** dos | input-validation
- **Problem:** The new sponsor-logo upload endpoint trusts the incoming filename extension, reads the entire upload into memory at once, and writes the bytes directly into the web-served `/uploads` directory. There is no maximum size, no content-type allowlist, no magic-byte sniffing, and no image decode/verification step. The random filename prefix reduces direct overwrite risk, but it does not solve the actual hardening gap here: any admin can upload large or non-image content that becomes publicly reachable.
- **Evidence:**
```python
ext = file.filename.rsplit(".", 1)[-1] if file.filename else "png"
filename = f"sponsor_{uuid.uuid4().hex[:8]}.{ext}"
filepath = UPLOAD_DIR / filename
UPLOAD_DIR.mkdir(exist_ok=True)
content = await file.read()
filepath.write_bytes(content)
logo_url = f"/uploads/{filename}"
```
- **Impact:** A malicious or careless admin can consume memory/storage with oversized uploads and publish arbitrary non-image content under a public static path.
- **Fix:** Enforce a hard size limit, validate against a small image allowlist, inspect magic bytes or decode the image before saving, and normalize the stored extension instead of trusting `file.filename`.

### M2 — New dynamic OTP/live-QR settings are unvalidated and can fail open or fail closed
- **Location:** `backend/app/routers/settings.py:18`, `backend/app/routers/user_flow.py:349`, `backend/app/routers/user_flow.py:363`, `backend/app/routers/user_flow.py:676`, `backend/app/routers/user_flow.py:699`
- **Category:** correctness | input-validation
- **Problem:** v2.4 introduced several operator-editable numeric settings (`sms_cooldown_sec`, `phone_daily_limit`, `ip_daily_limit`, `ip_window_min`, `live_pin_max_fails`, `promo_session_expires_min`) but the generic settings route still accepts arbitrary JSON values without per-key validation. The claim flow then uses raw `int(...)` casts inline. A non-numeric value raises a server-side exception; negative or zero values silently alter behavior in unsafe ways, for example disabling cooldowns, making the IP window point into the future, or locking every live token immediately.
- **Evidence:**
```python
# backend/app/routers/settings.py
@router.put("/{key}")
async def update_setting(key: str, payload: dict, db: AsyncIOMotorDatabase = Depends(get_db)):
    if "value" not in payload:
        raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail="value is required")
    await db.system_settings.update_one({"key": key}, {"$set": {"value": payload["value"]}}, upsert=True)
```
```python
# backend/app/routers/user_flow.py
cooldown_sec = int(await get_setting(db, "sms_cooldown_sec") or 60)
phone_limit = int(await get_setting(db, "phone_daily_limit") or 3)
ip_limit = int(await get_setting(db, "ip_daily_limit") or 20)
ip_window_min = int(await get_setting(db, "ip_window_min") or 60)
max_fails = int(await get_setting(db, "live_pin_max_fails") or 5)
session_expires_min = int(await get_setting(db, "promo_session_expires_min") or 30)
```
- **Impact:** A bad admin edit can take the public OTP/session flow down with 500s or quietly weaken the protections those settings were supposed to control.
- **Fix:** Add typed per-key validation on write, clamp to sane minimum/maximum ranges, and handle bad stored values with explicit 4xx/admin errors instead of runtime `ValueError` crashes.

### M3 — Active promo sessions are not bound back to the campaign they were minted for
- **Location:** `backend/app/routers/user_flow.py:108`, `backend/app/routers/user_flow.py:191`, `backend/app/routers/user_flow.py:703`
- **Category:** auth | correctness
- **Problem:** `promo_sessions` store both `staff_id` and `campaign_id`, but `_require_active_session()` validates only `session_token`, `status`, `expires_at`, and `staff_id`. `welcome()` then accepts `session_token_header or session_token` and calls that helper without checking campaign binding. If the same promoter is rebound from campaign A to campaign B while a session from A is still active, that stale session can authorize the new campaign because the helper never compares `session["campaign_id"]` to the staff member’s current campaign.
- **Evidence:**
```python
async def _require_active_session(db, session_token: str | None, staff_oid, mismatch_code: str = "session_required"):
    ...
    session = await db.promo_sessions.find_one({
        "session_token": session_token, "status": "active",
    })
    ...
    if session.get("staff_id") != staff_oid:
        raise HTTPException(status_code=403, detail={"code": mismatch_code})
```
```python
effective_session_token = session_token_header or session_token
...
if await get_setting(db, "live_qr_enabled"):
    await _require_active_session(db, effective_session_token, staff["_id"])
```
```python
await db.promo_sessions.insert_one({
    "staff_id": staff["_id"],
    "campaign_id": staff.get("campaign_id"),
    "live_token_id": token["_id"],
    "session_token": session_token,
```
- **Impact:** Stale live-QR sessions can cross campaign boundaries for the same promoter during the session lifetime, which is not the intended binding model.
- **Fix:** Include `campaign_id` in the active-session validation path and require `spin` / `complete` to match the session that actually created the claim flow.

### M4 — OTP cooldown and rate-limit checks are bypassable with parallel requests
- **Location:** `backend/app/routers/user_flow.py:349`
- **Category:** race-condition | rate-limit-bypass
- **Problem:** The new OTP throttling logic is implemented as a sequence of reads followed by side effects: check the latest OTP, count recent OTPs, optionally send SMS, then insert the new OTP record. There is no atomic throttle document, compare-and-set, or transaction. Two parallel requests for the same phone/IP can therefore both see “no recent OTP yet”, both send an SMS, and both insert records. Sequential abuse is blocked, but concurrent abuse is not.
- **Evidence:**
```python
cooldown_sec = int(await get_setting(db, "sms_cooldown_sec") or 60)
if cooldown_sec > 0:
    recent = await db.otp_records.find_one(
        {"phone": phone}, sort=[("created_at", -1)]
    )
...
recent_otp_count = await db.otp_records.count_documents({
    "phone": phone, "created_at": {"$gte": ten_min_ago}
})
...
if sms_on:
    sms_result = await send_sms(db, phone, code, "10")
...
await db.otp_records.insert_one({
    "phone": phone, "code": code, "used": False,
```
- **Impact:** Attackers can burst parallel OTP requests to bypass the intended cooldown / rolling-window protections, sending duplicate SMS messages and weakening the rate limit.
- **Fix:** Reserve OTP issuance atomically per phone/IP window before sending SMS, or use a transaction / throttle collection keyed by `(phone, time_bucket)` and `(ip, time_bucket)`.

### Low
_none_

## Notes / non-findings
- `backend/app/routers/public_settings.py` keeps a tight whitelist. I did not find `sms_*`, JWT secrets, `external_api_key`, or commission-rate keys exposed through `/api/public/settings`.
- `backend/app/config.py:25` defaults `TRUSTED_PROXY_IPS` to `127.0.0.1,::1`, which is a safe default. The H7 problem is the frontend trust boundary, not the default backend list.
- I did not find new v2.4 business logic using raw `request.client.host`; the new IP-sensitive user-flow paths all call `extract_client_ip()`.
- The direct-backend spoof path is blocked by `extract_client_ip()` because the helper only trusts forwarded headers when the immediate peer is trusted. The exploitable spoof path is specifically through the Next middleware forwarding attacker headers.
- Sponsor write endpoints are behind `get_current_admin`; I did not find an unauthenticated write path in `backend/app/routers/sponsors.py`.
- The random `sponsor_<uuid>.ext` filename pattern partially constrains simple overwrite/path-traversal attempts from `file.filename`. The real issue is missing file-type / file-size validation, not a trivial direct overwrite.
- `frontend/src/app/mock-redeem/page.tsx` renders the `code` query parameter as plain React text and does not use `dangerouslySetInnerHTML`; I did not find reflected XSS there.
- `frontend/src/components/sponsors-carousel.tsx` allows external `logo_url` values to be fetched by the browser, but I did not find a server-side SSRF path from that code.
- `frontend/src/lib/public-settings.ts` handles 500/null responses safely by falling back to defaults. The downside is staleness, not a security failure.
- `backend/app/routers/finance.py:82` sums `type: "bonus"` without a status filter, but the current v2.4 bonus creation path writes those records as `status: "approved"` and I did not find a new v2.4 path that transitions bonus commission logs to `rejected` or `frozen`; I am not flagging it separately.
- The QR payload itself contains the reward code (`/mock-redeem?code=...`), which is inherent to how the demo redeem flow works. The reportable issue is the third-party disclosure to `api.qrserver.com`, not the fact that the QR encodes the code.
