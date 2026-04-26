# v2.6 规划：docx 合规补齐 + 延后 findings + 老 Phase 3 运营（新会话冷启动）

**新会话打开后先读这个文件，再选择性读 `AUDIT_REPORT_v25.md` §4 / `HANDOFF_v2.5_FIXES.md` / `HANDOFF_v2.5.md`。**

---

## 一、当前状态（2026-04-22，v2.5-F3 已就位）

### Git
```
branch: main  (89 commits ahead of origin/main — 未推送)
HEAD: 38c56f3 Merge Wave F3 Codex B
最近 6 commits：
  38c56f3 Merge Wave F3 Codex B — M7 register toggle + A10 admin pause/resume + A13 staff control fields
  a9f2dee Merge Wave F3 Codex A — M2 session fingerprint + M3 CSRF + M5 login throttle
  65cb3af Merge Wave F3 Codex C — D1/D2 alias routes
  a5ab243 Merge Wave F2 — Post-redeem commission + atomic withdrawal
  dec296f Merge Wave F1 — Audit v2.5 must-fix bundle
  408e755 feat(audit-v25): A3 money float->int cents
```

### 已过 smoke 的
| Wave | Findings | docx 覆盖 |
|---|---|---|
| F1 | H1 H2 M1 H5 H6 H7 + /_version | §H2 §H5 |
| F2 | H3 H4 | §G commission_after_redeem、§E4、§H3 部分 |
| F3 Codex A | M2 M3*（助手+cookie+前端 header）M5 | §H3 设备绑定 |
| F3 Codex B | M7（开关，captcha 后端延后）A10 A13（7/11 字段）| §A10 §A13 部分、§G 2 settings |
| F3 Codex C | D1 D2 | §D 兑奖接口 |

\* M3 未接 router 级 `Depends(require_csrf)` 强制；M7 captcha 后端未校验。

### 关键红线
**未 `git push origin main`。** docx 补齐项太多直接推有风险。建议：每个 v2.6 wave 合并 + smoke 后再决定是否 push / tag v2.5 或 tag v2.6-partial。

---

## 二、剩余工作清单（按 docx A-H 章节对照）

来源：`AUDIT_REPORT_v25.md` §4（写于 F3 之前，需减去 F1-F3 已吃掉的条目；本表已减）。

### §A 管理后台（剩 5 项）
- **A1**（Partial）：admin 创建表单没带 `role`
- **A3**（Partial）：缺「每有效领取结算单价」设置
- **A7**（Missing）：「奖励管理视角」dashboard
- **A11**（Missing）：「员工推广记录」admin view（后端已写 `promotion_activity_logs`）
- **A13 子项**（Partial）：QR 开关 `can_generate_qr` / 签名链接开关 `can_use_signed_link` / 静态链接开关 `allow_static_link` / `must_start_work` 4 个布尔字段未接
- **A14**（Partial）：「业绩+奖励」合并结算 UI

### §B 地推员前台（6 项，基本全前端）
- **B1**（Partial）：注册页 confirm-password + captcha 字段
- **B2**（Missing）：注册页 WhatsApp 联系链接
- **B6**（Partial）：QR PIN 消费后自动轮换（现只手动）
- **B7**（Partial）：bonus 计数应只过滤已核销 website 码
- **B8**（Missing）：首页 Recent Claim Records
- **B10**（Missing）：暂停/风控冻结 banner + 屏蔽 Start Promotion 按钮

### §C 用户领奖端（3 项）
- **C2**（Partial）：服务端未校验 QR `v` 版本参数
- **C5**（Missing）：固定 `+63` 前缀 + 只输本地号码 + 换号重发 OTP 流
- **C6**（Partial）：`phone_daily_limit` 是 10min 滚动而非按日；缺 per-flow 最大发送上限

### §D 兑奖接口（1 项）
- **D5**（Partial）：per-staff 日核销上限 + 自动冻结（手工冻结已有）

