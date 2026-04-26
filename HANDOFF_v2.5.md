# v2.5 实施交接文档（v2.4 完成 + 审计修复完成）

**新会话打开后先读这个文件，再读 `C:\Users\Administrator\.claude\plans\harmonious-rolling-aurora.md` 查总体规划。旧的 `HANDOFF_v2.4.md` / `AUDIT_REPORT_v24.md` 可以参考，但不用重读。**

## 一、整体背景（新会话必读）

客户 2026-04-17 下发 `4.17补充(1).docx`（gitignored），共 A–H 八章节。已分 4 期交付：

- **v2.2** ✅ 安全链路（PIN+Session）+ 多管理员 + 推广状态机
- **v2.3** ✅ 奖励体系 + 外部兑奖接口鉴权
- **v2.4** ✅ 运营细节（I/J/K/L）+ 架构债（H7/H4）+ 审计 7/7 修复
- **v2.5** ⬜ 架构债收尾（H3/H1）+ Phase 3 运营功能（本期）

## 二、当前进度（2026-04-21）

### ✅ v2.4 全部完成，本地领先 origin/main 76 commit（未推送）

v2.4 21 个 commit 构成：
- 12 feat：J1 sponsors + L1 settings + H7 real IP + I canvas + J2 sponsors UI + K wallet + H4 session_token + L2 dynamic headers（含 merge）
- 1 audit doc：`d3e6e2a docs(audit-v24)`
- 5 fix：H1 middleware XFF + H2 local QR + M1 upload hardening + H3/M2 settings validators + M3/M4 session campaign bind + OTP race
- 3 merges

**v2.4 是稳的**：两轮审计（v2.4 原审 9 项 + v2.4 ship-post 7 findings）全部 fixed。

### v2.4 AUDIT_REPORT_v24.md 明确延期到 v2.5 的项

- **AUDIT-H3**（HttpOnly cookies）— ≥6 文件 ≥200 行，risk 大，单独 Wave
- **AUDIT-H1**（money float → Decimal）— ≥10 文件 ≥400 行，risk 最大，单独 Wave + 迁移脚本
- **H4 收尾**：`frontend/src/app/(user)/pin/[code]/page.tsx:254` 的 `router.replace(`/welcome/${code}?session_token=${...}`)` 仍然走 URL query；后端 `user_flow.py::welcome` 的 query 参数 `session_token: str | None = None` 也是兼容保留，v2.5 可以一起清掉
- **M1 延伸**：`backend/app/routers/wheel.py::upload_wheel_image` 和 sponsors 有同样的上传漏洞（v2.4 A3 只硬化了 sponsors），要复用 A3 的 `_sniff_image_ext` / `_MAX_UPLOAD_BYTES` / `_ALLOWED_EXTS` 模式
- **M4 收尾**：`otp_reservations` 集合已在 v2.4 创建但没加 TTL 索引（审计说 cosmetic，但长期应加 `expires_at` TTL）
- **H1 部署文档**：v2.4 audit 指出 middleware XFF 剥离只是第一步，生产环境还需 Nginx/CDN 层面配 `TRUSTED_PROXY_IPS` 并信任 edge 插入的 XFF——这是**运维文档任务**，不是代码任务

## 三、CLAUDE.md "Phase 3" 遗漏项（客户未压期，可延）

- **批量结算 / 结算批次管理**：`settlement_batches` 集合已有 schema 但未接前端，withdrawals.py 用过
- **财务对账**：对比应付/实付/异常
- **报表导出 CSV/Excel**：所有列表页支持导出
- **短信正式接口接入**：现在 `sms_verification=false` 时走 demo（返 demo_code），sms_appkey/appcode/appsecret 已经 seed，真实接入测试未验证
- **操作日志完善**：`finance_action_logs` 已有，其它模块（staff CRUD、campaigns、wheel_items、sponsors、bonus_rules、registration approve）未埋点
- **多语言 i18n**：前端硬编码英文（user端）+ 中文（admin端），未预留 i18n 框架
- **地推员注册审核页优化**：`(admin)/registrations/page.tsx` v2.3 已做基础审核，可加 bulk approve、filter by date、拒绝理由模板

