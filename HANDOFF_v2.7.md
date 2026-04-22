# v2.6 收尾 + v2.7 起跑（新会话冷启动）

**新会话打开后先读这个文件。** 上一会话完成了 Wave v26-A/D/B/C/E 全部 21 个 commit（未 push）。本文档列下一步 TODO。

---

## 一、当前状态（2026-04-22 v2.6 完成）

### Git
```
branch: main  (110 commits ahead of origin/main — 仍未推送)
HEAD: dfc80fa Merge Wave v26-E4 — SMS provider + i18n + responsive
```

`git log b529f9f..HEAD` 共 21 个 commit，覆盖 docx §A-§H + P3-B1..B8（除 M6 refactor）。

### v2.6 已完成（docx 合规 ~100%）

| Wave | 内容 |
|---|---|
| **A** | §G 3 settings（must_start_work_before_qr / allow_static_link / ip_rate_limit_enabled）+ A13 剩 4 字段（can_generate_qr / can_use_signed_link / allow_static_link / must_start_work）+ §F 6 字段 + A1 admin-create role + L1 BonusTier.amount_cents + L2 external /check phone mask |
| **D** | D5 per-staff 日核销上限 + 自动 risk_frozen · A3 `commission_per_valid_claim` setting · M3 router 级 `Depends(require_csrf)` 强制 · P3-B7 注册审核页已存在 |
| **B** | §B1 confirm-password + math captcha UI · §B2 WhatsApp 链接 · M7 captcha 后端 `/api/auth/staff/captcha` · §B6 QR 消费后自动轮换 · §B7 bonus 只数 website+redeemed · §B8 `/api/promoter/recent-claims` + 前端卡片 · §B10 blocked banner + disable start · §C2 `?v=<qr_version>` 校验 · §C5 `+63` 前缀 + Change number · §C6 phone_daily_limit 改 per-day + 新 `phone_per_flow_limit` + `ip_rate_limit_enabled` 开关 |
| **C** | §E1 reward codes txt/paste 导入 + stats 端点 · §A7 rewards-overview dashboard · §A11 `promotion_activity_logs` admin 视图 · §A14 combined-settle UI · §E5 bonus settle-batch |
| **E** | M4 JWT 黑名单（revoked_tokens + jti claim + logout 写 blacklist） · H4 claim_receipts 持久化 + `/api/claim/receipt/{token}` · P3-B1 `finance_action_logs` 全覆盖 · P3-B2 CSV 导出（commissions/withdrawals/claims/staff） · P3-B3 `/api/admin/finance/settlement-batch` · P3-B4 `/api/admin/finance/reconciliation` · P3-B5 pluggable SMSProvider · P3-B6 i18n scaffolding（en/zh/tl） · P3-B8 admin layout 响应式 + wheel canvas max-w |

### 唯一主动跳过的
- **M6** 15 handler `payload: dict` → Pydantic refactor（非 docx 项，纯重构，风险 vs 收益不成正比，留给 v2.7）

---

## 二、下一步执行清单（按顺序）

### 步骤 1：冒烟测试（MCP Chrome DevTools）

**Chrome MCP 可用**（`chrome-devtools` 或 `webapp-testing` skill）。无需人工点击。

先起 dev 服：
```bash
# 后端
cd "E:/工作代码/159_system/backend" && \
JWT_SECRET_KEY="strong-dev-key-abc-long-enough" DEFAULT_ADMIN_PASSWORD="StrongPass2026!" \
python -m uvicorn app.main:app --host 127.0.0.1 --port 8000 &

# 前端
cd "E:/工作代码/159_system/frontend" && \
BACKEND_URL=http://localhost:8000 npm run dev -- -p 3000 &
```

Next 16 会拒绝 127.0.0.1 — 必须用 `http://localhost:3000`。

#### 必测路径（全自动化跑）

1. **Admin 登录流程**：
   - 访问 `http://localhost:3000/admin-login`
   - 填 `admin` / `StrongPass2026!` 提交
   - 预期跳到 `/dashboard`，侧边栏 13 项（推广记录 + 奖励视角 新增）
   - Console 不应该有 401/500

2. **Staff 注册（B1 captcha）**：
   - 先 PATCH setting `staff_register_captcha_enabled=true`（通过 `/api/admin/settings/staff_register_captcha_enabled`）
   - 访问 `/staff-register`
   - 验证 confirm-password field 可见、captcha question 加载、WhatsApp 条件渲染正确
   - 填充答案提交，验证返回 202