### §E 奖励码/结算（3 项）
- **E1**（Partial）：`.txt` 导入 + 粘贴文本 UI + 今日/历史分配核销统计
- **E2**（Partial）：`claims.promo_session_id` 字段未存
- **E5**（Missing）：bonus 记录的 admin 统一结算 action

### §F 数据表/字段（批量）
A13 已补 7 字段（risk_frozen / daily_* / payout_*）。仍缺：
- `staff_users`: `can_generate_qr`, `can_use_signed_link`, `allow_static_link`, `must_start_work`, `last_logout_at`, `is_online` 持久化
- `claims.promo_session_id`
- `otp_records`: `promo_code`, `flow_token`, `send_status`, `send_mode`, `send_error`, `last_attempt_at`（+ `ip` vs `ip_address` / `attempts` vs `verify_attempts` 命名统一）
- `staff_registration_applications.source_ip`
- `promo_sessions.is_used`（显式布尔）

### §G 系统配置（3 settings）
- `must_start_work_before_qr`
- `allow_static_link`
- `ip_rate_limit_enabled`（当前只有数值，没开关）

### §H 业务规则（1 项）
- **H4**（Partial）：领奖成功页上下文现是 sessionStorage + 签名 token，是前端依赖

---

## 三、已被延后到 v2.6 的 findings（来自 AUDIT_REPORT_v25.md §3）

| ID | 描述 | 估工 |
|---|---|---|
| **M3 强制** | 路由 `Depends(require_csrf)`；逐个 admin/finance 路由 opt-in | ~40 行 |
| **M4** | JWT 服务端失效：revoked_tokens 集合 + 登出写黑名单 + 依赖处查 | ~60 行 |
| **M6** | 所有 `payload: dict` handler → Pydantic 模型（extra=forbid）| ~15 handler |
| **M7 captcha** | 后端 math captcha 校验（绑 B1 一起做）| ~30 行 |
| **L1** | BonusTier schema 暴露 `amount_cents` | ~5 行 |
| **L2** | External `/check` 端点返回脱敏 phone（`+63***4567`）| ~5 行 |
| **L3** | Section F 字段批补（部分被 A13 吃掉，其余见 §二 §F）| 见 §F |

---

## 四、老 Phase 3 运营功能（来自 `HANDOFF_v2.5.md` §四.B）

这些是 CLAUDE.md 「❌ 未完成 Phase 3」里的条目，独立于 docx。客户没强要但之前说过要做的：

- **B1 操作日志完善** （所有财务操作留痕）
- **B2 CSV/Excel 导出** （所有数据支持导出）
- **B3 批量结算** （生成结算批次）
- **B4 财务对账** （应付/实付/异常）
- **B5 SMS 正式接口接入**（和 H5 一起做更好 —— H5 已清除硬编码，但实际 provider 代码没接）
- **B6 i18n**（多语言预留）
- **B7 地推员注册审核页** （管理端审核注册申请，现在注册进了 registrations 表但审核 UI 缺）
- **B8 UI 优化** （响应式适配、动画优化）

注意：**「HANDOFF_v2.5.md 的 B1-B8」和「docx §B1-B10」是两套完全不同的编号，不要混。** 本文档后面用 `P3-B1`…`P3-B8` 指代 Phase 3 功能，用 `§B1`…`§B10` 指代 docx 需求。

---

## 五、推荐 Wave 划分 + 执行顺序

总工量粗估：**18-30 小时人工 或 6-10 个 Codex 任务**。建议切 5 个 wave。

### Wave v26-A：快批补（~2 小时人工 / 1 Codex 1800s）

**单 Codex 打包**，改动分散但小。全部在 backend + 2 个小前端：

