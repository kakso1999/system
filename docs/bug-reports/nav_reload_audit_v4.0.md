# Nav Reload Audit v4.0

## 1. Root cause summary

Both the admin sidebar and the promoter bottom tab bar render their nav items with **plain `<a href>`** instead of Next.js' `<Link>`. A plain `<a>` triggers a full browser document navigation, which remounts the whole React tree — including the layout. The layout's auth guard (`checkingAuth` state) then flips back to `true` for a tick, rendering a full-screen spinner; all in-flight data loaders restart. On a slow backend this looks like "the page is reloading every time I click a tab."

Next.js App Router layouts are *persistent* across sibling segment navigations — but only when you use `<Link>` or `router.push()`. Fixing the two nav shells eliminates 99% of the symptom; a handful of stray `window.location.reload()` and post-mutation redirects add marginal noise.

## 2. Inventory

### 2.1 Admin shell — `frontend/src/app/(admin)/layout.tsx`
- L118: `<a key={item.href} href={item.href} ...>` (A) → **switch-to-Link** with `prefetch` for sidebar hover pre-fetching.
- L93: `if (checkingAuth) return <FullPageSpinner/>` — once fixed (via <Link>), this only runs on the very first mount, which is fine. (Optimization opportunity: render the shell immediately and gate only the inner `{children}` on auth.)

### 2.2 Promoter shell — `frontend/src/app/(promoter)/layout.tsx`
- L81-89: elevated tab (`<a ... href={item.href}>` for QR) (A) → **switch-to-Link**.
- L95-103: regular tab (`<a ... href={item.href}>`) (A) → **switch-to-Link**.
- L60: `if (checkingAuth) return <FullPageSpinner/>` — same note as admin.

### 2.3 Auth pages
- `(auth)/admin-login/page.tsx:140` — `window.location.href = "/dashboard"` (D) → **keep-login-reload** (deliberate: ensures localStorage role + HttpOnly cookies are all in sync when the admin layout remounts).
- `(auth)/staff-login/page.tsx:39` — `window.location.href = "/home"` (D) → **keep-login-reload**.
- `(auth)/staff-login/page.tsx:101` — `<a href="/staff-register">` (A, but cross-auth-group) → acceptable `<a>` because `(auth)` group has no shared state to preserve; but better: **switch-to-Link** for speed.
- `(auth)/staff-register/page.tsx:295` — `<a href="/staff-login">` (A) → **switch-to-Link**.

### 2.4 User flow pages
- `(user)/result/[id]/page.tsx:233` — `<a href={data.redirect_url} target="_blank" rel="noopener noreferrer">` (B) → **keep-native-external** (external redirect URL).

### 2.5 Sponsors / components
- `(admin)/sponsors/page.tsx:100` — `<a href={item.link_url} target="_blank" rel="noreferrer">` (B) → **keep-native-external**.
- `components/sponsors-carousel.tsx:26` — `<a href={item.link_url || undefined} target={item.link_url ? "_blank" : undefined}>` (B) → **keep-native-external**.