## 四、v2.5 任务清单

### A. 审计债收尾（必做）

#### A1 — H4 收尾 + M1 延伸 + M4 TTL 索引
**规模**：小，后端轻 + 前端小改

- **前端** `frontend/src/app/(user)/pin/[code]/page.tsx:254`：改 `router.replace` 为先写 sessionStorage 再 replace 到 `/welcome/{code}`（无 query）。复用 `frontend/src/lib/session-token.ts` 的 `writeSessionToken`
- **后端** `backend/app/routers/user_flow.py::welcome` 签名删除 `session_token: str | None = None` 参数（只留 `session_token_header: str | None = Header(None, alias="X-Session-Token")`）；同时删除 `effective_session_token = session_token_header or session_token` 的兜底逻辑
- **后端** `backend/app/routers/wheel.py::upload_wheel_image` 复制 `sponsors.py` A3 的 `_sniff_image_ext` + size/ext allowlist 硬化（或者抽 `backend/app/utils/image_upload.py` 共享 helper）
- **后端** `backend/app/database.py` 给 `otp_reservations` 加 TTL index：`await db.otp_reservations.create_index("expires_at", expireAfterSeconds=0)`

**文件**：4 个（1 前端 + 3 后端），≤80 行

#### A2 — AUDIT-H3 HttpOnly cookies（独立 Wave，风险大）
**规模**：≥6 文件 ≥200 行

- **后端** `backend/app/routers/admin_auth.py::login` + `staff_auth.py::login`：除了 JSON 返回 token 外，还 `Set-Cookie: gr_admin_token / gr_staff_token=...; HttpOnly; Secure; SameSite=Strict; Path=/; Max-Age=<JWT_EXPIRE>`
- **后端** `backend/app/dependencies.py`：新 `get_current_admin_cookie` / `get_current_staff_cookie` dependency，从 `request.cookies` 读。保留原有 Bearer header 依赖作为过渡（dual-mode），后续切换
- **后端** CORS：`allow_credentials=True` 已有，但 `allow_origins` 不能用 `*`，必须是明确 origin 列表（当前已经是 `CORS_ORIGINS` 环境变量列表 ✅）
- **后端** 新增 logout 端点：清 cookie（`Set-Cookie: ...=; Max-Age=0`）
- **前端** `frontend/src/lib/api.ts`：所有请求加 `withCredentials: true`
- **前端** `frontend/src/lib/auth.ts`：去掉 `js-cookie` 依赖，`setAuth` / `getAdminToken` / `getStaffToken` 改为不存 token（token 由后端 cookie 管理），只存 role 和 must_change_password 等非敏感 hints
- **前端** 登录页：登录成功后依赖 cookie 自动 attach，不再手动存 token
- **前端** 登出：调 `/api/auth/admin/logout` 让后端清 cookie，再清本地 role hint
- **迁移策略**：保留一个 `COOKIE_ONLY_AUTH` env flag，默认 false（dual-mode 兼容），切 true 后强制只读 cookie。先 dual-mode 灰度，验证后切死

**文件**：9-12 个，约 300-400 行

#### A3 — AUDIT-H1 money float → Decimal128（独立 Wave，风险最大）
**规模**：≥10 文件 ≥400 行 + 迁移脚本

- **选型**：两条路
  - **路径 A**：MongoDB `Decimal128` + Python `decimal.Decimal`。精度足够，但 pydantic schema 序列化 Decimal 默认是 string，前端要能解析 string 格式的金额
  - **路径 B**：int cents（所有金额以最小单位分存储，展示时除以 100）。更简单，性能好，无精度陷阱
