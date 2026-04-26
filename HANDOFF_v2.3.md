# v2.3 实施交接文档（v2.2 完成，v2.3 + E4 小缺口待做）

**新会话打开后先读这个文件，再读 `C:\Users\Administrator\.claude\plans\concurrent-soaring-moonbeam.md` 查总体规划。**

## 一、整体背景（新会话必读）

客户 2026-04-17 下发 `4.17补充(1).docx`（gitignored），共 A-H 八章节。已规划分 3 期：
- **v2.2** ✅：安全链路（PIN+Session）+ 多管理员 + 推广状态机
- **v2.3** ⬜：奖励体系 + 外部兑奖接口鉴权（本期）
- **v2.4** ⬜：运营细节（客服、赞助商、奖励图片、mock-redeem）

## 二、当前进度（2026-04-20）

### ✅ v2.2 全部三波已合并到 main（本地领先 origin/main 12 个 commit，未推送）

```
af68137 Merge branch 'codex-subagent/w3-b-liveqr-...'
7de75a9 feat(secure): live QR promoter workstation + user PIN page + session-aware welcome/wheel (v2.2 Wave 3)
91a47fa Merge branch 'codex-subagent/w3-d-admins-...'
07415c9 feat(admin): multi-admin CRUD page + forced password change on first login (v2.2 Wave 3)
57fbbfd feat(admin): staff list online filter + indicator dot + last login column (v2.2 Wave 3)
804a366 codex wip    ← 3 个 Codex 超时后手工 commit 产生的「wip」，push 前可 rebase
ff04014 codex wip
0faa16a codex wip
9d40db4 Merge branch 'codex-subagent/w2-e2-online-...'
629249d feat(work): staff login persists last_login_at + admin list exposes is_online with online_filter (v2.2 Wave 2)
eb29002 feat(secure): bind /welcome /spin /complete to promo_session when live_qr_enabled (v2.2 Wave 2)
5a19743 fix(secure): add missing /api/claim/pin/verify endpoint (v2.2 Wave 1)
1040722 feat(work): promotion work_status state machine + online tracking (v2.2 Wave 1)
bb55ad2 Merge branch 'codex-subagent/w1-secure-a1-...'
6e79bf2 feat(secure): live QR token + PIN verify + promo session infra (v2.2 Wave 1)
ea6f0cd feat(admin): multi-admin CRUD with super_admin role (v2.2 Wave 1)
```

验收结果：10/10 W1 smoke + 15/15 W2 smoke + UI 7/7 tour + `tsc --noEmit` 0 errors。

### 🟡 v2.2 小缺口 — Task E4（最小一件，建议先做）

规划文件第 358 行列出 `frontend/src/app/(promoter)/home/page.tsx` 要加 Start/Stop 按钮，Wave 3 未覆盖。

后端全就绪：
```
POST /api/promoter/work/start   (无 body)
POST /api/promoter/work/stop    (无 body)
POST /api/promoter/work/pause   (body: {reason: str})
POST /api/promoter/work/resume  (无 body)
POST /api/promoter/heartbeat    (无 body, 20s 内幂等)
GET  /api/promoter/home         (返回 staff + today + settlement，staff 含 work_status/promotion_paused/pause_reason)
```

**需要做的事**：
- `frontend/src/app/(promoter)/home/page.tsx` 加一个「工作状态卡片」
  - 根据 `staff.work_status` 展示 3 种样态（stopped / promoting / paused）
  - stopped → 显示大按钮「Start Promoting」→ POST /work/start
  - promoting → 显示开始时间 + 两个按钮「Pause」（弹 reason 输入 modal → /work/pause）+「Stop」→ /work/stop
  - paused → 显示暂停原因 + 两个按钮「Resume」→ /work/resume + 「Stop」→ /work/stop
  - 每 60s 触发一次 `/api/promoter/heartbeat`（staff 首页期间保持 online）
  - 每次状态变化后 refetch `/api/promoter/home` 刷新卡片
- 全局（可放 `(promoter)/layout.tsx`）心跳 interval，只在有 staff token 时运行

**小规模 task**：1-2 个文件，≤200 行改动。可手工做，不需要 Codex。

### ⬜ v2.3 — 三个 Task 未开始

## 三、v2.3 任务详细规格

