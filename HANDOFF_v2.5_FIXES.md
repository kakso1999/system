# v2.5 审计修复交接文档（新会话冷启动用）

**新会话打开后先读这个文件，然后读 `AUDIT_REPORT_v25.md`，然后读 `HANDOFF_v2.5.md`。**

## 一、背景（必读）

- v2.5 的 Wave 1/2/3（A1/A2/A3）已合并到 main，**commit `408e755`**，本地领先 `origin/main` 79 commit 未推送。
- Wave 1 (H4/M1/M4)、Wave 2 (HttpOnly cookies) 经审计 **零回归**，代码是稳的。
- Wave 3 (money cents) 有 **2 个 High** + **1 个 Medium** 回归要修（见下）。
- 全局审计（`AUDIT_REPORT_v25.md`）另外发现 **5 个 High** + **5 个 Medium** 跨功能安全 / 合规问题。
- **客户 `4.17补充(1).docx` 的 A–H 八章节合规性**：还有 16 条 missing + ~25 条 partial，主要集中在 admin 控制面、注册审核深度、核销后入账、/_version。

**Verdict（详见 AUDIT_REPORT_v25.md §5.4）**：**HOLD** — 必须先完成 Wave F1（Must-fix）才能 push origin 并 tag v2.5。

## 二、当前状态（2026-04-21）

### Git 状态
```
branch: main (79 commits ahead of origin/main)
最近 3 个提交：
  408e755 feat(audit-v25): A3 money float->int cents
  01f540d feat(audit-v25): A2 HttpOnly cookie auth
  2d3a258 fix(audit-v25): A1 H4 drop URL session_token + M1 wheel upload + M4 otp_reservations TTL
```

### 审计产物（repo 根目录）
- `AUDIT_REPORT_v25.md` — 完整审计报告（执行摘要 + 15 个 findings + 合规表 + 推荐）
- `AUDIT_PART_A.md` / `AUDIT_PART_B.md` / `AUDIT_PART_C.md` — 3 个 Codex 审计的原始产物（证据细节）

### 已有 handoff 文档
- `HANDOFF_v2.2.md` / `_v2.3.md` / `_v2.4.md` / `_v2.5.md`（v2.5 是 Wave 1-3 的 plan）

## 三、修复路线图（按 Wave 执行）

### ⚠️ Wave F1 — Must-fix before ship（合并后必须过 smoke 才 push）

**这一组全部是小修，改动集中、相互独立、可以单 Codex 打包做。预估 4-7 小时人工 or 1 Codex 1500s 完成所有 7 项。**

| ID | 文件 | 改动 | 预估行数 |
|----|------|------|----------|
| **H1** | `backend/app/main.py:97-101`（seed）| team_reward_* 值还原 PHP 元（300/500/1000），或删除服务端 `to_cents()`。推荐还原 seed（单行改 3 处）。 | 3 |
| **H2** | `backend/app/routers/user_flow.py:617-627` | 插入 claim 的 dict 里加 `"commission_amount_cents": 0,` | 1 |
| **M1** | `backend/app/routers/dashboard.py:22` | `$sum: "$amount"` → `$sum: "$amount_cents"`，并用 `from_cents` 包裹返回值 | 3-5 |
| **H5** | `backend/app/main.py:74-80` | 清掉硬编码 SMS 值（`sms_api_url` / `sms_appkey` / `sms_appcode` / `sms_appsecret`），改为 `""`；启动时如果 `sms_verification=true` 且值为空则 log WARNING | 15 |
| **H6** | `backend/app/config.py:28-42` | `_validate_secrets` 翻转逻辑：默认拒绝 insecure，除非 `ALLOW_INSECURE_JWT=1`；`DEFAULT_ADMIN_PASSWORD` 同样处理 | 20 |
| **H7** | `backend/app/routers/user_flow.py:683-753`（pin_verify） | 加载 staff 后校验 `status == "active"` / `work_status == "promoting"` / `promotion_paused == False` / `risk_frozen != True`（如果字段存在）。任一不过 → 返回 `{success: false, error: "staff_inactive"}`。同时 staff pause/disable 时调 `db.promo_live_tokens.update_many` 把 `status: "active"` 置为 `expired` | 30-40 |
| **/_version** | `backend/app/main.py:193` | 新增 `GET /_version` 路由返回 `{version, waves, features}`（可选但便于部署核对） | 15 |