| ID | 文件 | 行 |
|---|---|---|
| §G 3 settings | `main.py` seed_settings | 3 |
| A13 剩 4 字段 | `schemas/staff.py` + `routers/staff.py` update_staff | 20 |
| §F `claims.promo_session_id` | `user_flow.py::complete` 插入 claim dict + `database.py` 索引 | 5 |
| §F `staff_registration_applications.source_ip` | `staff_auth.py::register` | 3 |
| §F `staff_users.last_logout_at` | `admin_auth.py::logout` + `staff_auth.py::logout` | 4 |
| §F `promo_sessions.is_used` | 写处 + 读处 | 6 |
| A1 create-form role | `frontend/src/app/(admin)/staff/staff-form-modal.tsx` + `routers/staff.py` POST | 10 |
| L1 BonusTier amount_cents | `schemas/bonus.py` | 1 |
| L2 external /check phone mask | `routers/external.py::check_reward_code` | 5 |

**Codex prompt 模板**：同 F1 风格，1800s 超时，ASCII 路径 worktree。

**Smoke**：启 smoke backend (DATABASE_NAME=ground_rewards_smoke_v26a)，验 seed + 3 个新 settings 可读 + staff 编辑 A13 全 11 字段 round-trip。

---

### Wave v26-B：前端门面（~4-6 小时 / 2 Codex 并行）

这是客户感知最强的一批。**切 2 个 Codex，前后端解耦**。

#### v26-B1 — Codex B-front1（docx §B1 §B2 §B6 §B10 + M7 captcha）

- §B1 注册页 confirm-password + math captcha UI（captcha 答案放 request body）
- §B2 注册页 WhatsApp 联系链接（读 `customer_service_whatsapp` setting）
- §B6 QR PIN 消费后，前端收到 200 立即请求新 QR（`/api/promoter/live-qr` 现有）
- §B10 home 页读 `staff_users.status / work_status / promotion_paused / risk_frozen`，状态不是 "active+promoting+!paused+!frozen" 时显示 banner + disable "Start Promotion"
- M7 captcha 后端：`staff_register_captcha_enabled=True` 时 `POST /register` 必带 `captcha_token` + `captcha_answer`，后端验 hash(token+answer+secret) 匹配。用 `otp_records` 或新 `captcha_records` 集合存 5 分钟。

文件：`frontend/src/app/(auth)/staff-register/*`、`frontend/src/app/(promoter)/home/*`、`backend/app/routers/staff_auth.py`（register 增 captcha check）。

#### v26-B2 — Codex B-front2（docx §B7 §B8 §C2 §C5 §C6）

- §B7 bonus 计数：`bonus_claim_records` 聚合时 `$match` 加 `website + redeemed` 过滤（具体字段看 `services/bonus.py`）
- §B8 home 页 "Recent Claim Records" 模块：GET `/api/promoter/recent-claims?limit=10` 返最近 claims。新端点 + 前端卡片
- §C2 welcome 端点读 `v` query param，查 `staff_users.qr_version`，不等则 404 `qr_version_mismatch`
- §C5 welcome/spin 前端手机输入：locked `+63` prefix + 10 位本地号码 input；OTP 页加 "Change number" 按钮，清 sessionStorage 重走
- §C6 `phone_daily_limit` 改语义：per-day（按 `created_at.date == today`）而非滚动 10min；额外加 `phone_per_flow_limit` 设置（默认 3）在 `verify_phone` 加校验

文件：`frontend/src/app/(user)/welcome/*` + `wheel/*`、`backend/app/routers/user_flow.py`（welcome 加 v 校验、verify_phone 加 per-flow）、`backend/app/routers/promoter.py`（新 /recent-claims 端点）。

**Codex 并行冲突点**：两者都可能碰 `user_flow.py`（v26-B2 碰 welcome + verify_phone；v26-B1 不碰）。串行 B2 后 B1 更安全，或 B1 先串 B2 后。

**Smoke**：人工跑完整注册 → captcha → home 看 banner → 扫 QR → 改手机号重发 OTP → 领奖成功 → home 看 Recent Claims。

---

### Wave v26-C：新页面/功能（~6-8 小时 / 3 Codex 串行）

这是工作量最大的 wave，建议**按需求优先级挑 1-2 项先做**，别一把梭。