### Task F — X-API-Key 鉴权 + 结算状态机 5 态

**外部兑奖接口鉴权**：
- `backend/app/routers/external.py` 现有端点（`/check-reward-code/{code}`、`/redeem/{code}` 等）目前无鉴权，**生产环境所有人都能调用核销**
- 新 dependency `get_api_key` 从 header `X-API-Key` 读取，对比 `system_settings.external_api_key`
- `main.py` `seed_settings` 加：`{"key":"external_api_key","value":"<random-32-hex>","group":"integration","description":"X-API-Key for /api/external/*"}`（首次启动随机生成；已存在则保留）
- `external.py` 在每个端点上加 `Depends(get_api_key)`

**结算状态机改造**（claims 表加 3 个字段，commission 流程改）：
```
claims 新字段：
  settlement_status: str   # pending_redeem / unpaid / paid / cancelled / frozen
  commission_amount: float # 该 claim 产生的佣金总额（一二三级汇总）
  settled_at: datetime|None

状态流转：
  website 奖品 claim 生成 → settlement_status=pending_redeem（待核销）
  /api/external/redeem 核销成功 → pending_redeem → unpaid（未结算）
  onsite 奖品 claim 生成 → settlement_status=unpaid（现场奖不需要核销）
  finance 结算该 claim → unpaid → paid
  admin 手动取消 → any → cancelled
  admin 手动冻结 → unpaid → frozen（不计入待结算）
```

- `routers/user_flow.py` `complete` 插入 claim 时初始化 settlement_status
- `services/commission.py` `calculate_commissions` 计算后把总额写回 claims.commission_amount
- `routers/external.py` redeem 端点推进状态
- `routers/finance.py` 结算端点按 settlement_status 过滤 unpaid；settle 成功后推进为 paid
- admin claims 列表端点允许 `settlement_status` query 过滤

**文件改动**：`external.py` / `user_flow.py` / `services/commission.py` / `finance.py` / `claims.py` / `main.py` / `database.py`（新索引）

### Task G — 日冲单奖励（冲单奖励 / 层次奖励）

**业务**：地推员按每日有效领取数冲阶梯，达到里程碑领奖金。例如默认规则：
- 第 5 个有效 → +50 PHP
- 第 10 个 → +100 PHP
- 第 20 个 → +300 PHP
- 单日上不封顶

每个地推员还可设「专属规则」覆盖默认。领奖是地推员**自己在前台点领**（不自动发），领完写 `bonus_claim_records`；当日结束后生成 `daily_bonus_settlements`（对账用）。

**新集合**：
```
staff_bonus_rules
  _id, staff_id (None 表示全局默认), tiers [{threshold:int, amount:float}],
  enabled:bool, created_at, updated_at

bonus_claim_records
  _id, staff_id, date:YYYY-MM-DD, tier_threshold:int, amount:float,
  valid_count_at_claim:int, status: "claimed"|"settled", created_at

daily_bonus_settlements
  _id, staff_id, date:YYYY-MM-DD, total_valid:int, total_bonus:float,
  rule_snapshot:dict, created_at

索引:
  staff_bonus_rules: staff_id unique (允许 null 为全局默认)
  bonus_claim_records: (staff_id, date, tier_threshold) unique
  daily_bonus_settlements: (staff_id, date) unique
```

**后端端点**：
```
GET  /api/promoter/bonus/today          # 返回今日进度 + 已领/可领里程碑
POST /api/promoter/bonus/claim          # body {tier_threshold:int}
GET  /api/promoter/bonus/history        # 历史领取记录

GET  /api/admin/bonus/rules             # 规则列表
POST /api/admin/bonus/rules             # 创建/更新规则
DELETE /api/admin/bonus/rules/{id}
GET  /api/admin/bonus/settlements       # 每日汇总（支持日期范围 + staff_id 过滤）
```

**前端**：
- 新页 `frontend/src/app/(promoter)/bonus/page.tsx`（或复用 home）：「Today's Mission Sprint」模块，进度条 + 里程碑卡片 + Claim 按钮
- 后台 `frontend/src/app/(admin)/bonus/page.tsx`（新）：规则配置 + 每日统计

