# v2.5-rc Audit — Part A

## 1. Section A Compliance

| # | Requirement | Status | Evidence | Note |
|---|---|---|---|---|
| A1 | 管理员账户管理页面（CRUD、角色、启禁用、重置密码） | ⚠ | frontend/src/app/(admin)/admins/page.tsx:256; backend/app/routers/admins.py:125 | 页面和接口基本齐全，但创建请求未提交 `role`，创建时角色选择不会生效。 |
| A2 | last_login_at + must_change_password on reset | ✅ | backend/app/routers/admin_auth.py:31; backend/app/routers/admins.py:188; frontend/src/app/(auth)/admin-login/page.tsx:158 | 登录写入 `last_login_at`，禁用账号拒绝登录，重置密码后返回强制改密标记并弹出改密流程。 |
| A3 | 系统设置页（项目名/活动/跳转/结算单价/API Key） | ⚠ | backend/app/main.py:103; frontend/src/app/(admin)/settings/page.tsx:41 | 通用系统设置页存在，`project_name/activity_title/activity_desc/default_redirect_url/external_api_key` 可编辑；未找到明确的“每个有效领取结算单价”配置项。 |
| A4 | 客服链接 WhatsApp/Telegram + 悬浮按钮 | ✅ | backend/app/routers/public_settings.py:8; frontend/src/components/customer-service-fab.tsx:40; frontend/src/app/(user)/layout.tsx:1 | 后台设置项、公开读取接口和前台悬浮按钮都已接通。 |
| A5 | 赞助商管理（上传多图、登录/抽奖页展示） | ⚠ | backend/app/schemas/sponsors.py:7; frontend/src/app/(admin)/sponsors/page.tsx:138; frontend/src/app/(user)/wheel/[code]/page.tsx:295 | 后台赞助商管理和图片上传存在，但数据模型是单个 `logo_url`，且展示只确认到抽奖页，未见地推登录页接入。 |
| A6 | 地推注册审核（通过/拒绝/备注/审核人/自动建号） | ⚠ | backend/app/routers/registrations.py:139; frontend/src/app/(admin)/registrations/page.tsx:151 | 审核通过/拒绝、记录审核人时间、通过后自动建号和生成邀请码已实现；仅拒绝支持填写原因，未见通用审核备注/审核信息展示。 |
| A7 | 奖励管理视角（今日各项统计） | ❌ | frontend/src/app/(admin)/dashboard/page.tsx:38; frontend/src/app/bonus/admin-records-tab.tsx:18 | 仅见基础 dashboard 统计和冲单奖励记录/结算统计，未见“今日现场奖/兑奖码核销奖/已领取/可领取/各阶梯情况”的专门视角。 |
| A8 | 地推员列表筛选（在线/推广状态/启禁用） | ⚠ | frontend/src/app/(admin)/staff/staff-management-content.tsx:264; backend/app/routers/staff.py:124 | 已支持关键词、启禁用、在线/离线筛选；未见“推广中/已暂停/已停止”的工作状态筛选。 |
| A9 | 地推员列表时间戳展示 | ⚠ | frontend/src/app/(admin)/staff/staff-table.tsx:58; backend/app/schemas/staff.py:104 | 列表展示了在线状态和 `last_login_at`，API 也带有开始/停止/暂停/恢复时间，但表格未实际展示这些推广时间戳。 |
| A10 | 暂停/恢复推广 + QR 立即失效 | ❌ | backend/app/routers/promoter.py:445; backend/app/routers/user_flow.py:687 | 只有地推员自助 start/stop/pause/resume，未见管理员暂停/恢复入口；暂停逻辑未失效现有 live token，PIN 校验也未检查暂停/停止状态。 |
| A11 | 员工推广记录页 | ❌ | backend/app/routers/promoter.py:422; frontend/src/app/(admin)/layout.tsx:9 | 后端会写 `promotion_activity_logs`，但未找到管理员查看“员工推广记录”的页面或接口。 |
| A12 | 默认 + 地推员专属 bonus 规则 | ⚠ | backend/app/main.py:97; backend/app/routers/bonus.py:150; frontend/src/app/bonus/admin-bonus.tsx:49 | 默认团队奖励阈值通过系统设置存在，冲单奖励支持全局默认 + 地推员专属规则；未见单个地推员的“层次奖励”专属阶梯。 |
| A13 | 地推员编辑页开关（QR/签名链接/旧链接/必须开工/风控冻结/日额上限/收款账户） | ❌ | frontend/src/app/(admin)/staff/staff-form-modal.tsx:6; frontend/src/types/index.ts:1 | 编辑页只有基础资料字段，未见题述各类控制开关、限额或后台维护的收款账户信息。 |
| A14 | 合并结算 + 复制收款 + 一键已结算 | ⚠ | backend/app/routers/finance.py:112; frontend/src/app/(admin)/finance/staff-performance-section.tsx:23 | 财务页支持人工结算，但结算逻辑仍按 claim 佣金走，`total_bonus` 未进入合并结算流程；未见复制收款信息和最近结算记录 UI。 |