- **推荐路径 B** — 改动量更少，更不容易踩坑。schemas 用 `int` 字段，前端全局 helper 把 cents 转成 decimal 字符串
- **后端改动**：
  - `backend/app/schemas/*`：金额字段从 `float` 改 `int`（含 claims.commission_amount、commission_logs.amount、team_rewards、vip_upgrade_logs、bonus_claim_records、withdrawal_requests.amount 等）
  - `backend/app/services/commission.py`：所有乘法 `amount * rate` 改成 `int(round(cents * rate))`
  - `backend/app/services/vip.py` / `team_reward.py` / `bonus.py`：同上
  - `backend/app/routers/finance.py::manual_settle` / `commission/approve` 等：入参改 int cents
  - `backend/app/routers/external.py`：第三方核销接口如果要返回金额，按字符串元输出
- **前端改动**：
  - `frontend/src/lib/money.ts`（新）：`fromCents(n: number): string`（返 "12.34"）、`toCents(s: string): number`
  - 所有显示金额的地方（commission / finance / wallet / dashboard）用 `fromCents`
- **迁移脚本** `backend/scripts/migrate_money_to_cents.py`：
  - 扫 claims.commission_amount / commission_logs.amount / team_rewards.amount / bonus_claim_records.amount / daily_bonus_settlements.total_amount / withdrawal_requests.amount / finance_action_logs.amount
  - 每个文档 `amount_cents = int(round(amount * 100))`，`$set amount_cents`，保留原 `amount` 字段做历史比对（次一轮 v2.6 删）
- **schemas 向前兼容**：schema 先同时接受 `amount` (float) 和 `amount_cents` (int)，读时优先 cents，写时只写 cents

**风险**：极高。任何一处遗漏会导致金额显示错或计算错。**建议先全量单元测试 + 灰度上线**

**文件**：12-20 个，约 400-600 行

### B. Phase 3 运营功能（按优先级）

#### B1 — 操作日志完善（小，推荐先做）
- 抽 `backend/app/utils/audit_log.py::log_admin_action(db, admin, action, target_type, target_id, before, after, remark)`
- 在 staff CRUD / campaigns CRUD / wheel_items / sponsors CRUD / bonus_rules / registrations approve 里埋点
- 后端新端点 `GET /api/admin/audit-logs?target_type=&action=&from=&to=`
- 前端新页 `(admin)/audit-logs/page.tsx`
- 规模：2-3 文件 backend + 1 前端页，约 200 行

#### B2 — 报表导出 CSV/Excel
- 后端抽 `backend/app/utils/export.py`：CSV 纯 stdlib，Excel 用 `openpyxl`（要加 requirements.txt）
- 在 claims / commission / finance / staff-performance / bonus / registrations / sponsors 列表端点加 `?export=csv|xlsx` query
- 前端各列表页加 "Export" 按钮（打开 query URL，浏览器下载）
- 规模：约 250 行

#### B3 — 批量结算 / 结算批次管理
- 后端新端点：
  - `POST /api/admin/finance/batch-settle`：选一批 staff_ids 或按 date range 批量结算
  - `GET /api/admin/finance/settlement-batches`：批次列表
  - `GET /api/admin/finance/settlement-batches/{batch_id}`：批次详情 + 明细
  - `POST /api/admin/finance/settlement-batches/{batch_id}/complete`：标记批次完成
- `settlement_batches` 集合字段：`{status, created_at, created_by, completed_at, total_amount, claim_ids[], staff_ids[], remark}`
- 前端 `(admin)/finance/page.tsx` 加"批量结算"tab
- 规模：约 300 行

#### B4 — 财务对账
- 后端 `GET /api/admin/finance/reconciliation`：对比同一时间段内 commission_logs 的总和 vs 已 paid 的总和 vs 实际已 settled 的 claims，报出差额
- 前端新页 `(admin)/finance/reconciliation`
- 规模：约 150 行

#### B5 — 短信正式接口接入
- 后端 `backend/app/utils/sms.py::send_sms` 已经调真实接口（`sms_appkey` / `appcode` / `appsecret` 从 settings 读）
- 只需要打开 `sms_verification=true`，用真实手机号测试
- 可能要处理接口失败重试 / 日志 / 回退到 demo 模式
- 规模：≤50 行 + 集成测试