**文件改动**：`routers/bonus.py`（新）/ `services/bonus.py`（新）/ `schemas/bonus.py`（新）/ `main.py`（seed 默认规则、注册 router）/ `database.py` / 前端两个新页

### Task H — 地推注册审核独立流程

**现状**：`staff_auth.register` 直接把申请者写入 `staff_users`（status=pending_review），和正式员工同表。管理员审核就是改 status 为 active。

**改造成独立申请表**：
```
新集合 staff_registration_applications
  _id, name, phone, username, password_hash, invite_code (推荐人),
  status: "pending"|"approved"|"rejected",
  rejection_reason: str,
  applied_at, reviewed_at, reviewed_by_admin_id,
  approved_staff_id: ObjectId|None  # 通过后自动创建的 staff 的 id
```

- `staff_auth.register` 改为写入 applications 而不是 staff_users
- 新端点 `/api/admin/registrations/` 列表 + approve + reject
- approve 时自动：生成 invite_code → 创建 staff_users → 建立 staff_relations → 写 approved_staff_id
- reject 时记录原因；允许用户重新提交

**前端**：
- 新页 `frontend/src/app/(admin)/registrations/page.tsx`（列表 + 审核 modal）
- `(admin)/layout.tsx` sidebar 加「注册审核」入口，带 pending count 角标
- `staff-login/page.tsx` 注册成功后提示改为「已提交申请，请等待审核」（当前已经大致是这样）

**文件改动**：`routers/staff_auth.py` / `routers/registrations.py`（新）/ `schemas/staff.py`（新类 RegistrationApplication）/ `main.py` / `database.py` / 前端新页 + layout

## 四、v2.3 Wave 分解（建议）

| Wave | Task | 依赖 | 可并行 |
|------|------|------|--------|
| **Wave 1** 后端新增 | F1（external.py X-API-Key + settings） | — | 可并行 |
|  | G1（bonus 集合 + 管理员端点 + 默认规则 seed） | — | 可并行 |
|  | H1（registrations 集合 + 新注册端点 + 审核端点） | — | 可并行 |
|  | E4（地推员首页 Start/Stop UI） | — | 可手工做或并行 |
| **Wave 2** 后端改造 | F2（claims 加 settlement_status + user_flow/finance/commission 流程串联） | F1 | 单开 |
|  | G2（地推员领取端点 + commission 集成） | G1 | 单开 |
| **Wave 3** 前端 | F3（admin claims/finance 页加 settlement_status 过滤 + 状态标签） | F2 契约冻结 | 可并行 |
|  | G3（地推员 Mission Sprint 页 + 后台统计页） | G2 契约冻结 | 可并行 |
|  | H2（后台审核页 + sidebar 入口） | H1 契约冻结 | 可并行 |

**建议的开场节奏**：
1. 先手工做 E4（小缺口，30 分钟内搞定），确认 home 页 heartbeat 循环能跑
2. 启动 Wave 1 并行 3 个 Codex task（F1/G1/H1）
3. Wave 1 后做 smoke test（参考本文件 "验收要点" 一节）
4. Wave 2 并行 F2+G2
5. Wave 2 smoke
6. Wave 3 并行 F3+G3+H2
7. Wave 3 + UI 巡检
8. 打 tag v2.3（可选）→ push

## 五、验收要点（Wave 完成后跑）

### Wave 1 验收
- 不带 X-API-Key 请求 `/api/external/redeem/...` → 401
- 带错 key → 403
- 带对 key → 原有行为
- 管理员创建 bonus 规则 → GET 返回
- 地推员注册（新流程）→ 写到 applications 而不是 staff_users
- admin approve 申请 → staff_users 自动生成 + invite_code 下发

### Wave 2 验收
- 领 website 奖品 → claim.settlement_status=pending_redeem
- 核销 → pending_redeem → unpaid
- 领 onsite 奖品 → 直接 unpaid
- 结算 → unpaid → paid
- commission_amount 正确写入
- 地推员冲 5 个有效 → bonus/today 显示可领第 1 档 → claim → bonus_claim_records 写入
- 同档重复 claim → 409
- 次日重置进度

### Wave 3 验收
- admin 财务页按 settlement_status 过滤
- 地推员前台 Mission Sprint 卡片进度条、里程碑 Claim 按钮、历史记录
- 后台注册审核页，approve/reject 流程

