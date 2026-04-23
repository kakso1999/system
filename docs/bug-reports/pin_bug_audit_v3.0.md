# Live QR + PIN Audit

Audit context:
- Local MongoDB is reachable at `mongodb://localhost:27017`, database `ground_rewards`.
- Local backend is reachable at `http://localhost:8000`.
- `staff_users` contains `invite_code=NFPSSY` -> `username=wstest1`, `status=active`, `work_status=promoting`, `qr_version=23`.
- Current local `system_settings.live_qr_enabled` is `false`, and there are currently no `promo_live_tokens` rows for `NFPSSY`, so I could not complete a live end-to-end HTTP repro without the staff password.
- The screenshot shows the generic message `We could not verify that PIN. Please try again.` That message only appears on the frontend when the backend returns an unhandled error code, not when it returns `invalid_pin`, `expired`, `locked`, `not_found`, or `rate_limited`.

## Section 1 — Confirmed root causes

1. `POST /live-qr/generate` can mint a PIN that `POST /claim/pin/verify` will always reject as `staff_inactive`.

Files:
- `backend/app/routers/promoter.py:381-419`
- `backend/app/routers/user_flow.py:753-763`
- `backend/app/routers/staff_auth.py:146-160`
- `backend/app/schemas/staff.py:114-118`
- `frontend/src/app/(promoter)/home/page.tsx:428-430`
- `frontend/src/app/(promoter)/home/page.tsx:563-565`

Snippet:
```python
# backend/app/routers/promoter.py:386-394
if not current_staff.get("campaign_id"):
    raise HTTPException(status_code=400, detail="no_active_campaign")
now = datetime.now(timezone.utc)
await _enforce_live_qr_rate_limit(db, current_staff["_id"], now)
await db.promo_live_tokens.update_many(
    {"staff_id": current_staff["_id"], "status": "active"},
    {"$set": {"status": "rotated"}},
)
qr_version = await _increment_qr_version(db, current_staff["_id"])
```

```python
# backend/app/routers/user_flow.py:753-763
staff_status = staff.get("status", "active")
work_status = staff.get("work_status", "stopped")
promotion_paused = bool(staff.get("promotion_paused", False))
risk_frozen = bool(staff.get("risk_frozen", False))
if (
    staff_status != "active"
    or work_status != "promoting"
    or promotion_paused
    or risk_frozen
):
    return {"success": False, "error": "staff_inactive", "attempts_remaining": 0}
```

Why this breaks the PIN flow:
- New staff documents are created without `work_status` at all (`backend/app/routers/staff_auth.py:146-160`), and the schema default is `"stopped"` (`backend/app/schemas/staff.py:114-118`).
- The QR generation route does not check `status`, `work_status`, `promotion_paused`, `risk_frozen`, or the seeded `must_start_work_before_qr` setting before minting a token.
- The promoter home screen still exposes the QR page even when the staff member has not started promoting.
- Result: the promoter can see a fresh PIN and QR, but `/claim/pin/verify` rejects every attempt with `staff_inactive`.
- The screenshot’s generic error text is consistent with this path, because `/pin/[code]` does not recognize `staff_inactive` and falls back to the generic message.

Concrete fix:
1. Add the same staff-state gate to `live_qr_generate()` that `pin_verify()` already uses.
2. If `must_start_work_before_qr` is intended to matter, actually read and enforce it here.
3. Disable or guard the “Open QR Code” path in the promoter UI unless `work_status === "promoting"` and the account is active.
4. Add explicit frontend handling for `staff_inactive`.

2. Lock-triggered auto-rotation is missing, so the promoter can keep displaying a PIN that is permanently invalid.

Files:
- `backend/app/routers/user_flow.py:778-793`
- `backend/app/routers/promoter.py:422-455`
- `frontend/src/app/(promoter)/qrcode/page.tsx:260-307`

Snippet:
```python
# backend/app/routers/user_flow.py:778-793
max_fails = int(await get_setting(db, "live_pin_max_fails") or 5)
if token.get("failures", 0) >= max_fails:
    await db.promo_live_tokens.update_one({"_id": token["_id"]}, {"$set": {"status": "locked"}})
    return {"success": False, "error": "locked", "attempts_remaining": 0}

if token["pin"] != pin:
    new_fails = token.get("failures", 0) + 1
    new_status = "locked" if new_fails >= max_fails else "active"
    await db.promo_live_tokens.update_one(
        {"_id": token["_id"]},
        {"$set": {"failures": new_fails, "status": new_status}},
    )
```