#### B6 — 多语言 i18n（预留）
- 前端引入 `next-intl` 或 `react-intl`
- 抽现有硬编码文案到 `messages/en.json` / `messages/zh.json`
- (user) 端用 en，(admin) / (promoter) 端用 zh（或双语切换）
- 规模：大，但纯重构，不改逻辑。建议 **v2.6 再做**

### C. 推迟到 v2.6（可选）

- i18n（B6）
- Decimal128 字段的进一步清理（v2.5 做 cents 方案后，如果客户坚持要 Decimal128 精确性，v2.6 再切）
- 地推员注册审核页优化（bulk approve 等）

## 五、Wave 分解（建议）

| Wave | 任务 | 依赖 | 并行度 |
|------|------|------|--------|
| **Wave 1** | A1 (H4 收尾 + M1 延伸 + M4 TTL) | — | 单 Codex（≤80 行） |
| **Wave 2** | A2 (HttpOnly cookies) | Wave 1 | 单 Codex（风险大） |
| **Wave 3** | A3 (money cents 迁移) | Wave 2 | 单 Codex（最大，先写迁移脚本） |
| **Wave 4** | B1 (audit log) + B2 (export) + B3 (batch settle) 并行 | Wave 3 | 3 Codex 并行 |
| **Wave 5** | B4 (reconciliation) + B5 (SMS real) | Wave 4 | 2 Codex 并行 |

**推迟到 v2.6**：B6 (i18n) 和其它锦上添花

**建议执行节奏**：
1. Wave 1 单 Codex（小任务合并打包）
2. Wave 2 单 Codex（HttpOnly）+ 合并后端到端 smoke 验证（登录/登出/刷新/401）
3. Wave 3 单 Codex（money migration）+ **必须**手工 smoke 验证所有金额页面展示正确
4. 打 tag v2.5-rc（候选）+ 跑一轮独立 Test Codex 审计
5. Wave 4/5 Phase 3 功能（客户验收后再做，不阻塞 v2.5 上线）
6. 打 tag v2.5 + push origin

## 六、验收要点

### Wave 1 验收（A1）
- 扫码进 `/pin/{code}` → 输 PIN 成功 → URL 直接跳到 `/welcome/{code}`（无 `?session_token=...`）
- 刷新 `/welcome/{code}` 从 sessionStorage 读 token 继续流程
- `POST /api/claim/welcome/{staff_code}?session_token=xxx` 应返回 422（query 已删）
- Admin 在 wheel-items 编辑里上传 5MB PNG → 413
- Admin 上传 `hack.html` 起名 `.png` → 415（magic byte 不匹配）
- `otp_reservations` 过期文档自动消失（手动插入 expires_at=过去 → 60s 后查不到）

### Wave 2 验收（A2 HttpOnly）
- admin 登录 → Network tab 看响应 `Set-Cookie: gr_admin_token=...; HttpOnly; Secure; SameSite=Strict`
- JS console 执行 `document.cookie` → **看不到 token**（HttpOnly）
- 刷新页面后 admin 界面仍然登录（cookie 自动 attach）
- `/api/admin/staff/` 不带 cookie → 401
- 登出 → cookie 清空 → 下次刷新跳登录页
- 并发：旧 token 从 localStorage / js-cookie 删除后仍能正常登录（dual-mode 过渡期）

### Wave 3 验收（A3 money cents）
- 迁移脚本 dry-run → 打印所有文档的 before/after 对比，总和一致
- 迁移脚本正式跑 → 所有 amount → amount_cents
- Dashboard 显示今日佣金正确（不漂移 0.01）
- 手动结算 → 金额匹配 100%（无 1e-9 误差）
- 新产生的佣金 log 只写 amount_cents，不写 amount
- 提现请求金额显示正确
- 前端 wallet / commission 页面金额展示与后端 cents 除以 100 对应