## 六、Codex Subagent 使用要点（v2.2 踩的坑都在这）

### 代理和 API Key（已就绪）
- Config：`C:/Users/Administrator/.codex/config.toml`，base_url=`https://pikachu.claudecode.love`
- Auth：`C:/Users/Administrator/.codex/auth.json`，API key 已配
- 验活：`curl -sS -X POST https://pikachu.claudecode.love/responses -H "Authorization: Bearer <key>" -H "Content-Type: application/json" -d '{"model":"gpt-5.4","input":"ok"}' -w "\nHTTP %{http_code}\n"`

### 脚本 + worktree
- 脚本：`C:/Users/Administrator/.claude/skills/codex-subagent/scripts/codex_subagent.py`
- 时间戳毫秒+随机，并行任务不撞
- Windows 账号锁定策略已永久关闭

### ⚠️ 900s 超时行为
Codex 在 Windows 上常超 900s（我们遇到的 Wave 3 D 跑了 28 分钟，B 跑了 34 分钟）。
表现：
- 返回 `success: false`，stderr 写 "Timeout: codex did not finish within 900s"
- **但文件通常已写完且 staged** — 只是 Codex 在「收尾对话」阶段被 kill
- worktree `git status -s` 看到所有预期的 M/A 条目 = 可用

**正确处理流程**：
1. 看 worktree 的 `git diff --stat` 或 `git status -s` 判断改动完整度
2. 手工在 worktree 里 `git commit -m "codex wip"`（subagent 不会自动 commit staged 文件）
3. 用 subagent 的 `merge` 命令合并
4. push 前 `git rebase -i` 把 "codex wip" 改成正式 feat 消息

### 并行启动竞态
3 个 Codex 并行时**有概率**一个在 config.toml persist trusted_project 时失败（`failed to persist trusted project state`）。解决：失败的那个**单独**重启一次，不要并行。

### Merge 陷阱（v2.2 踩过）
- `codex_progress.log` 冲突要「保留 theirs」或直接 rm + git add -A 但要先 `git status` 确认其他文件都在
- 上次踩过坑：merge pending 的时候 `rm codex_progress.log && git add -A && git commit` 把实际 Codex 改动给吃了，最后要 `git checkout <branch> -- <file>` 捞回来

### Prompt 模板要点
- ≤4 文件、≤500 行改动
- 嵌入完整接口契约
- 明确写「不要动哪些文件」
- 结尾要求「不要启动 dev server 或 build」（避免 Codex 花时间跑 npm 命令）
- Prompt 长度 100-150 行为宜

## 七、环境现状（新会话冷启动）

### 服务启动
```bash
# MongoDB：确认 localhost:27017 在跑
netstat -ano | findstr ":27017"

# 后端（ASCII 路径 OK，含中文 OK）
cd "E:/工作代码/159_system/backend"
python -m uvicorn app.main:app --host 127.0.0.1 --port 8000

# 前端（⚠️ 必须带 BACKEND_URL；启动后用 localhost，不要用 127.0.0.1）
cd "E:/工作代码/159_system/frontend"
BACKEND_URL=http://localhost:8000 npm run dev -- -p 3000
# 然后浏览器打开 http://localhost:3000/admin-login
```

### ⚠️ Next.js 16 跨域坑（本次踩过，记清楚）
Next.js 16 dev server **默认阻止 `127.0.0.1` 访问**（只认 localhost），结果页面 SSR 出来但 **不会 hydrate**，表现为 form 提交走原生 GET 不走 React handler。

- 症状：URL 变成 `/admin-login?`；React fiber 在 body 元素上不存在；按钮点击无 API 调用
- 解决方案一：浏览器和 puppeteer 访问都用 `http://localhost:3000`
- 解决方案二：`frontend/next.config.js` 加 `allowedDevOrigins: ['127.0.0.1']`

### ⚠️ 前端代理默认后端在 3005，与我们实际 8000 不符
`frontend/src/middleware.ts` 默认 `BACKEND_URL=http://localhost:3005`。启动前端时**必须**设 `BACKEND_URL=http://localhost:8000`。否则 `/api/*` 代理到 3005 返回 500。