### 2.6 Other `window.location.*` usages
- `(admin)/staff/staff-form-modal.tsx:126` — `window.location.reload()` after successful staff create/edit (D') → **replace-with-router.refresh** to keep SPA state. (Router refresh re-fetches server components without a document reload.)
- `(admin)/staff/staff-table.tsx:40` — `window.location.reload()` after enable/disable (D') → **replace-with-router.refresh**.
- `components/lang-switcher.tsx:22` — `window.location.reload()` after locale change (D'') → **keep-native-reload** (locale switch often needs a full reload to re-fetch all server-rendered strings; acceptable). Optional: use `router.refresh()` if all i18n is client-side.

## 3. Additional reload triggers (beyond `<a>`)

- **Admin guard re-run**: `(admin)/layout.tsx` `useEffect([router])` only runs on mount (router identity is stable across navigations in App Router). It is NOT the cause of per-click flashes — the full document reload from `<a>` is.
- **Promoter heartbeat**: `(promoter)/layout.tsx:44-57` sets a 60s interval on mount; unaffected by tab-switching once `<Link>` is used.
- **No stale `key={...}` on children** found.
- **No `router.replace` inside render bodies** (only inside guarded useEffects — OK).

## 4. Fix plan

**Global rule**: In-app navigation uses `next/link` `<Link>` or `router.push()`. `window.location` only for: (1) login success, (2) logout, (3) locale switch.

### Per-file edits

| File | Change |
|---|---|
| `app/(admin)/layout.tsx:117-138` | Replace `<a>` with `<Link>`; keep all Tailwind classes & children; add `prefetch` (default). `import Link from "next/link"` at top. |
| `app/(promoter)/layout.tsx:81-103` | Same — replace both `<a>` branches with `<Link>`; add `import Link from "next/link"`. |
| `app/(auth)/staff-login/page.tsx:101` | `<a>` → `<Link>`. |
| `app/(auth)/staff-register/page.tsx:295` | `<a>` → `<Link>`. |
| `app/(admin)/staff/staff-form-modal.tsx:126` | `window.location.reload()` → `router.refresh()`. Inject `const router = useRouter()`. |
| `app/(admin)/staff/staff-table.tsx:40` | Same. |

### Optional guard optimization (not blocking)
In both layouts, stop rendering a full-page spinner while `checkingAuth` is true. Render the shell (sidebar/tab bar) immediately; only gate `{children}` with a small inline spinner slot. This means if the user types a URL directly, the nav shell paints instantly and only the main pane shows a spinner for ~50ms.

### Shared utility (optional)
Extract `<NavLink>` that wraps `<Link>` and computes `isActive` from `usePathname()`. Both layouts currently duplicate that. Not required for the perf fix — deferrable.

## 5. Parallelization plan (for Codex workers)

Only 1 worker is needed — the surface is small (≤7 files, ≤40 lines touched). Splitting would create merge friction. Recommend **single worker** named `nav-links`:

### Worker `nav-links`
**Files OWNED**:
- `frontend/src/app/(admin)/layout.tsx`
- `frontend/src/app/(promoter)/layout.tsx`
- `frontend/src/app/(auth)/staff-login/page.tsx`
- `frontend/src/app/(auth)/staff-register/page.tsx`
- `frontend/src/app/(admin)/staff/staff-form-modal.tsx`
- `frontend/src/app/(admin)/staff/staff-table.tsx`

**Requirements**:
1. Replace the six `<a href="/...">` sites listed in section 2 with `<Link href=...>` from `next/link`. Preserve classNames, children, key, and active styling.
2. Replace the 2 `window.location.reload()` sites in `staff/` with `router.refresh()`. Inject `const router = useRouter()` where missing.
3. DO NOT touch login `window.location.href = "/dashboard"|"/home"` — those are intentional.
4. DO NOT touch external `<a target="_blank">` anchors (sponsors, result redirect, sponsors-carousel).
5. DO NOT touch `lang-switcher.tsx`.
6. Verify no unused `window.location` import artifacts remain.
7. Optional: add `prefetch={false}` only if sidebar is very wide (skip by default; leave prefetch enabled).

**Files NOT to touch**: everything else.

## 6. Verification steps (post-fix)

1. Reload the app fresh. Open DevTools → Network → filter `Doc`.
2. Log in as admin. Click through Dashboard → Staff → Campaigns → Settings → Finance.
3. Expect **zero** new document (HTML) requests after the initial login page. Only RSC payloads (`?_rsc=...`) should appear.
4. Log in as staff. Tap through Home → Team → Earnings → Wallet → QR → Home.
5. Same expectation: no document reloads, shell stays mounted, bottom tab bar doesn't re-mount/animate.
6. Create a new staff in admin → confirm table updates without a full reload.

## Methodology

```bash
# relative <a href>
rg -nE '<a\s+[^>]*href=("/|\{)' frontend/src/app frontend/src/components

# imperative navigation
rg -nE 'window\.location\.(href|assign|replace|reload)' frontend/src/app frontend/src/components

# verify guards
rg -n 'checkingAuth' frontend/src/app

# find all <Link> imports (baseline)
rg -n 'from "next/link"' frontend/src
```

## Summary counts
- Class A (nav in-app): 6 sites
- Class B (external): 3 sites — keep as-is
- Class D (login reload): 2 sites — keep as-is
- Class D' (mutation reload): 2 sites — replace with `router.refresh()`
- Class D'' (locale): 1 site — keep as-is
- Proposed workers: **1** (`nav-links`)