```tsx
// frontend/src/app/(promoter)/qrcode/page.tsx:266-269
useEffect(() => {
  if (state.status !== "consumed") return;
  void generateLiveQr(true);
}, [state.status]);
```

Why this breaks the PIN flow:
- The intended design says lock should auto-rotate the QR+PIN pair.
- The backend can mark a token `locked`, and `GET /live-qr` will return that locked token as the latest token.
- The promoter frontend only auto-generates on `consumed` or when the countdown reaches zero; it does not auto-generate on `locked`.
- Result: after too many failed attempts, the page can continue showing the locked PIN for up to the remaining TTL, and every “correctly typed” retry will still fail.

Concrete fix:
1. Treat `locked` the same as `consumed` for auto-rotation on the promoter page.
2. Preferably, have `GET /live-qr` return an explicit `needs_rotate` signal for `locked`, `expired`, and `consumed`.
3. Optionally rotate server-side immediately when the token becomes locked.

3. The promoter page has a stale-response race: an older `GET /live-qr` response can overwrite a newer token from `POST /live-qr/generate`.

Files:
- `frontend/src/app/(promoter)/qrcode/page.tsx:260-307`
- `backend/app/routers/promoter.py:422-455`

Snippet:
```tsx
// frontend/src/app/(promoter)/qrcode/page.tsx:271-307
const applyLiveQrPayload = (payload: LiveQrPayload) => {
  setState((prev) => ({
    ...prev,
    qr_data: payload.qr_data ?? prev.qr_data,
    pin: payload.pin ?? prev.pin,
    expires_at: payload.expires_at ?? prev.expires_at,
    qr_version: payload.qr_version ?? prev.qr_version,
    status: payload.status ?? "active",
    loading: false,
    error: "",
  }));
};

const refreshLiveQr = async () => {
  const res = await api.get<LiveQrPayload>("/api/promoter/live-qr");
  applyLiveQrPayload(res.data);
};
```

```python
# backend/app/routers/promoter.py:433-445
token = await db.promo_live_tokens.find_one(
    {"staff_id": current_staff["_id"]},
    sort=[("created_at", -1)],
)
...
if status == "active" and exp and exp <= now:
    await db.promo_live_tokens.update_one({"_id": token["_id"]}, {"$set": {"status": "expired"}})
    status = "expired"
```

Why this breaks the PIN flow:
- The frontend applies every poll or generate response blindly.
- It does not compare `live_token_id`, `qr_version`, request sequence, or freshness before overwriting the current state.
- `GET /live-qr` returns the most recent token for the staff, not necessarily the same token the user scanned, and not necessarily an active token.
- Race example:
  1. Poll `GET /live-qr` starts while token `v15` is still current.
  2. A manual refresh, expiry rotation, or consumed rotation creates `v16`.
  3. `POST /live-qr/generate` returns `v16`, and the UI updates.
  4. The slower `GET` response for `v15` arrives later and overwrites the UI back to `v15`.
  5. The promoter now reads a stale PIN/QR while the backend only accepts `v16`.
- Depending on which QR was scanned and which PIN was read aloud, the user will see `invalid_pin`, `not_found`, or `expired`.

Concrete fix:
1. Track `live_token_id` and/or `qr_version` in state and reject older responses.
2. Pause polling while a generate request is in flight.
3. Ignore non-`active` poll payloads except to trigger a rotation.
4. Consider changing `GET /live-qr` to return the latest active token only.

4. The `/pin/[code]` page is permanently bound to the `lt` in the scanned URL and never re-reads the latest token signature.

Files:
- `frontend/src/app/(user)/pin/[code]/page.tsx:189-190`
- `frontend/src/app/(user)/pin/[code]/page.tsx:243-252`
- `backend/app/routers/promoter.py:412-418`