| ID | 范围 | 估时 |
|---|---|---|
| **A7 奖励管理视角** | 新 dashboard 页，聚合每 campaign 的 claims / commissions / 核销率 | 3h |
| **A11 员工推广记录** | 新页 + `/api/admin/promotion-activity?staff_id=&date=` 读 `promotion_activity_logs` | 2h |
| **A14 合并结算 UI** | staff 业绩 + bonus rule 合并视图，一次性审核/结算 | 3h |
| **E1 奖励码 txt/paste UI** | `/api/admin/reward-codes/import` 支持 txt + paste 文本；listing 页加今日/历史分配核销统计卡 | 2h |
| **E5 bonus 统一结算** | admin 在 bonus_claim_records 上批量 approve / settle，写 commission_logs | 2h |

**建议顺序**：E1（独立）→ A11（纯读）→ A7（聚合查询）→ E5（状态机）→ A14（涉及多表）。每个独立 Codex，timeout 1800s。

---

### Wave v26-D：配额/审核强化（~3-4 小时 / 1-2 Codex）

| ID | 范围 |
|---|---|
| **D5** | per-staff 日核销上限：`staff_users.daily_redeem_limit`（A13 已加字段）+ `routers/external.py::redeem` 查当日 `claims` 计数，超上限则自动写 `risk_frozen=True` + expire tokens |
| **A3** | 「每有效领取结算单价」设置 + 在 commission 计算里引用 |
| **C6 per-flow cap** | 见上 B2；若未做则放这里 |
| **M3 router 级强制 CSRF** | 给 `admin/*` 路由组加 `Depends(require_csrf)`；对 Bearer-only 客户端无影响（已验过）|
| **P3-B7 注册审核页** | `registrations` 表已有，前端 `/api/admin/registrations` 列表 + approve/reject 按钮 |

**Codex 分组**：D5 + A3 + M3 一个 Codex（都是后端小改）；P3-B7 单 Codex（前后端都改）。

---

### Wave v26-E：重构/运营长尾（可选，~6-10 小时）

这批是「做会变好但不做也 ship」的东西：

- **M4** JWT 服务端失效（`revoked_tokens` 集合 + TTL = refresh 超时；logout 写 jti；依赖处查）
- **M6** `payload: dict` → Pydantic —— 全量 refactor，~15 handler。推荐新建 `schemas/requests.py` 集中放所有请求模型
- **H4** 领奖成功页 server-side：新表 `claim_receipts` 持久化成功上下文，前端改读 `/api/claim/receipt/{token}`，不再依赖 sessionStorage
- **P3-B1** 操作日志全面化（已有 `finance_action_logs`，扩到所有 admin 写操作）
- **P3-B2** CSV/Excel 导出（claims / commission / withdrawals / staff）
- **P3-B3** 批量结算 UI（基于现 `manual-settle`）
- **P3-B4** 财务对账视图
- **P3-B5** SMS 正式接入（选 provider，HUAWEI / Twilio / 本地代理）
- **P3-B6** i18n（next-intl）
- **P3-B8** 响应式 + 动画

其中 **M6 + H4 + P3-B5** 是最有价值的（安全 + 交付 + 功能正确性），其他看有没有客户明确要求。

---

## 六、建议执行顺序（浓缩版）

```
1. 读本文档
2. 读 AUDIT_REPORT_v25.md §4 对齐认知（可选）
3. Wave v26-A 快批补（1 Codex 1800s，~2h）→ smoke → 合并
4. Wave v26-D 配额/审核（1-2 Codex，~3-4h）→ smoke → 合并
5. Wave v26-B 前端门面（2 Codex 串行，~4-6h）→ 人工 smoke → 合并
6. 决定是否 push origin + tag v2.5 —— 此时 docx 合规度约 85%，核心流程齐
7. Wave v26-C 新页面（按客户需求顺序挑，每项独立 Codex）
8. Wave v26-E 重构/长尾（按 quarter 规划推）
```