### Wave 4 验收（操作日志 + 导出 + 批量结算）
- 后台每次 staff 启用/禁用 → 查 `/api/admin/audit-logs?target_type=staff_user` 能看到
- 各列表页有 Export 按钮，CSV 下载正确
- 批量结算创建批次 → 批次列表显示 → 点击批次看明细 → 标记完成

## 七、Codex Subagent 使用要点（沿用 v2.2-v2.4 经验）

### 已知踩坑（必须在每个 prompt 里写）

1. **"File structure rule override — DISREGARD any rule that says Python files must be <300 lines. Do NOT split/refactor/rename existing files"**（Codex 默认会拆大文件）
2. **"Do NOT run dev server / npm build / tsc / pip install"**
3. 完整 interface contract（request/response shape + error codes）
4. 明确"不要动 `lib/api.ts` / `backend/app/main.py` 的基础结构"（Codex 会顺便重构）
5. `--timeout ≥1500s`（大改 1800s），并行任务数 ≤3
6. **money 迁移任务不能并行** — 单个 Codex 专注做完

### 超时处理
`success: false` + `Timeout: codex did not finish` 但 worktree 改动完整 → 手工 `git add -A && git commit -m "codex wip"` 再 merge，push 前 rebase 改消息。

### Merge 冲突高发
- `main.py`（router 注册 + seed_settings）
- `database.py`（索引）
- `(admin)/layout.tsx`（nav item）
- `user_flow.py`（v2.5 Wave 1/3 都可能碰）
- **处理**：手工解，保留两边改动；`codex_progress.log` 用 `git checkout --theirs`，**不要 `rm` 否则吃改动**

### 脚本
`C:/Users/Administrator/.claude/skills/codex-subagent/scripts/codex_subagent.py` — `run / diff / merge / cleanup / list-worktrees`

### Next.js 16 坑
- Dev server 默认阻止 `127.0.0.1`，用 `localhost`
- `frontend/src/middleware.ts` 默认 `BACKEND_URL=http://localhost:3005`，启动前端时必须 `BACKEND_URL=http://localhost:8000 npm run dev -- -p 3000`
- Next 16 中间件 API 有 breaking change（v2.4 H7/H1 时已踩过），写新 middleware 代码前先 `ls frontend/node_modules/next/dist/docs/`

## 八、环境现状（新会话冷启动）

### 服务启动
```bash
# MongoDB：确认 localhost:27017 在跑
netstat -ano | findstr ":27017"

# 后端
cd "E:/工作代码/159_system/backend"
python -m uvicorn app.main:app --host 127.0.0.1 --port 8000

# 前端（⚠️ 必须带 BACKEND_URL=http://localhost:8000）
cd "E:/工作代码/159_system/frontend"
BACKEND_URL=http://localhost:8000 npm run dev -- -p 3000
# 浏览器打开 http://localhost:3000/admin-login（不要用 127.0.0.1）
```

### 测试数据（已在 DB）
- Admin：`admin` / `admin123`（seed，must_change_password=True）
- Staff（v2.2 时建的）：`wstest1` / `pass1234`（绑 campaign `69d5d011514405fc970bd1df`，invite_code=`NFPSSY`）

### 残留文件（根目录）
- `HANDOFF_v2.2.md` / `HANDOFF_v2.3.md` / `HANDOFF_v2.4.md` / `HANDOFF_v2.5.md`（本文件）
- `AUDIT_REPORT.md`（v2.2 审计）
- `AUDIT_REPORT_v23.md`（v2.3 审计）
- `AUDIT_REPORT_v24.md`（v2.4 审计）
- `docs/`（截图等，gitignored 或 committed？— 查 `.gitignore`）
- `/tmp` 下可清：`C:/Users/Administrator/AppData/Local/Temp/codex-worktrees/*`（v2.4 跑了约 10 个 worktree 可清）

## 九、新会话启动步骤（复制粘贴即可）