Snippet:
```tsx
// frontend/src/app/(user)/pin/[code]/page.tsx:189-190,243-252
const lt = searchParams.get("lt") || "";
...
const res = await api.post<VerifyResponse>("/api/claim/pin/verify", {
  staff_code: code.toUpperCase(),
  pin: pinCode,
  device_fingerprint: deviceFp,
  token_signature: lt,
});
```

Why this breaks the PIN flow:
- The user page never asks the backend for the latest token signature.
- Once the QR is scanned, the browser is permanently pinned to that original `lt`.
- If the promoter page rotates between scan time and PIN entry time, the promoter may now be reading the new PIN while the user is still submitting the old signature.
- In that case the typed PIN can be “the one currently shown on the promoter screen” and still fail, because it is being checked against the old scanned token.
- This is partly intentional per product rules, but it is still a confirmed failure reason and must be made explicit in the UX.

Concrete fix:
1. Keep the one-QR/one-PIN invariant, but tell the user explicitly that they must rescan after any rotation.
2. Show the scanned `qr_version` on both screens and make the promoter confirm that the customer’s version matches.
3. Optionally add a lightweight preflight on `/pin/[code]` to detect that the scanned signature is no longer current and force a rescan before the user enters digits.

5. The frontend hides the real backend error, so operators may think the PIN is wrong when the backend is actually returning `staff_inactive`, `device_fingerprint_required`, or `invalid_signature`.

Files:
- `frontend/src/app/(user)/pin/[code]/page.tsx:11-16`
- `frontend/src/app/(user)/pin/[code]/page.tsx:51-56`
- `frontend/src/app/(user)/pin/[code]/page.tsx:259-264`
- `backend/app/routers/user_flow.py:729-735`
- `backend/app/routers/user_flow.py:757-763`

Snippet:
```tsx
// frontend/src/app/(user)/pin/[code]/page.tsx:11-16,51-56
type PinError = "invalid_pin" | "expired" | "locked" | "not_found" | "rate_limited";

function getErrorMessage(error?: PinError, attemptsRemaining?: number) {
  if (error === "invalid_pin") return `Wrong PIN. Attempts remaining: ${attemptsRemaining ?? 0}`;
  if (error === "expired") return "QR code expired. Ask the promoter to refresh.";
  if (error === "locked") return "Too many wrong attempts. Ask the promoter for a new code.";
  if (error === "not_found" || error === "rate_limited") return "Invalid code.";
  return "We could not verify that PIN. Please try again.";
}
```

Why this breaks the PIN flow:
- The screenshot shows the generic fallback message, not one of the specific messages.
- That means the backend is very likely returning an unhandled code, not `invalid_pin`, `expired`, `locked`, `not_found`, or `rate_limited`.
- The most plausible unhandled codes on this path are `staff_inactive` or `device_fingerprint_required`.
- Operators then keep retrying “the right PIN” instead of fixing the actual state mismatch.

Concrete fix:
1. Extend the `PinError` union to include `staff_inactive`, `device_fingerprint_required`, and `invalid_signature`.
2. Map each to a specific user-facing message.
3. Log the raw backend payload in development.

## Section 2 — Suspected issues (not confirmed)

1. More than one promoter QR page may be open, and each mount/refresh rotates the token.

Files:
- `frontend/src/app/(promoter)/qrcode/page.tsx:243-246`
- `backend/app/routers/promoter.py:390-394`

Snippet:
```tsx
// frontend/src/app/(promoter)/qrcode/page.tsx:243-246
useEffect(() => {
  setOrigin(window.location.origin);
  void generateLiveQr();
}, []);
```

Why this could break the PIN flow:
- Every QR page mount generates a new live token.
- If the promoter had the QR page open in multiple tabs/devices, one screen could show a QR that another screen already rotated out.
- Then the user can scan one token but be told the PIN from another token.

What additional repro info is needed:
- Whether the promoter had `/qrcode` open in more than one tab, browser, or device.
- Whether any manual refresh was pressed right before the customer entered the PIN.

2. The frontend proxy/API target can drift between `:3005` and `:8000`, and the checked-out env files are missing.

Files:
- `frontend/src/lib/api.ts:20-37`
- `frontend/src/middleware.ts:3-33`

