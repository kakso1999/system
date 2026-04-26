# v2.4 实施交接文档（v2.3 完成 + 二次审计修复完成）

**新会话打开后先读这个文件，再读 `C:\Users\Administrator\.claude\plans\concurrent-soaring-moonbeam.md` 查总体规划。旧的 `HANDOFF_v2.3.md` 和 `AUDIT_REPORT.md` / `AUDIT_REPORT_v23.md` 都可以参考，但不用重读。**

## 一、整体背景（新会话必读）

客户 2026-04-17 下发 `4.17补充(1).docx`（gitignored），共 A–H 八章节。已规划分 4 期：

- **v2.2** ✅ 安全链路（PIN+Session）+ 多管理员 + 推广状态机
- **v2.3** ✅ 奖励体系 + 外部兑奖接口鉴权
- **v2.4** ⬜ 运营细节（客服、赞助商、奖励图片、mock-redeem）+ 架构债（本期）
- **v2.5** ⬜（可选延期）运营/报表/SMS 正式接口/操作日志/批量结算

## 二、当前进度（2026-04-21）

### ✅ v2.3 全部完成，本地领先 origin/main 55 个 commit（未推送）

Recent commits（由上到下，新到老）：
```
2b931c4 docs(audit-v23): mark all 9 findings resolved + document PRODUCTION/ALLOW_INSECURE_JWT/external_api_key
77748a9 Merge branch 'codex-subagent/fix2-b-r-...'
16a5e7c fix(audit-v23): H2 claims.cancel state gate + H3/M4 atomic settle with zero-commission + M2 atomic registration approval
7d26a58 fix(audit-v23): C1 atomic spin filter + C4 empty JWT + H1 super_admin bonus + M1 partial unique + M3 preserve claimed bonuses
7d95b90 docs(audit): v2.3 post-ship audit (7 findings + 2 prior-fix concerns)
ab763b6 audit: v2.3 post-ship findings + fix verifications
503a0b0 fix(bonus): route via (admin)/bonus and (promoter)/sprint ...
25dfb6b Merge Wave 3 G3 (bonus UI)
5d5f9a1 Merge Wave 3 H2 (registrations UI)
3198443 Wave 3 F3 (claims settlement_status UI)
6d0fd04 Wave 2 G2 (promoter bonus endpoints)
56ccbd5 Wave 2 F2 (claims settlement_status 5-state + commission_amount)
9f12e7c Merge Wave 1 H1 (registrations)
24c36d0 Merge Wave 1 G1 (bonus admin)
f2bf11d Wave 1 F1 (X-API-Key on /api/external/*)
bc4bcc7 docs(audit): mark fixed/deferred status for v2.2 13 findings
72a038a Merge fix-frontend (audit spin_token, result_token, campaign-scoped OTP)
a81f98c Merge fix-be-b (user_flow server-authoritative spin + result_token + rollback)
93eee1d fix-be-a (JWT fail-fast + default admin rotation + spin_outcomes indexes + result_token helpers)
c41d308 Wave E4 (promoter Start/Stop/Pause/Resume UI + 60s heartbeat)
af68137 Merge Wave 3 B (live QR promoter workstation + user PIN + session-aware welcome/wheel) ← v2.2 end
```

### ✅ 两轮审计都已修复

- **AUDIT_REPORT.md** — v2.2 审计，13 findings，7 fixed / 6 deferred 到 v2.4
- **AUDIT_REPORT_v23.md** — v2.3 审计，2 concerns + 7 new findings，全部 fixed + I1 文档也补了

### 🟡 v2.4 需要做的事（以 AUDIT_REPORT.md 推迟的 + 客户原需求 Task I/J/K/L 为基础）

## 三、v2.4 任务清单

### A. 客户功能需求（原计划 Task I/J/K/L）

#### Task I — 成功页奖励图片下载 + /mock-redeem
**规模**：前端重，后端轻