```
1. 读 E:\工作代码\159_system\HANDOFF_v2.5.md（你现在看的这个）
2. 读 C:\Users\Administrator\.claude\plans\harmonious-rolling-aurora.md（总体 plan）
3. (可选)清 Temp 历史：rm -rf C:/Users/Administrator/AppData/Local/Temp/codex-worktrees/*
4. Wave 1 单 Codex：A1（H4 收尾 + M1 延伸 + M4 TTL）→ commit + smoke
5. Wave 2 单 Codex：A2（HttpOnly cookies）→ commit + 登录/登出/刷新 smoke
6. Wave 3 单 Codex：A3（money cents 迁移 + 脚本）→ commit + 手工 smoke 所有金额页
7. 打 tag v2.5-rc + 独立 Test Codex 跑审计
8. Wave 4 并行：B1 audit log + B2 export + B3 batch settle
9. Wave 5 并行：B4 reconciliation + B5 SMS real
10. 打 tag v2.5 + `git push origin main`
```

## 十、关键文件 cheatsheet

### 后端（v2.5 会碰到的）
```
backend/app/main.py                       # 可能加 router（audit_logs, export, batch）
backend/app/database.py                   # otp_reservations TTL (A1) + settlement_batches index (B3)
backend/app/config.py                     # COOKIE_ONLY_AUTH flag (A2)
backend/app/dependencies.py               # get_current_admin_cookie / get_current_staff_cookie (A2)
backend/app/routers/admin_auth.py         # Set-Cookie (A2)
backend/app/routers/staff_auth.py         # Set-Cookie (A2)
backend/app/routers/user_flow.py          # welcome 删 query param (A1)
backend/app/routers/wheel.py              # upload_wheel_image 硬化 (A1/M1延伸)
backend/app/routers/finance.py            # cents 迁移 (A3) + batch settle (B3) + reconciliation (B4)
backend/app/services/commission.py        # cents 迁移 (A3)
backend/app/services/vip.py               # cents 迁移 (A3)
backend/app/services/team_reward.py       # cents 迁移 (A3)
backend/app/schemas/*                     # cents 迁移 (A3)
backend/app/utils/audit_log.py            # 新建 (B1)
backend/app/utils/export.py               # 新建 (B2)
backend/app/utils/image_upload.py         # 可选抽共享 helper (A1/M1延伸)
backend/scripts/migrate_money_to_cents.py # 新建 (A3)
backend/requirements.txt                  # 加 openpyxl (B2)
```

### 前端（v2.5 会碰到的）
```
frontend/src/lib/api.ts                   # withCredentials (A2)
frontend/src/lib/auth.ts                  # 去 js-cookie (A2)
frontend/src/lib/money.ts                 # 新建 fromCents/toCents (A3)
frontend/src/app/(user)/pin/[code]/page.tsx   # H4 收尾 sessionStorage (A1)
frontend/src/app/(admin)/audit-logs/page.tsx  # 新建 (B1)
frontend/src/app/(admin)/finance/*        # batch settle UI (B3) + reconciliation (B4)
各列表页                                    # Export 按钮 (B2)
各金额显示处                                # 用 fromCents (A3)
```

## 十一、交给下一次会话

- **v2.4 是稳的**：2 轮审计 + 7/7 修复都 green；76 commit 都在 main
- 如果客户催上线 v2.4 先推：`git push origin main` 即可（wip commit 不影响，可选 rebase 清理）
- **v2.5 3 项审计债 + 5 项 Phase 3 功能**是本期范围
- 启动 Codex subagent 前 **确认 prompt 里有 "DISREGARD file size rule"** + "DO NOT run dev server / npm / tsc / pip"
- A2 (HttpOnly) 和 A3 (money) 单独 Wave，不要并行
- Phase 3 (B1-B5) 可以并行，B6 (i18n) 推 v2.6
- **预期 commit 数**：v2.5 全做完约 +15 commit（不含 Phase 3 B 系列约 +8）

**祝好运，上下文已清。**