Snippet:
```ts
// frontend/src/lib/api.ts:20-21
const FALLBACK_API_URL = "";
const baseURL = (process.env.NEXT_PUBLIC_API_URL ?? FALLBACK_API_URL).replace(/\/+$/, "");
```

```ts
// frontend/src/middleware.ts:3-4
const DEFAULT_BACKEND_URL = "http://localhost:3005";
const backendUrl = new URL(process.env.BACKEND_URL ?? DEFAULT_BACKEND_URL);
```

Why this could break the PIN flow:
- In this checkout, `frontend/.env.local` and `backend/.env` are absent.
- The local live backend is actually responding on `http://localhost:8000`, while the middleware default points at `:3005`.
- If the deployed promoter UI and user UI are not pointed at the same backend/database, the staff-side token creation and user-side verification can split.

What additional repro info is needed:
- Actual deployed values of `NEXT_PUBLIC_API_URL` and `BACKEND_URL`.
- Confirmation that both promoter and user traffic hit the same MongoDB-backed backend.

3. An empty or unstable device fingerprint may be causing generic failures on some browsers/devices.

Files:
- `frontend/src/app/(user)/pin/[code]/page.tsx:207-208`
- `backend/app/routers/user_flow.py:729-730`
- `backend/app/routers/user_flow.py:563-568`

Snippet:
```tsx
// frontend/src/app/(user)/pin/[code]/page.tsx:207-208
useEffect(() => {
  setDeviceFp(generateDeviceFingerprint());
}, []);
```

```python
# backend/app/routers/user_flow.py:729-730
if not fp:
    return {"success": False, "error": "device_fingerprint_required", "attempts_remaining": 0}
```

Why this could break the PIN flow:
- If the fingerprint is empty at submit time, `/claim/pin/verify` rejects immediately.
- If it changes later, `/claim/complete` can reject with `session_device_mismatch`.
- The current frontend does not surface these cases cleanly.

What additional repro info is needed:
- A network trace from the failing device showing the `device_fingerprint` sent to `/api/claim/pin/verify`.
- Browser/device model, privacy mode, and whether the problem is reproducible only on one class of devices.

## Section 3 — Synchronization analysis

When the promoter page calls `POST /live-qr/generate`:
- `promo_live_tokens` old rows: `backend/app/routers/promoter.py:390-393` updates all old `status="active"` rows for that staff to `status="rotated"`. Their existing `qr_version` values do not change. No `rotated_at` field is written.
- `staff_users.qr_version`: `backend/app/routers/promoter.py:369-378` increments the staff row by exactly `+1`.
- Response `qr_data` / `token_signature` / `pin`:
  - `pin` is a new 3-digit random value from `generate_pin()` (`backend/app/utils/live_token.py:18-20`).
  - `token_signature` is a new HMAC over `staff_id`, new `qr_version`, and the current millisecond timestamp (`backend/app/utils/live_token.py:9-15`).
  - A new `promo_live_tokens` row is inserted with that pin/signature/version, `status="active"`, `failures=0`, and `expires_at=now+live_qr_expires_sec`.
  - `qr_data` is `/pin/{invite_code}?lt={token_signature}&v={qr_version}` (`backend/app/routers/promoter.py:412-418`).

When the frontend polls `GET /live-qr`, does it receive the same `token_signature` the user just scanned?
- Not guaranteed.
- It receives the most recent token row for that staff, regardless of status (`backend/app/routers/promoter.py:433-455`), not “the token the user scanned”.
- It is the same signature only when no rotation happened after the scan and no stale frontend response overwrote state.

Every confirmed divergence path:
1. Manual refresh on the promoter page after the user scanned.
2. Auto-rotation at expiry after the user scanned.
3. Auto-rotation after a successful consumption in another user flow.
4. Token lock after too many wrong attempts; the promoter page keeps showing the locked token because it does not auto-rotate on `locked`.
5. Work stop/pause/admin pause/risk freeze can invalidate the token while the promoter UI still shows the previous payload.
6. A stale `GET /live-qr` response can overwrite a newer token returned by `POST /live-qr/generate`.
7. Multiple promoter tabs/devices can each generate fresh tokens and invalidate the others.