3. **Rewards Overview（A7）**：
   - 访问 `/rewards-overview`
   - 应返回 4 stat cards + 活动列表
   - 切换 campaign dropdown，API 调用 `/api/admin/dashboard/reward-overview?campaign_id=...`

4. **Promotion Activity（A11）**：
   - 访问 `/promotion-activity`
   - 空态应显示"暂无"；查看 Network 抓包是否正确带 filter query

5. **Finance 3 个新 tab（A14 + E3）**：
   - 访问 `/finance`
   - 切到 "合并结算" tab → 看列表加载
   - 切到 "对账" tab → 5 cards + anomaly list
   - "导出 CSV" 下拉菜单可点 4 项

6. **Reward Codes Import（E1）**：
   - 活动详情页的 reward-codes-import 子组件
   - 验证 Paste tab + Upload .txt tab + stats cards 渲染

7. **User claim flow（C5 + C2 + C6）**：
   - 用种子 staff `wstest1` invite_code `NFPSSY` 拼 URL `http://localhost:3000/welcome/NFPSSY?v=0`（qr_version 一般为 0）
   - 检查 wheel 页的 phone input 带 `+63` 前缀 + 只接受 10 位数字
   - OTP 发送步骤 → 验证 Change number 按钮
   - 故意用 `?v=999` 测 404 `qr_version_mismatch`

8. **JWT 黑名单（M4）**：
   - 登录 admin 拿到 token，调一个 API 成功
   - 调 `/api/auth/admin/logout`
   - 再用同个 token 调 API → 应返回 401 `token_revoked`

**MCP 推荐流程**：用 `chrome-devtools` skill 的 Puppeteer CLI，写单个 JS 跑全部路径，截图到 `E:/工作代码/159_system/docs/smoke-v26/*.png`。

#### 测试失败时的回滚策略
每个 wave 都是独立 merge commit（`--no-ff`）。失败时：
```bash
# 定位出问题的 wave
git log --oneline b529f9f..HEAD
# 逐个回滚（保留其余）
git revert -m 1 <merge-commit-sha> --no-edit
```

---

### 步骤 2：决定是否 push

**条件：** 步骤 1 的 8 个路径全绿 + 没触发 console 500/TypeError。

```bash
cd "E:/工作代码/159_system"
git push origin main
git tag v2.6.0 -m "v2.6: docx compliance 70% -> 100% (Waves A/D/B/C/E)"
git push origin v2.6.0
```

**不 push 的情况：** 如果出现回归，回滚问题 wave 后再决定。

---

### 步骤 3：v2.7 规划（docx 外的技术债）

v2.7 不追 docx（已 100%），专注工程质量。优先级从高到低：

| ID | 范围 | 估工 | 价值 |
|---|---|---|---|
| **M6** | 15 handler `payload: dict` → Pydantic（新建 `schemas/requests.py`）。prompt 已写好在 `C:/tmp/v26e_prompts/e1_pydantic_refactor.txt`，可直接复用 | 1 Codex × 1800s | 安全（extra="forbid"）+ 自动 OpenAPI + 验证 |
| **SMS provider** 真实接入 | P3-B5 已搭骨架但 `HuaweiSMSProvider.send_otp` 是 log-only stub。需按 Huawei/阿里/Twilio 任选一家实现 HMAC 签名 POST | 手工 ~2h | 生产阻塞 |
| **H4 前端切换** | 后端 `/api/claim/receipt/{token}` 已就位，前端 `(user)/result/[id]/page.tsx` 仍读 sessionStorage。改成 fetch receipt_token | 手工 ~30min | 用户体验（换设备仍能查结果） |
| **Admin 推广记录 event 写入** | 后端 `promotion_activity_logs` 集合有读取 API，但实际写入点只在几处。需在 qr_generated / pin_verified / work_start / work_stop / work_pause / work_resume 统一埋点（目前散落在 user_flow.py + promoter.py） | 1 Codex ~1h | A11 数据完整性 |
| **i18n 推开** | P3-B6 仅示例在 `otp-claim-card.tsx`。其余 user/promoter/admin 页仍硬编码中英文 | 1 Codex ~2h | 多语言真实支持 |
| **settlement_batches UI** | 后端 `POST /api/admin/finance/settlement-batch` + `GET /settlement-batches` 已就位，但前端没批量选择 staff 的界面 | 1 Codex ~1h | P3-B3 完整闭环 |
| **CSV 导出范围 filter** | 当前 `/export/*` 一把梭全表。加 date_from/date_to/status 过滤 | 1 Codex ~1h | 可用性 |
| **测试覆盖** | 目前仅靠 smoke DB + 手测。加 `pytest` + httpx async client 跑关键路径 | ~4h | 长期维护 |
| **Rate limit 配置化** | 登录节流 30/10 写死在代码。挪到 system_settings | ~30min | 运维灵活 |