- **前端** `frontend/src/app/(user)/result/[id]/page.tsx` — 在显示 reward_code 的地方加 "Download Reward Image" 按钮，点击后用 canvas 生成一张含 `reward_code` + 品牌 logo + 跳转 QR 的图片，让用户长按保存
- **前端** 新页 `frontend/src/app/mock-redeem/page.tsx` — 模拟"第三方核销页"，用户扫 QR 跳到这里，显示 `Congrats! Your reward code is <code>. Redeem at our shop by showing this.`；表单可提交反馈；**可选**：向 `/api/external/reward-code/{code}/redeem` 调用（需要 X-API-Key——这里要么前端代理、要么 mock 模式不真实核销）
- **后端**：无新增端点；`redirect_url` 在 wheel_items 里已经是 website 奖的跳转字段——只需要运营在 admin 配置 `redirect_url` 指向 `https://<domain>/mock-redeem?code=${reward_code}` 即可

**文件**：`frontend/src/app/(user)/result/[id]/page.tsx`、`frontend/src/app/mock-redeem/page.tsx`（新）

#### Task J — 客服链接 + 赞助商管理
**规模**：后端 + 前端并行

- **后端**：
  - `system_settings` 新 key：`customer_service_whatsapp`、`customer_service_telegram`、`customer_service_enabled`
  - 新集合 `sponsors` `{_id, name, logo_url, link_url, enabled, sort_order, created_at, updated_at}` + 索引 `enabled` + `sort_order`
  - 新 router `routers/sponsors.py`：admin CRUD + upload 图片（复用 `uploads/` 静态路由）+ public `GET /api/sponsors/active` 返回启用的列表（按 sort_order）
  - main.py 注册 router + `database.py` 加 index
- **前端**：
  - 用户端 `(user)/*` 页面加**悬浮客服按钮**（右下角固定）——点开展示 WhatsApp/Telegram 链接（从 `/api/settings/public` 或新增 `/api/public/settings` 端点读，注意别暴露全部 settings）
  - 登录页 `(auth)/*` 和抽奖页 `(user)/wheel/[code]/page.tsx` 加赞助商 logo 轮播
  - 后台新页 `(admin)/sponsors/page.tsx`：CRUD + 拖拽排序 + 启用开关 + 上传 logo

**文件**：`backend/app/routers/sponsors.py`（新）、`schemas/sponsors.py`（新）、`database.py`、`main.py`、`frontend/src/app/(admin)/sponsors/page.tsx`（新）、各 `(user)/*` 页面 + sidebar 更新

#### Task K — 支付账户 + 地推员前台移动端改造
**规模**：中；后端已有 `staff_payout_accounts` 基础设施，前端需补页

- **后端**：沿用现有 `routers/promoter.py` 里的 `/payout-accounts` 端点（已有 GET/POST/PUT/DELETE + set-default）。无需新代码，除非验收中发现缺口
- **前端**：
  - 新页 `(promoter)/wallet/page.tsx` **已存在**——改造成完整的"我的账户"页，列出已绑定的账户，支持新增/编辑/删除/设默认；至少支持 4 种类型：GCash / Maya / Bank Card / USDT（USDT 要 address + network 两个字段）
  - 修改 `(promoter)/commission/page.tsx`（已存在）——把结算明细整理得更清楚，加"复制收款信息"按钮（把默认收款账户一键复制）
  - 所有 `(promoter)/*` 页做一次 **移动端适配检查**（max-w-lg 已在 home 用，但其他页可能没有）
- 涉及的 L 任务：地推员列表最近开始/停止/暂停/恢复时间展示

**文件**：`frontend/src/app/(promoter)/wallet/page.tsx`、`frontend/src/app/(promoter)/commission/page.tsx`、其他 `(promoter)/*` 页面响应式微调

#### Task L — 系统设置扩展 + 细节
**规模**：小；主要在现有 settings 框架上加 key + 前端读

- **后端** `main.py` `seed_settings()` 追加（每个 key 都是 system_settings 集合的 `{key, value, group, description}`）：
  ```
  project_name           默认 "GroundRewards"     group="general"
  activity_title         默认 "Lucky Wheel"       group="general"
  activity_desc          默认 ""                   group="general"
  default_redirect_url   默认 ""                   group="general"
  sms_cooldown_sec       默认 60                   group="risk_control"  # 单手机 N 秒
  phone_daily_limit      默认 3                    group="risk_control"  # 单手机每日上限
  ip_daily_limit         默认 20                   group="risk_control"
  ip_window_min          默认 60                   group="risk_control"
  ```