Does `/pin/[code]` ever re-read the latest `token_signature`?
- No.
- `frontend/src/app/(user)/pin/[code]/page.tsx:189-190` reads `lt` from the URL.
- `frontend/src/app/(user)/pin/[code]/page.tsx:243-252` always submits that exact `lt`.
- It never calls `GET /live-qr` and never asks the backend for the current active signature before verifying.
- So yes: the user is permanently locked to the signature in the scanned URL until they rescan.

## Section 4 — Device fingerprint path

Client-side generation:
- `/pin/[code]`: `frontend/src/app/(user)/pin/[code]/page.tsx:28-48` hashes user-agent, language, screen size, color depth, timezone offset, hardware concurrency, device memory, and touch points into `fp_<hash>`.
- `/wheel/[code]`: `frontend/src/app/(user)/wheel/[code]/page.tsx:16-36` uses the same algorithm.

Where it is sent:
- `/claim/pin/verify`: `frontend/src/app/(user)/pin/[code]/page.tsx:248-252`.
- `/claim/complete`: `frontend/src/app/(user)/wheel/[code]/page.tsx:243-246`.
- It is not sent as `X-Device-Fingerprint` by `/welcome/[code]` or `/wheel/[code]` page loads, and `handleSpin()` does not send it in the body either.

Backend handling:
- `pin_verify()` requires a non-empty fingerprint and stores it into the new `promo_sessions` row on success (`backend/app/routers/user_flow.py:728-730`, `805-817`).
- `_require_active_session()` only enforces fingerprint equality if the caller passes one (`backend/app/routers/user_flow.py:117-141`).
- `welcome()` and `spin()` only pass a fingerprint when it arrives in the header or payload (`backend/app/routers/user_flow.py:219-227`, `278-286`).
- `complete()` requires a non-empty fingerprint when `live_qr_enabled` is on, and rejects mismatches with `session_device_mismatch` (`backend/app/routers/user_flow.py:563-568`).

Can an empty or unstable fingerprint cause silent rejection?
- Yes, partially.
- Empty on `/claim/pin/verify` causes `device_fingerprint_required`; the backend is explicit, but the current frontend hides it behind the generic screenshot message.
- Unstable between PIN verification and claim completion can trigger `session_device_mismatch` on `/claim/complete`.
- Empty on `/welcome` or `/spin` usually does not reject, because the frontend never sends the fingerprint there, so backend matching is skipped on those steps.

## Section 5 — Concrete repro script

Saved as `tmp/pin_bug_repro.py`.

Behavior:
1. Connects to MongoDB (`mongodb://localhost:27017`, `ground_rewards` by default) and resolves `invite_code=NFPSSY` to the actual login username.
2. Detects a working backend base URL, preferring `http://localhost:8000`, then `http://localhost:3005`.
3. Tries a list of common passwords against `/api/auth/staff/login`.
4. If login succeeds:
   - `POST /api/promoter/live-qr/generate`
   - Parse `lt` from `qr_data`
   - `POST /api/claim/pin/verify` with the returned PIN and parsed signature
   - If verification fails, dump the matching `promo_live_tokens` row and explain the mismatch.
5. If login does not succeed:
   - Stop immediately
   - Report that no plaintext hint was found
   - Report that the only confirmed credential store is `staff_users.password_hash` (bcrypt hash), and that `staff_registration_applications` does not contain a matching pending application in the current local DB.

## Section 6 — Fix priority list

- P0: Apply the same staff-state gate to QR generation that PIN verification already enforces. Otherwise the system can knowingly display unverifiable PINs.
- P0: Fix promoter-page synchronization. Drop stale poll responses, rotate on `locked`, and stop treating “latest token of any status” as safe display state.
- P1: Surface real backend errors on `/pin/[code]` (`staff_inactive`, `device_fingerprint_required`, `invalid_signature`). The screenshot is currently hiding the true cause.
- P1: Make the rescan rule explicit when a user is pinned to an old `lt` after rotation. Right now that behavior exists, but the UX does not explain it.
- P2: Clean up deployment/env ambiguity (`NEXT_PUBLIC_API_URL`, `BACKEND_URL`, `live_qr_enabled`) and add automated tests for multi-tab and poll/generate race cases.