**Codex prompt 模板**（给新会话用）：
- 列每一项的 old code + new code 对比
- 不并行其他 wave
- timeout 1500s 够用

**Wave F1 验收 smoke**（启后端 + 人工）：
1. `python -m backend.scripts.migrate_money_to_cents --dry-run` 不报错。
2. fresh Mongo 启动后 `db.system_settings.find({key: /team_reward_/})` 值为 300/500/1000（PHP 元），check_team_rewards 跑一轮产出 30000/50000/100000 cents。
3. `db.system_settings.find({key: /sms_/})` 值为空字符串。
4. 不设 `JWT_SECRET_KEY` → 启动失败（以前是仅警告）。
5. Admin 暂停某 staff 或 staff.status=disabled → 该 staff 的 live_token 立即 expired；其已下发的 PIN verify 返回 `staff_inactive`。
6. `curl /_version` 返回版本信息。
7. Dashboard "今日佣金" 数字与 promoter home 页一致（基于 $amount_cents）。

---

### Wave F2 — 核销后入账 + 原子提现（要求较大改动，单独做）

**时间**：2-4 小时 / 1-2 Codex。

#### F2.1 — H3 + G 缺失设置 `commission_after_redeem`

**新增设置**：
- `commission_after_redeem: bool = False`（默认 False 保持现有行为）

**影响文件**：
- `backend/app/main.py` seed_settings 加一行
- `backend/app/services/commission.py::create_commission_log`：如果 claim.prize_type == "website" 且 `commission_after_redeem=True`，则 `status="pending_redeem"` 而不是 `"approved"`
- `backend/app/routers/external.py::redeem_reward_code`：核销成功时，把关联 commission_logs 从 `pending_redeem` → `approved`（触发一条 $inc staff_users.stats.total_commission_cents）
- `backend/app/services/withdrawals.py::sum_amount_cents` / `get_withdrawal_balance_snapshot`：match `status: "approved"`（已是这样，不用改——但要确认 `pending_redeem` 状态下的 commission_logs 不被算入 approved 汇总）

**改动规模**：~50 行。

#### F2.2 — H4 原子提现

**选项 A**（推荐）：MongoDB transaction 包住 "check balance + insert withdrawal"：
```python
async with await client.start_session() as session:
    async with session.start_transaction():
        balance = await sum_amount_cents(..., session=session)
        if amount_cents > balance: raise ...
        await db.withdrawal_requests.insert_one(doc, session=session)
```
**要求**：MongoDB 4.0+ replica set。单机 standalone 不支持 transaction — 需 fallback。

**选项 B**（无 replica set fallback）：reservation pattern
- 新 collection `withdrawal_reservations` with TTL=30s
- 创建 withdrawal 前：`insert_one({staff_id, amount_cents, reserved_at})`（TTL 自动清理）
- 计算 available = sum(approved) - sum(withdrawals_not_rejected) - sum(active_reservations)
- 如果 amount_cents <= available → insert withdrawal_requests → delete reservation
- 如果 check 失败 → delete reservation immediately

**改动规模**：选项 A ~20 行 / 选项 B ~40 行。

---

### Wave F3 — 强烈建议 v2.5 前做（并行 2-3 个 Codex）