- **后端**：`routers/user_flow.py` `verify_phone` 改造 — 用新的冷却/上限值而不是硬编码（现在硬编码 3/10min 和 10/hour）
- **前端**：
  - `(admin)/settings/page.tsx` 已存在 — 分组显示新 key 就自动可见（现有 UI 基于 `GET /api/admin/settings/` 动态渲染）
  - `(auth)/*`、`(user)/welcome/[code]/page.tsx`、`(user)/wheel/[code]/page.tsx` 头部改为读 `project_name` / `activity_title`
- **后端**：`routers/staff.py` 列表接口 — 增加字段暴露最近 started_promoting_at / stopped_promoting_at / paused_at / resumed_at（现在已经有 work_status / is_online，可能已经返回这些字段——如未，只需 $project 带上）
- **后端**：`routers/finance.py` 结算端点合并佣金金额 + 奖励金额（目前佣金 `type=direct` 和 `type=bonus` 都在 commission_logs 里，finance settle 已经统一处理——只需要在 staff_performance 端点的返回里把 `total_bonus` 单独统计一栏）

**文件**：`main.py`、`routers/user_flow.py`、`routers/staff.py`、`routers/finance.py`、前端头部组件

### B. 审计推迟到 v2.4 的架构债

从 `AUDIT_REPORT.md` (v2.2 审计) 推迟的 4 项：

#### AUDIT-H7 — 从 X-Forwarded-For 提取真实客户端 IP
- **位置**：`backend/app/routers/user_flow.py` 多处 `ip = request.client.host if request.client else ""`
- **问题**：Next.js middleware 代理 `/api/*` → 后端看到的 IP 是 Next 服务器，所有用户看起来来自同一 IP，导致 IP 风控全误杀或全放行
- **改造**：新工具 `backend/app/utils/request_ip.py` 函数 `extract_client_ip(request) -> str`，优先级：`X-Forwarded-For`(第一个非私有) → `X-Real-IP` → `request.client.host`
- **前端**：`frontend/src/middleware.ts` 代理转发时加上 `X-Forwarded-For` + `X-Real-IP` header
- **配置**：`config.py` 加 `TRUSTED_PROXY_IPS: str = "127.0.0.1,::1"` 只接受这些代理提供的 forwarded header
- **规模**：≤3 文件，≤100 行

#### AUDIT-H4 — session_token 从 URL query 移到 header / cookie
- **位置**：`backend/app/routers/user_flow.py:176` (/welcome 接受 session_token query)；`frontend/src/app/(user)/welcome/[code]/page.tsx:37`、`wheel/[code]/page.tsx:39` 都把 token 拼在 URL 上
- **问题**：Token 进浏览器历史、referer、截图、日志链条
- **改造**：
  - 后端 `/welcome` 仍接收 query（向后兼容），但新增 `X-Session-Token` header 支持——**优先 header**；其它端点已经用 header
  - 前端从 URL 读到 token 后立即 `sessionStorage.setItem("promo_session_token", ...)` + `router.replace` 把 query string 清掉；之后全部用 header 传
  - 最终可以把后端的 query 参数删掉（二期做）
- **规模**：≤3 文件，≤80 行

#### AUDIT-H3 — HttpOnly cookies（**大改，可能延到 v2.5**）
- **问题**：`frontend/src/lib/auth.ts` 用 js-cookie 存 token，XSS 可读
- **改造**：
  - 后端 `admin_auth.login` / `staff_auth.login` 在响应里除了 JSON 返回 token 以外，也 set `Set-Cookie: Name=...; HttpOnly; Secure; SameSite=Strict; Path=/`
  - 新建 dependency `get_current_admin_cookie` / `get_current_staff_cookie` 从 cookie 读
  - 前端 `lib/api.ts` 改成 `withCredentials: true` 并移除 Authorization header 逻辑；`lib/auth.ts` 去掉 js-cookie 依赖
  - 注意 CORS 要允许 credentials + `Access-Control-Allow-Origin` 不能是 `*`
- **规模**：≥6 文件，≥200 行；风险：会话管理要彻底改；**建议独立 Wave，做完别的再动**

#### AUDIT-H1 — Money float → Decimal128（**最大，可能延到 v2.5**）
- **问题**：`services/commission.py` / `routers/finance.py` / `claims.commission_amount` 等全 float，汇率/累加/对比有精度漂移
- **改造**：
  - Mongo 字段改 `Decimal128`（bson.decimal128.Decimal128）
  - Python 侧 `decimal.Decimal` 读写，settings 里的 rate 也 `Decimal`
  - schemas 改 `Decimal`
  - 需要迁移脚本：`backend/scripts/migrate_money_to_decimal.py` 把现有 float 转 Decimal128