## 2. Section B Compliance

| # | Requirement | Status | Evidence | Note |
|---|---|---|---|---|
| B1 | 注册页（姓名/账号/手机/密码/验证码 + 待审核） | ⚠ | frontend/src/app/(auth)/staff-register/page.tsx:11; backend/app/routers/staff_auth.py:178 | 独立注册页和“待审核”后端状态已实现，但表单/Schema 仅有 `name/phone/username/password/invite_code`，缺少确认密码和注册验证码。 |
| B2 | 添加管理员 WhatsApp 入口 | ❌ | frontend/src/app/(auth)/staff-register/page.tsx:147 | 注册页只有返回登录入口，未见管理员 WhatsApp 入口。 |
| B3 | 地推员首页移动端 + 实时刷新 | ⚠ | frontend/src/app/(promoter)/home/page.tsx:425; frontend/src/app/(promoter)/layout.tsx:46 | 首页布局明显偏移动端；但首页数据仅在进入页面和操作后刷新，周期性只有 heartbeat，没有实时数据刷新。 |
| B4 | Start/Stop Promotion 控制 + 按开关 | ⚠ | frontend/src/app/(promoter)/home/page.tsx:88; backend/app/routers/promoter.py:380 | Start/Stop/Pause/Resume 控制存在，但 Live QR 生成未检查 `work_status`，也未见“必须先开始推广”后台开关。 |
| B5 | Live QR+PIN 工作区（二维码/PIN/倒计时/链接/全屏/刷新/保存） | ⚠ | frontend/src/app/(promoter)/qrcode/page.tsx:146 | 工作区已具备二维码、PIN、倒计时、链接、刷新和全屏；未见“打开”和“保存”动作。 |
| B6 | 成功验证后立即失效 + 自动轮换 | ⚠ | backend/app/routers/user_flow.py:687; frontend/src/app/(promoter)/qrcode/page.tsx:233 | 服务端会把 token 置为 `consumed/expired/locked`，但前台仅在到期或手动刷新时重新生成，未实现成功验证后的即时自动轮换。 |
| B7 | Bonus Mission Ladder（仅核销兑奖码统计 + 阶梯单领） | ⚠ | backend/app/services/bonus.py:64; backend/app/routers/bonus.py:275 | 阶梯单独领取一次已支持；但统计口径是当天所有 `claims.status=success`，未限定为“已核销兑奖码”且未排除现场奖。 |
| B8 | Recent Claim Records 模块 | ❌ | backend/app/routers/promoter.py:111; frontend/src/app/(promoter)/home/page.tsx:431 | 未找到展示奖项、手机号、奖励类型、结算状态的“Recent Claim Records”模块或对应前台数据源。 |
| B9 | 支付账户维护 + 复制收款 | ⚠ | frontend/src/app/(promoter)/wallet/page.tsx:30; backend/app/routers/promoter.py:175 | 支付账户维护已实现，且钱包页保留了结算记录；未见一键复制收款信息。 |
| B10 | 暂停/风控状态提示 + 禁止开工 | ❌ | backend/app/dependencies.py:77; frontend/src/app/(promoter)/home/page.tsx:88 | 仅有通用“Account disabled”鉴权拦截；未见管理员暂停/风控冻结专属状态、提示文案或禁止开工逻辑。 |

## 3. Wave 1 A1 Regression — H4/M1/M4 (commit 2d3a258)

One sub-section per concern. No fluff.

### 3.1 H4 — PIN redirect drops URL query
- Diff check: `frontend/src/app/(user)/pin/[code]/page.tsx:254-256` writes sessionStorage via `writeSessionToken(code, ...)` and redirects with `router.replace(\`/welcome/${code}\`)`.
- Backend: `backend/app/routers/user_flow.py:191-196` `welcome` only accepts `X-Session-Token` header, not a `session_token` query param.
- Grep for lingering `?session_token=` construction: none found.
- Probe: `frontend/src/app/(user)/welcome/[code]/page.tsx:40-57` and `frontend/src/app/(user)/wheel/[code]/page.tsx:67-99` both prefer sessionStorage and only read URL query as a backward-compat migration path before stripping it.