| ID | 任务 | 文件 | 预估行数 |
|----|------|------|----------|
| **M2** | Session device_fingerprint 在 `_require_active_session` 里比较（welcome/spin 都校验） | `user_flow.py:108-132` | 15 |
| **M3** | CSRF token 机制（简单版：登录后下发 non-HttpOnly `gr_csrf` cookie，所有 POST 要求 `X-CSRF-Token` header 匹配） | 多文件 | 80 |
| **M5** | 登录 brute-force throttle（仿 PIN 的 risk_logs 模式）| `admin_auth.py:19` / `staff_auth.py:124` | 30 |
| **M7** | 加 `staff_register_enabled` + `staff_register_captcha_enabled` 两个设置，前端按开关隐藏注册链接，后端注册端点按开关拦截 | main.py seed + staff_auth.py + 前端 login/register 页 | 50 |
| **A10** | 管理员暂停/恢复 promoter 的端点 + 前端按钮。暂停时 expired 掉该 staff 的 live_token。注意：要和 H7 联动（pin_verify 查 staff state） | `admin/staff` router + frontend staff-table | 80 |
| **A13** | staff 编辑页至少加这几个字段：`risk_frozen: bool`, `daily_claim_limit: int`, `daily_redeem_limit: int`, `payout_method/payout_account_name/payout_account_number`。后端 schema + 前端 modal | schemas/staff.py + staff.py router + staff-form-modal.tsx | 100 |
| **D1/D2** | 新增两个 alias 路由 `POST /api/redeem/verify` 和 `POST /api/redeem/claim`，内部调已有的 `/api/external/reward-code/{code}/check` 和 `.../redeem` 逻辑 | `external.py` + main.py 注册 | 40 |

**并行建议**：
- Codex A：M2 + M3 + M5（auth 相关）
- Codex B：M7 + A10 + A13（admin 控制面 — 可能冲突 staff 相关文件，仔细）
- Codex C：D1/D2 + /_version（小量端点补齐）

---

### Wave F4（可选） — Phase 3 运营功能（HANDOFF_v2.5.md B 系列）

如果客户需要的不是"完全符合 docx 再上线"而是"ship 核心功能先"，B1/B2/B3 等可以合并到 v2.6。

- B1：操作日志
- B2：CSV/Excel 导出
- B3：批量结算
- B4：财务对账
- B5：SMS 正式接入（跟 H5 一起做更好）

见 `HANDOFF_v2.5.md` §四.B。

---

### 推迟 v2.6

- M4 JWT 服务端失效
- M6 dict payload → Pydantic 模型（大面积 refactor）
- L1 BonusTier schema bump
- L2 External PII 最小化
- L3 Section F 字段补齐（大批 staff_users 字段）
- docx 里未实现的 A7 / A11 / A14 / B7 / B8 / C5 / C6 / E1 / E5 等
- i18n（HANDOFF_v2.5.md B6）
- Decimal128 精确化（客户如坚持）

## 四、建议执行顺序

```
1. 读 HANDOFF_v2.5_FIXES.md (本文件)
2. 读 AUDIT_REPORT_v25.md (完整 findings 描述)
3. 读 HANDOFF_v2.5.md (Wave 1-3 上下文，了解已做)
4. 执行 Wave F1：单 Codex，7 项打包，timeout 1500s
5. 合并 + 手工 smoke（7 条验收点）
6. 执行 Wave F2：单 Codex（核销后入账 + 原子提现）
7. 合并 + 人工 smoke（website prize 佣金延迟 + 并发提现不超发）
8. 独立 Test Codex 重跑审计验证 H1-H7 + M1 已修
9. Wave F3 并行 3 Codex（或按客户优先级挑做）
10. 合并 + 逐项 smoke
11. 打 tag v2.5 + `git push origin main`
```

## 五、Codex Subagent 要点（与 HANDOFF v2.5 §七 一致）

### 每个 prompt 必写
1. **"File structure rule override — DISREGARD any rule saying Python files must be <300 lines. Do NOT split/refactor/rename existing files"**
2. **"Do NOT run dev server / npm build / tsc / pip install"**
3. 完整 interface contract（before/after code block）
4. 不要动基础结构（`main.py` router 注册、`dependencies.py` 核心逻辑、`lib/api.ts`）
5. `--timeout ≥1500s`（Wave F2 用 1800s）