**建议 v2.7 拆分：**
- **v2.7-A**（1 Codex）：M6 refactor
- **v2.7-B**（手工）：SMS provider 真实接入 + H4 前端切换
- **v2.7-C**（1 Codex）：写入点埋点 + settlement_batches UI + CSV filter（共享 finance 文件，串行）
- **v2.7-D**（手工或 Codex）：pytest 基线 + 关键路径测试

---

## 三、关键文件速查（新增在 v2.6）

### 后端新增
```
backend/app/routers/promotion_activity.py   # A11
backend/app/services/sms.py                 # P3-B5 provider 抽象
backend/app/utils/action_log.py             # P3-B1 helper
backend/app/utils/csv_export.py             # P3-B2 helper
backend/app/utils/token_revocation.py       # M4 helper
backend/app/routers/dashboard.py            # +reward-overview 端点（A7）
```

### 后端 system_settings 新增 key
`must_start_work_before_qr`, `allow_static_link`, `ip_rate_limit_enabled`, `commission_per_valid_claim`, `phone_per_flow_limit`, `staff_register_captcha_enabled`（已在前序 wave 加）。

### MongoDB 新集合
- `captcha_records`（TTL 5min，M7）
- `revoked_tokens`（TTL by exp，M4）
- `claim_receipts`（TTL 30d，H4）

### 前端新增页面
```
frontend/src/app/(admin)/promotion-activity/page.tsx
frontend/src/app/(admin)/rewards-overview/page.tsx
frontend/src/app/(admin)/campaigns/reward-codes-import.tsx
frontend/src/app/(admin)/finance/combined-settle-tab.tsx
frontend/src/app/(admin)/finance/reconciliation-tab.tsx
frontend/src/components/lang-switcher.tsx
frontend/src/lib/i18n.ts
```

### 前端侧边栏 navItems（13 项，含 2 项 v2.6 新增）
手动维护在 `frontend/src/app/(admin)/layout.tsx`，不要让 Codex 自动编辑它避免冲突（上次 E4 已动过，注意）。

---

## 四、Codex subagent 注意事项（v2.6 实战教训）

1. **中文路径 .git/objects 写不动** —— 每个 wave 合并前必须在 worktree 里手工 `git add + git commit`。Codex 的 scratch git dir 不会落到真分支。
2. **PowerShell 解析错误导致 rc=1** —— B3 第一次失败于 "ExpressionsMustBeFirstInPipeline"。cleanup 后原 prompt 直接重跑通常就通。
3. **layout.tsx 不要让 Codex 动** —— v2.6 E4 擅自加了 responsive logic，幸好不冲突。v2.7 prompt 里应该明确 forbid 这个文件。
4. **database.py 索引并行冲突** —— E2 + E3 都加 index 到 database.py，串行 merge 没冲突纯因为 append-only 不同行。但 risk 仍在，并行 task 访问同文件应错开到不同函数/区域。
5. **lockoutthreshold=0 已永久设置**（本机），3+ Codex 并行安全。

---

## 五、交给下一次会话（TL;DR）

```
1. 读本文档
2. 起后端 + 前端 dev server
3. 用 chrome-devtools MCP skill 跑 §二步骤 1 的 8 个路径
4. 截图存到 docs/smoke-v26/
5. 全绿 → push + tag v2.6.0
6. 出问题 → git revert 对应 wave 的 merge commit
7. push 后开 v2.7-A：M6 refactor（prompt 已在 C:/tmp/v26e_prompts/e1_pydantic_refactor.txt）
```

**最小动作：只跑冒烟 + push，把 v2.7 留给下下会话。**