Findings: none

### 3.2 M1 — Wheel upload hardening via shared `validate_image_upload`
- Verified `backend/app/routers/wheel.py:117-126` calls `validate_image_upload(content)`.
- Verified `backend/app/utils/image_upload.py:10-45` centralizes size cap, magic-byte sniffing, and allowlisted extensions.
- `backend/app/routers/sponsors.py:30-39` still keeps its own `_sniff_image_ext`; prompt explicitly says this is acknowledged and not a finding.

Findings: none

### 3.3 M4 — otp_reservations TTL + unique(phone, bucket)
- Verified `backend/app/database.py:90-95` creates both the TTL index on `expires_at` and the unique index on `(phone, bucket)`.
- Verified `backend/app/routers/user_flow.py:390-405` still uses atomic `(phone, bucket)` `find_one_and_update(..., upsert=True)` reservation logic.

Findings: none

## 4. Wave 2 A2 Regression — HttpOnly cookies (commit 01f540d)

### 4.1 Backend dual-mode
- Token extraction is centralized in `backend/app/dependencies.py:26-41`; sample protected routers still depend on `get_current_admin` / `get_current_staff` (for example `backend/app/routers/campaigns.py:21`, `backend/app/routers/finance.py:18`, `backend/app/routers/promoter.py:74`), and `get_super_admin` still chains through `get_current_admin` (`backend/app/dependencies.py:82-89`).
- `backend/app/config.py:27` keeps `COOKIE_ONLY_AUTH=False` by default, and `backend/app/dependencies.py:39-40` fully disables Bearer fallback when it is flipped to `True`.
- Logout endpoints exist at `backend/app/routers/admin_auth.py:93-96` and `backend/app/routers/staff_auth.py:244-247`.
- Refresh endpoints prefer cookies but still accept body refresh tokens: `backend/app/routers/admin_auth.py:46-53` and `backend/app/routers/staff_auth.py:149-156`.
- CORS is configured with `allow_credentials=True` and explicit origins via `settings.cors_origin_list` in `backend/app/main.py:148-153`.

### 4.2 Frontend
- `frontend/src/lib/api.ts:34-43` enables `withCredentials: true` on both axios clients.
- `frontend/src/lib/auth.ts:60-76` has no `js-cookie` import and returns `undefined` from `getAdminToken()`, `getStaffToken()`, and `getRefreshToken()`.
- Login pages call `setAuth`: `frontend/src/app/(auth)/admin-login/page.tsx:138-140` and `frontend/src/app/(auth)/staff-login/page.tsx:19-21`.
- Logout is server-backed before local hint clear on the interactive logout controls that exist: `frontend/src/app/(admin)/layout.tsx:68-75` and `frontend/src/app/(promoter)/home/page.tsx:415-418`. No separate logout button was found in `frontend/src/app/(promoter)/layout.tsx`.

### 4.3 Edge cases to probe
- Public endpoints remain ungated by auth dependencies: `backend/app/routers/user_flow.py:21`, `backend/app/routers/public_settings.py:6`, `backend/app/routers/sponsors.py:24`, and `backend/app/routers/external.py:10` do not use `get_current_admin` / `get_current_staff`.
- The 401 refresh queue is still per-role and serialized via `isRefreshing` + `failedQueue` in `frontend/src/lib/api.ts:46-49` and `frontend/src/lib/api.ts:144-198`.
- The admin must-change-password flow posts to `frontend/src/app/(auth)/admin-login/page.tsx:187` without a manual `Authorization` header; with token getters shimmed to `undefined`, it relies on the login cookie path as intended.
- Old Bearer clients remain compatible while dual-mode is enabled because `backend/app/dependencies.py:36-41` prefers cookie but still falls back to `Authorization` when `COOKIE_ONLY_AUTH=False`.

Findings: none

## 5. Summary for Part A

- Section A: Done 2 / Partial 8 / Missing 4
- Section B: Done 0 / Partial 7 / Missing 3
- Wave 1 regression findings: 0
- Wave 2 regression findings: 0
- Top 3 concerns (if any)
- A10/B10: 管理员暂停/风控冻结工作流缺失，现有 live QR/PIN 也不会因暂停立即失效。
- A13: 地推员编辑页缺少题述控制开关、限额和收款信息字段，后台控制面不完整。
- A14/B7: 奖励与结算链路仍有关键偏差，冲单统计口径不符，财务结算也未把奖励金额真正并入结算流程。