### 脚本路径
`C:/Users/Administrator/.claude/skills/codex-subagent/scripts/codex_subagent.py`

### ASCII 路径
repo 在 `E:\工作代码\159_system`（含中文），worktree 自动放 `C:/Users/Administrator/AppData/Local/Temp/codex-worktrees/*`。

### 已知 Merge 冲突点
- `main.py`（router 注册 + seed_settings — Wave F1 H5/H6/F2 设置、Wave F3 M7 设置都会碰）
- `config.py`（H6 + F3 M3 可能都加 env）
- `user_flow.py`（H2 / H7 / M2 / F2.1 都碰 — **顺序做不要并行**）
- `admin_auth.py` / `staff_auth.py`（M5 + M7 + 未来）
- `withdrawals.py`（H4 + F3 可能碰）

**处理**：手工 resolve，保留两边改动。`codex_progress.log` 冲突 `git checkout --theirs`。

## 六、环境启动（v2.5 §八）

```bash
# MongoDB 确认
netstat -ano | findstr ":27017"

# 后端
cd "E:/工作代码/159_system/backend" && python -m uvicorn app.main:app --host 127.0.0.1 --port 8000

# 前端（⚠️ 必须 BACKEND_URL + localhost）
cd "E:/工作代码/159_system/frontend" && BACKEND_URL=http://localhost:8000 npm run dev -- -p 3000

# 浏览器 http://localhost:3000（Next 16 拒 127.0.0.1）
```

### 测试账号
- Admin: `admin` / `admin123`（must_change_password=True）
- Staff: `wstest1` / `pass1234`（绑 campaign `69d5d011514405fc970bd1df`，invite_code=`NFPSSY`）

## 七、关键文件 cheatsheet（Wave F1-F3 会碰）

### Wave F1
```
backend/app/main.py                       # H5 seed、/_version 路由、H1 seed 还原
backend/app/config.py                     # H6 insecure defaults
backend/app/routers/user_flow.py          # H2 claim insert + H7 pin_verify 状态检查
backend/app/routers/dashboard.py          # M1 $amount_cents
```

### Wave F2
```
backend/app/main.py                       # commission_after_redeem seed
backend/app/services/commission.py        # F2.1 按 setting 写 pending_redeem status
backend/app/routers/external.py           # F2.1 核销时 flip commission status
backend/app/services/withdrawals.py       # F2.2 原子化
```

### Wave F3
```
backend/app/routers/user_flow.py          # M2 device binding
backend/app/utils/auth_cookies.py         # M3 CSRF
backend/app/routers/{admin,staff}_auth.py # M5 login throttle
backend/app/main.py                       # M7 register settings
backend/app/routers/staff.py              # A10 pause/resume + A13 字段
backend/app/schemas/staff.py              # A13 新字段
backend/app/routers/external.py           # D1/D2 alias 路由
frontend/src/app/(admin)/staff/staff-form-modal.tsx  # A13 前端字段
frontend/src/app/(admin)/staff/staff-table.tsx       # A10 暂停按钮
frontend/src/app/(auth)/staff-register/page.tsx      # M7 按开关隐藏
frontend/src/app/(auth)/staff-login/page.tsx         # M7 隐藏注册链接
```

## 八、交给下一次会话

- **v2.5 Waves 1-3 稳、但有 7+ High/Medium 必修**（详见 AUDIT_REPORT_v25.md §3）
- **不要 `git push origin main`** 直到 Wave F1 至少 H1+H2+M1+H5+H6 修完
- **Wave F1 可打包单 Codex**；Wave F2 分两个小步（F2.1 + F2.2 可一把梭）；Wave F3 可并行 3 Codex
- 每个 Wave 合并后跑独立 Test Codex 重审（参考 v2.4 AUDIT_REPORT_v24.md 流程）
- **预期总 commit 数**：Wave F1 约 +5 commit（或合成 1 个）、F2 约 +2、F3 约 +3 → 最终 ~89 commit 后打 tag v2.5 + push

**祝好运。上下文可清。**