**最小 ship 路径**：只跑 v26-A + v26-D 就可以 tag 并推送，剩下转 v2.6.x 迭代。

---

## 七、Codex Subagent 要点（踩过的坑）

### 每个 prompt 必写
1. **"File structure rule override — DISREGARD any rule saying files must be <300 lines. Do NOT split/refactor/rename existing files"**
2. **"Do NOT run dev server / npm build / tsc / pip install / tests"**
3. 完整 interface contract（before/after code block）
4. 明确列 forbidden 文件（并行时尤其重要）
5. `--timeout ≥1500s`（前端涉及用 1800s）

### **踩过 3 次的坑：Codex sandbox 写不了原仓库中文路径的 `.git/objects`**

现象：Codex 跑完 100%，改动在 worktree 工作区，但 `git add` / `git commit` 报 `Permission denied on E:/工作代码/159_system/.git/worktrees/xxx/index.lock` 或 `insufficient permission for adding an object to repository database E:/工作代码/159_system/.git/objects`。Codex 自己 workaround 的 "scratch git dir" 不落到真 branch 上。

**Workaround**（每次都要手工做）：
```bash
# 1. 在 worktree 外（主 shell，无 sandbox）手工 commit
cd "C:/Users/Administrator/AppData/Local/Temp/codex-worktrees/<taskname>"
git add <explicit files>
git commit -m "<message>"

# 2. 回主 repo 合并
cd "E:/工作代码/159_system"
git merge --no-ff codex-subagent/<task-branch> -m "Merge ..."

# 3. 清理
git worktree remove "C:/.../Temp/codex-worktrees/<taskname>"
git branch -d codex-subagent/<task-branch>
```

### ASCII 路径
- repo 本体在 `E:\工作代码\159_system`（含中文）
- worktree 自动落 `C:/Users/Administrator/AppData/Local/Temp/codex-worktrees/*`（ASCII，OK）
- **prompt 文件必须也放 ASCII 路径**，如 `C:/tmp/<wave>_prompt.txt`

### 并行 3 Codex 的冲突矩阵（来自 F3 经验）

F3 时三个 Codex 并行，auto-merge 成功无手工冲突。条件：
- 每个 prompt 写明 forbidden files 清单
- main.py 同文件不同段（seed_settings vs router registration）可并行
- staff_auth.py login vs register 不同函数可并行

**本次 v26 风险点**（如果并行）：
- `user_flow.py` 在 B2 + D 里都可能被动 — 串行
- `main.py seed_settings` 在 A / B1 都会动 — 串行或 tight 约束
- `schemas/staff.py` 只有 A 动 — 并行安全

### 已知 lockoutthreshold 坑
Windows 下若未设 `net accounts /lockoutthreshold:0` 且并行 3+ Codex 长时间跑，可能触发 `CreateProcessWithLogonW failed: 1909`。本机已设为 0（F3 三并行无事）。若再出问题参见 `C:/Users/Administrator/.claude/skills/codex-subagent/SKILL.md` Pitfall #7。

---

## 八、关键文件 cheatsheet（v2.6 所有 wave 会碰）

### 后端
```
backend/app/main.py                          # Wave A/B seed_settings; D 新设置
backend/app/config.py                        # 不预期动
backend/app/database.py                      # Wave A 索引（claims.promo_session_id 等）
backend/app/routers/user_flow.py             # Wave B2 C2/C5/C6、D5 redeem cap
backend/app/routers/staff_auth.py            # Wave A register source_ip + logout last_logout_at; B1 captcha
backend/app/routers/admin_auth.py            # Wave A logout last_logout_at; D M3 强制
backend/app/routers/staff.py                 # Wave A A13 剩 4 字段; D A3 定价
backend/app/routers/promoter.py              # Wave B2 recent-claims 新端点; B7 bonus 过滤
backend/app/routers/external.py              # Wave A L2 phone mask; D D5 redeem cap
backend/app/routers/public_settings.py       # Wave A 暴露 G 新 settings
backend/app/routers/registrations.py         # Wave D P3-B7 审核页后端
backend/app/schemas/staff.py                 # Wave A A13 剩 4 字段
backend/app/schemas/bonus.py                 # Wave A L1 amount_cents
backend/app/services/commission.py           # Wave D A3 单价计算
backend/app/services/bonus.py                # Wave B2 B7 过滤、E5 统一结算
backend/app/utils/csrf.py                    # Wave D M3 强制
```