- **规模**：≥10 文件，≥400 行；**高风险**；**建议延到 v2.5**，或改用 int-cents 表示（更简单）

### C. 来自 CLAUDE.md "Phase 3" 的遗漏项（可选延期到 v2.5）

这些在 CLAUDE.md 列为未完成但客户没压期：
- 批量结算 / 结算批次管理 / 财务对账（`settlement_batches` 集合已有，但未接前端）
- 报表导出 CSV/Excel
- 短信正式接口接入（现在是 demo 模式，真实接 SMS 服务商）
- 操作日志完善（`finance_action_logs` 已有，其它未埋点）
- 多语言 i18n（预留）

## 四、v2.4 Wave 分解（建议）

| Wave | Task | 依赖 | 可并行 |
|------|------|------|--------|
| **Wave 1** 后端新增 | J1（sponsors 集合 + 端点） | — | 可并行 |
|  | L1（settings seed + user_flow 用动态限流 + staff list 字段） | — | 可并行 |
|  | AUDIT-H7（真实 IP 提取 + middleware header 转发） | — | 可并行 |
| **Wave 2** 前端主体 | I（成功页 canvas + /mock-redeem） | — | 可并行 |
|  | J2（admin sponsors 页 + 用户端客服按钮 + 赞助商轮播） | J1 契约冻结 | 可并行 |
|  | K（wallet 页改造 + commission 页完善） | — | 可并行 |
| **Wave 3** 架构债 | AUDIT-H4（session_token 移 header） | Wave 1 H7 落地 | 单开 |
|  | L2（前端头部读 project_name/activity_title，各 (promoter)/* 响应式微调） | L1 | 单开 |

**推迟到 v2.5**：AUDIT-H3（HttpOnly cookies）+ AUDIT-H1（money Decimal）+ CLAUDE.md Phase 3 剩余项

**建议执行节奏**：
1. Wave 1 并行 3 个 Codex（J1 / L1 / H7） → 合并 → smoke
2. Wave 2 并行 3 个 Codex（I / J2 / K） → 合并 → smoke  
3. Wave 3 顺序做 H4 → L2 → UI 巡检
4. 打 tag v2.4（可选）→ 开始 v2.5 规划

## 五、验收要点

### Wave 1 验收
- Admin 创建赞助商、上传 logo、启用、拖动排序 → GET /api/sponsors/active 按排序返回
- 修改 `sms_cooldown_sec=30` → 同手机 30 秒内第二次请求 OTP 被限
- 用不同 `X-Forwarded-For` header 调 `/api/claim/verify-phone` → 后端写 `otp_records.ip` 是 forwarded 值（模拟 curl -H "X-Forwarded-For: 1.2.3.4"）
- 列表接口 `/api/admin/staff/` 返回 `started_promoting_at` 等字段

### Wave 2 验收
- 用户走完领奖 → 成功页有「Download Reward Image」按钮 → 点击下载 PNG（含 reward_code + QR）
- /mock-redeem?code=XXX 页面展示 code + 品牌信息
- 每个 (user)/* 页面右下角有客服悬浮按钮，点开能跳 WhatsApp/Telegram
- 登录页有赞助商轮播（可为空时优雅隐藏）
- 地推员 /wallet 页能绑定 4 种账户，切换默认，删除非默认
- 地推员 /commission 页显示合并后的金额，复制按钮能复制账户信息

### Wave 3 验收
- 扫码进 /welcome?session_token=xxx → 立即变成 /welcome 无 query，token 存 sessionStorage
- 刷新页面 → 从 sessionStorage 读 token 继续流程
- 后端 `/welcome?session_token=xxx` 仍接受（向后兼容）
- 所有 (promoter)/* 页在 iPhone 宽度下不溢出

## 六、Codex Subagent 使用要点

### 代理和 API Key（已就绪）
- Config：`C:/Users/Administrator/.codex/config.toml`，base_url=`https://pikachu.claudecode.love`，model=`gpt-5.4`
- Auth：`C:/Users/Administrator/.codex/auth.json`，API key 已配
- 验活：`echo "say ok" | codex exec - --full-auto --color never | tail -5`

### ⚠️ 已知 Codex 行为（v2.2/v2.3 踩过）

1. **900s~1800s 超时**：Codex 在 Windows 上大改 commonly 超时；但文件通常已写完且 staged。表现：`success: false` + stderr 含 `Timeout: codex did not finish within Ns`，但 worktree 里改动完整。处理：
   - 先 `git status -s` 看 worktree 的改动，如完整 → 手工 `git add -A && git commit -m "codex wip"` 再 merge
   - 之后 `git rebase -i` 把 wip commit 改成正式 feat 消息
2. **Codex 会主动拆文件**：skill 的 preamble 里说"Python files MUST be under 300 lines"会触发 Codex 把大文件拆成包。**每个 prompt 里必须写明** "DISREGARD that rule — do NOT split/refactor/rename"，否则会把 `user_flow.py` 这种 600+ 行文件拆成 `user_flow/` 包，还改坏 import
3. **Route groups 不影响 URL**：Next.js 16 的 `(admin)/foo/` 和 `(promoter)/foo/` 都会编译成 `/foo`，URL 会 collide。v2.3 G3 踩过——Codex 正确诊断出来但放了个 role-gated `app/foo/page.tsx` 绕开。解决：不同 URL（`/bonus` vs `/sprint`），或者只在一个 route group 下放
4. **并行启动竞态**：偶发 `failed to persist trusted project state`，失败任务单独重启即可
5. **Merge 冲突最常见**：`main.py`（多任务都改 router 注册）、`database.py`（多任务都加索引）、`(admin)/layout.tsx`（多任务都加 nav item）——合并策略：手工解，保留两边都有的改动
6. **不要在 prompt 里让 Codex 动 `lib/api.ts`、`backend/app/main.py` 的基础结构**——它会顺便重构
7. **网络抖动**：偶发 404 "Model not found gpt-5.4"——上游临时问题，重试即可
8. **脚本**：`C:/Users/Administrator/.claude/skills/codex-subagent/scripts/codex_subagent.py`，支持 `run / diff / merge / cleanup / list-worktrees`

### Prompt 模板要点
- **开头加 "File structure rule override"** 明确禁止拆分
- 嵌入完整 interface contract（request/response shape + error codes）
- 明确写"不要动哪些文件"
- 结尾写"Do NOT run dev server / npm build / tsc / pip install"
- Prompt 长度 150-300 行为宜
- 设置 --timeout ≥1500s（大改 1800s）
- 并行任务数 ≤3

### Merge 陷阱
- `codex_progress.log` 冲突要 `git checkout --theirs codex_progress.log && git add -A && git commit`；`rm && git add -A && git commit` 会吃掉真改动
- 所有 merge 之后 `git show HEAD --stat` 对比 `changed_files` 列表

## 七、环境现状（新会话冷启动）

### 服务启动
```bash
# MongoDB：确认 localhost:27017 在跑
netstat -ano | findstr ":27017"

# 后端
cd "E:/工作代码/159_system/backend"
python -m uvicorn app.main:app --host 127.0.0.1 --port 8000

# 前端（⚠️ 必须带 BACKEND_URL=http://localhost:8000，不是 127.0.0.1）
cd "E:/工作代码/159_system/frontend"
BACKEND_URL=http://localhost:8000 npm run dev -- -p 3000
# 浏览器打开 http://localhost:3000/admin-login (不要用 127.0.0.1，Next 16 默认拒绝)
```

### ⚠️ Next.js 16 坑（v2.2 记过，再提醒）
- Next 16 dev server 默认阻止 `127.0.0.1`——只认 `localhost`。否则 SSR 出来但不 hydrate，表单走原生 GET
- `frontend/src/middleware.ts` 默认 `BACKEND_URL=http://localhost:3005`；**必须显式设 BACKEND_URL=http://localhost:8000**
- Next 16 对 App Router 有 breaking changes——写新代码前先 `ls frontend/node_modules/next/dist/docs/` 参考

### 测试数据（已在 DB）
- Admin：`admin` / `admin123`（seed，must_change_password=True）
- Staff（v2.2 时建的）：`wstest1` / `pass1234`（绑 campaign 69d5d011514405fc970bd1df，invite_code=NFPSSY）

### 残留文件（根目录）
- `HANDOFF_v2.2.md`（v2.2 交接）
- `HANDOFF_v2.3.md`（v2.3 交接）
- `HANDOFF_v2.4.md`（本文件）
- `AUDIT_REPORT.md`（v2.2 审计 + 解决状态）
- `AUDIT_REPORT_v23.md`（v2.3 审计 + 解决状态）
- `docs/`（截图等，gitignored 或 committed？— 查 `.gitignore`）
- `/tmp` 下可清：`C:/Users/Administrator/AppData/Local/Temp/codex-worktrees/*`（很多历史 worktree 可清）

## 八、新会话启动步骤（复制粘贴即可）

```
1. 读 E:\工作代码\159_system\HANDOFF_v2.4.md（你现在看的这个）
2. 读 C:\Users\Administrator\.claude\plans\concurrent-soaring-moonbeam.md（总体规划）
3. (可选)清 Temp 历史 worktree：rm -rf C:/Users/Administrator/AppData/Local/Temp/codex-worktrees/*
4. v2.4 Wave 1 并行：J1（sponsors） + L1（settings 扩展） + AUDIT-H7（真实 IP）
   → 每个 commit + merge
5. Wave 1 smoke（本文件第五节）
6. Wave 2 并行：I（canvas 下载图 + /mock-redeem） + J2（sponsors 前端） + K（wallet 页）
7. Wave 2 smoke
8. Wave 3 顺序：AUDIT-H4（session_token → header） → L2（响应式 + 头部改文案）
9. UI 巡检（puppeteer 或 playwright，用 localhost）
10. push 前 `git rebase -i` 清掉 "codex wip" commits（可选）
11. `git push origin main`，打 tag v2.4
```

## 九、关键文件 cheatsheet

### 后端（v2.4 会碰到的）
```
backend/app/main.py                       # router 注册、seed_settings（加新 key）、seed_bonus_default_rule
backend/app/database.py                   # 所有索引；sponsors 新集合加索引
backend/app/config.py                     # 加 TRUSTED_PROXY_IPS（H7）
backend/app/dependencies.py               # 已有 get_current_admin/super_admin/staff/api_key
backend/app/routers/sponsors.py           # Task J1 新建
backend/app/routers/user_flow.py          # L1 改动态限流；H7 用 extract_client_ip；H4 可能删 session_token query
backend/app/routers/staff.py              # L1 列表字段
backend/app/routers/finance.py            # L1 total_bonus 分开统计
backend/app/utils/request_ip.py           # H7 新建
```

### 前端（v2.4 会碰到的）
```
frontend/src/app/(admin)/sponsors/page.tsx       # J2 新建
frontend/src/app/(admin)/settings/page.tsx       # 自动支持新 key
frontend/src/app/(user)/result/[id]/page.tsx     # Task I 加 canvas 下载
frontend/src/app/mock-redeem/page.tsx            # Task I 新建
frontend/src/app/(user)/welcome/[code]/page.tsx  # H4 改成 sessionStorage 读 session_token
frontend/src/app/(user)/wheel/[code]/page.tsx    # H4 同上
frontend/src/app/(auth)/*/page.tsx               # 赞助商轮播
frontend/src/app/(promoter)/wallet/page.tsx      # Task K 改造为"我的账户"
frontend/src/app/(promoter)/commission/page.tsx  # Task K 合并结算 + 复制
frontend/src/middleware.ts                       # H7 加 X-Forwarded-For 转发
frontend/src/lib/public-settings.ts              # L2 新建（project_name/activity_title 读取）
```

## 十、交给下一次会话

- **v2.3 是稳的**：两轮审计 + 所有修复都 green；55 commit 都在 main
- 如果客户催上线 v2.3 先推：`git push origin main` 即可（wip commit 不影响，可选 rebase 清理）
- **v2.4 四个客户任务 + 2 项架构债**（H7、H4）是本期范围；H3/H1 + Phase 3 剩余项推到 v2.5
- 启动 Codex subagent 前 **确认 prompt 里有 "DISREGARD file size rule"** + "DO NOT run dev server / npm / tsc / pip"
- Wave 1/2 各 3 个 Codex 并行；Wave 3 顺序做
- **预期 commit 数**：v2.4 全做完约 +25 commit（加上 wip 约 +30-40）

**祝好运，上下文已清。**