### 残留物
- `E:/工作代码/159_system/HANDOFF_v2.2.md`（v2.2 的交接，未 gitignored 但未跟踪）
- `E:/工作代码/159_system/HANDOFF_v2.3.md`（本文件）
- `E:/工作代码/159_system/docs/screenshots/*.png`（v2.2 UI tour 截图，可留可删）
- `C:/Users/Administrator/AppData/Local/Temp/codex-worktrees/w3-*`（3 个 w3 worktree，~300MB，可清）
- `C:/Users/Administrator/AppData/Local/Temp/prompt_w*.txt`（v2.2 prompt 副本）

### 测试用户（v2.2 烟测时建的）
- admin（super_admin）
- testadmin（admin，已禁用）
- wstest1 / pass1234（staff，绑到 campaign 69d5d011514405fc970bd1df，invite_code=NFPSSY）

## 八、新会话启动步骤（复制粘贴即可）

```
1. 读 E:\工作代码\159_system\HANDOFF_v2.3.md（你现在看的这个）
2. 读 C:\Users\Administrator\.claude\plans\concurrent-soaring-moonbeam.md（总体规划，v2.3 部分）
3. 清理 Temp 里的 v2.2 残留（可选）：
   rm -rf C:/Users/Administrator/AppData/Local/Temp/codex-worktrees/w1-* w2-* w3-*
4. 先做 E4 小缺口（手工）：改 (promoter)/home/page.tsx 加 Start/Stop 卡片 + 60s heartbeat
   → 启前端本地验一下 → commit
5. v2.3 Wave 1 并行：F1 + G1 + H1（Codex subagent，各自独立 worktree）
   → 单独 commit + merge
6. Wave 1 smoke test（本文件第五节）
7. Wave 2 并行：F2 + G2
8. Wave 2 smoke
9. Wave 3 并行：F3 + G3 + H2
10. UI 巡检（puppeteer 脚本参考 v2.2 的 ui_tour2.mjs，用 localhost 访问）
11. push 前 `git rebase -i` 清掉 3 个 "codex wip" commit（可选）
12. `git push origin main`，打 tag v2.3
```

## 九、关键文件 cheatsheet

### 后端（v2.3 会碰到的）
```
backend/app/main.py                     # router 注册、seed_settings、seed_admin
backend/app/database.py                 # 所有索引（新集合要在这加）
backend/app/dependencies.py             # get_current_admin/get_super_admin/get_current_staff
backend/app/routers/external.py         # Task F 的主战场（X-API-Key）
backend/app/routers/user_flow.py        # Task F 要在 complete 里写 settlement_status
backend/app/routers/finance.py          # Task F 结算流程要接 settlement_status
backend/app/routers/claims.py           # Task F 列表加 settlement_status 过滤
backend/app/routers/bonus.py            # Task G 新建
backend/app/routers/registrations.py    # Task H 新建
backend/app/routers/staff_auth.py       # Task H register 端点改造
backend/app/services/commission.py      # Task F commission_amount 回写
backend/app/services/bonus.py           # Task G 新建
backend/app/schemas/bonus.py            # Task G 新建
backend/app/schemas/registration.py     # Task H 新建
```

### 前端（v2.3 Wave 3）
```
frontend/src/app/(promoter)/home/page.tsx        # E4 + Task G 进度卡
frontend/src/app/(promoter)/bonus/page.tsx       # Task G 新建
frontend/src/app/(admin)/bonus/page.tsx          # Task G 新建
frontend/src/app/(admin)/registrations/page.tsx  # Task H 新建
frontend/src/app/(admin)/layout.tsx              # Task H 加 sidebar 入口
frontend/src/app/(admin)/claims/page.tsx         # Task F 加 settlement_status 过滤
frontend/src/app/(admin)/finance/*.tsx           # Task F 财务页 settlement 视图
frontend/src/types/index.ts                      # 加新类型（BonusRule, RegistrationApplication 等）
```

## 十、交给下一次会话

- v2.2 没有遗留 bug，12 个 commit 都在 main，稳的
- 如果客户催 v2.2 先上线，可以直接 push 现有 12 commit（rebase 清 wip 可选不做）
- v2.3 三个 Task 相互独立，F 最小、H 中、G 最大
- E4 是 v2.2 的补漏，建议先做再开 v2.3