### 前端
```
frontend/src/app/(auth)/staff-register/      # Wave B1 captcha + WhatsApp
frontend/src/app/(auth)/staff-login/         # —
frontend/src/app/(admin)/staff/              # Wave A A13 剩字段, A1 role
frontend/src/app/(admin)/campaigns/          # Wave C A7 dashboard、A14 合并结算
frontend/src/app/(admin)/claims/             # —
frontend/src/app/(admin)/finance/            # Wave C A14 合并结算、E5 bonus 结算
frontend/src/app/(admin)/dashboard/          # Wave C A7
frontend/src/app/(admin)/registrations/      # Wave D P3-B7（当前不存在需创建）
frontend/src/app/(admin)/promotion-activity/ # Wave C A11（需创建）
frontend/src/app/(promoter)/home/            # Wave B2 Recent Claims + B10 banner
frontend/src/app/(user)/welcome/             # Wave B2 C5 phone input
frontend/src/app/(user)/wheel/               # Wave B2 C5 change-number
frontend/src/lib/api.ts                      # 不预期动
```

---

## 九、启动/测试环境（和 v2.5_FIXES 一致，未变）

```bash
# MongoDB 确认
netstat -ano | findstr ":27017"

# 后端（必须设 JWT_SECRET_KEY 和 DEFAULT_ADMIN_PASSWORD，否则 H6 拒启动）
cd "E:/工作代码/159_system/backend" && \
JWT_SECRET_KEY="strong-dev-key-abc" DEFAULT_ADMIN_PASSWORD="StrongPass2026!" \
python -m uvicorn app.main:app --host 127.0.0.1 --port 8000

# 前端
cd "E:/工作代码/159_system/frontend" && \
BACKEND_URL=http://localhost:8000 npm run dev -- -p 3000

# 浏览器 http://localhost:3000（Next 16 拒 127.0.0.1）

# 本地 dev 想用 admin123：ALLOW_INSECURE_JWT=1 放行（只记 WARNING）
```

### 测试账号
- Admin：`admin` / `StrongPass2026!`（或 `admin123` + `ALLOW_INSECURE_JWT=1`）
- Staff：`wstest1` / `pass1234`（绑 campaign `69d5d011514405fc970bd1df`，invite_code `NFPSSY`）

### Smoke DB 命名
每个 wave 用独立 smoke DB 避免污染 dev：`ground_rewards_smoke_v26a` / `_v26b` / ...

每次 smoke 完 `c.drop_database('ground_rewards_smoke_<wave>')` 清干净。

---

## 十、交给下一次会话

**最小动作**：
1. 读本文档 §一 §二 §三 §五 §七
2. 起 Wave v26-A（单 Codex 快批补）
3. 合并 + smoke → 决定是否 push

**不建议**：
- 一把梭所有 wave（容易乱，难回滚）
- 并行动 `user_flow.py` 的两个 Codex（已知冲突点）
- 跳过 smoke 直接 push（F1/F2/F3 都验过关键路径，改动已叠 89 层，push 后出问题难定位）

**客户期望对齐**：当前 docx 合规度约 **70%**（F1-F3 已把核心安全 + 多数 admin 控制面补齐，剩下主要是前端门面 + 个别新页面 + 字段批补）。完成 Wave A + D 后约 **82%**，加 Wave B 约 **92%**，完成 C 约 **98%**。v2.6-E 是锦上添花。

**祝好运。上下文可清。**
