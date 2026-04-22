# HANDOFF v2.8 — 端到端人类交互测试规划

**目标**：用 chrome-devtools MCP（puppeteer 真点击）把 docx 声称实现的每个功能**像人一样走一遍完整流程**，不只是"API 200 + 页面有字"。

## 背景
- 当前 `docs/smoke-v26/_smoke.mjs` + `_smoke_ext.mjs` 已绿 33/33，但只是**浅测**
- 真正的端到端测试应该包含：表单填写、按钮点击、模态框操作、导航、跨页面状态、断言业务结果落库
- 所有浅测截图在 `docs/smoke-v26/*.png`，可作为 UI 参考

## 环境启动（同 HANDOFF_v2.7）
```bash
# MongoDB 已跑在 27017

# 后端（注意 admin 密码是 admin123，不是 StrongPass2026! —— 历史种子）
cd backend && JWT_SECRET_KEY="strong-dev-key-abc-long-enough" \
  DEFAULT_ADMIN_PASSWORD="StrongPass2026!" \
  python -m uvicorn app.main:app --host 127.0.0.1 --port 8000 &

# 前端
cd frontend && npm run dev -- -p 3000 &
# 必须用 http://localhost:3000，Next16 拒绝 127.0.0.1
```

**Admin 凭据**：`admin` / `admin123`（env 只在首次种子生效，已存在就是 admin123）

**种子 staff**：`wstest1` / invite_code `NFPSSY` / `qr_version=5`（真实值，文档里 v=0 已过时）

## 测试工具选择

**首选**：`C:/Users/Administrator/.claude/skills/chrome-devtools/scripts/` 的 puppeteer CLI（已安装 node_modules）

**参考脚本模板**：`docs/smoke-v26/smoke.mjs`（已封装 login/setReact/shot 等工具函数）

**关键技巧**：
- React controlled input 不能直接 `page.type()`，用 `setReact()` 通过原生 setter + dispatchEvent
- 登录用 cookie 认证（`gr_admin_token` HttpOnly），后端已发 Set-Cookie
- 截图目录：`docs/smoke-v28/`（v2.8 专用）

## 13 个端到端流程（按 docx §A-§H 分组）

每个流程都要：**登录 → 导航 → 填表/点击 → 断言 UI 变化 → 断言数据库落库 → 截图每步**。

### §A 管理后台流程

1. **新增管理员账户（A 管理员管理）**
   - 点 "Add Admin"，填 username/display_name/role=admin/temp_password
   - 提交，断言列表新增一行
   - 用新账号登出 admin 再登录新账号，断言提示改密
   - 改密后 OK 进后台

2. **地推注册审核闭环（A 注册审核）**
   - 在未登录态打开 `/staff-register`，填完整资料 + captcha 提交
   - 登录 admin → 注册审核页 → 看到申请
   - 点通过 → 断言自动创建 staff + 生成 invite_code
   - 新 staff 用账密登录 → 进入首页

3. **赞助商管理（A 赞助商）**
   - 创建 sponsor → 上传图片（multipart）→ 启用
   - 打开未登录 `/staff-login`，断言页面下方显示 sponsor logo

4. **活动管理 + 转盘配置 + 绑定地推员（A 活动管理）**
   - 创建活动 → 配置 3 个奖项（概率 20/30/10）→ 上传奖项图片
   - 绑定 2 个 staff → 断言各 staff 的 campaigns 列表有该活动
   - 启用活动

5. **奖励码导入（E 奖励码）**
   - 在活动详情内打开 reward-codes-import
   - Paste 方式导入 3 个码 → 断言列表展示
   - Upload .txt 方式导入 5 个码 → 断言总数 8

6. **地推员列表筛选（A 地推员管理）**
   - 筛选：在线/离线、推广中/暂停、启用/禁用关键词
   - 管理员暂停某员工推广 → 断言 `work_status=paused`，该员工 live QR 失效
   - 恢复 → 断言可重新开始

7. **合并结算 + 对账（A 财务）**
   - 查看某员工业绩 → 点一键结算 → 确认金额
   - 断言 commission_logs 状态流转 pending→approved→paid
   - 切到对账 tab → 断言 5 张统计卡片
   - 导出 CSV → 断言下载了 4 个文件

8. **系统设置（G 系统配置）**
   - 改项目名称、WhatsApp 链接、redeem_api_key、默认跳转网址
   - 前台 staff-login 页面断言 WhatsApp 链接生效
   - 改 `live_qr_enabled=true`、`sms_verification=true`、`sms_real_send_enabled=false`

### §B 地推员前台流程

9. **Live QR + 3 位 PIN 生成（B Live QR）**
   - 地推员登录 → 点 Start Promotion → 生成 live QR
   - 截图 QR + PIN 展示
   - 复制推广链接、刷新 QR、断言 qr_version+1

10. **Bonus Ladder 日冲单奖励（B Bonus）**
    - 进入 bonus 页面
    - 断言 3 个阶梯卡片（锁定/可领/已领状态）
    - 改 DB 模拟达标 → 刷新页面 → 点领取 → 断言 pending_settlement

### §C 用户领奖流程（最长链路）

11. **完整抽奖流程（C 端到端）**
    - 打开 live QR 对应的 URL（含 `?sig=...`）
    - 输入 3 位 PIN → 断言进入欢迎页
    - 点 View Prizes → 奖品轮播
    - 转盘抽奖动画 → 选中奖项
    - 输入 +63 前缀手机号 → 获取 OTP（demo 模式从 log 抓）
    - 验证 OTP → 确认领奖
    - 成功页断言 reward_code + Copy/Download 按钮
    - 断言 DB：claims 有新记录、reward_code 状态 allocated
    - 换设备（新 puppeteer context）用 receipt_token 查看结果 → 断言可查

12. **风控拦截（C 风控）**
    - 同一手机号再走一次 → 断言拦截
    - 不同 IP 同一手机 → 断言拦截
    - `?v=999` 错误 qr_version → 断言 expired
    - PIN 输错 5 次 → 断言锁定

### §D 外部兑奖流程

13. **外部 API 兑奖闭环（D 外部接口）**
    - 从流程 11 拿到真实 reward_code
    - `POST /api/redeem/verify` 带 X-API-Key → 断言 valid
    - `POST /api/redeem/claim` 带 X-API-Key → 断言 redeemed
    - 再次 claim 同 code → 断言 already_redeemed
    - 断言 commission_logs 从 pending_redeem 转 unpaid

## 交付物

`docs/smoke-v28/`：
- `e2e_01_admin_create.mjs` ... `e2e_13_external_redeem.mjs`（13 个独立脚本）
- `e2e_runner.mjs`（串行跑所有脚本 + 汇总 pass/fail）
- 每步截图 `{flow-id}-{step}.png`
- `results.json` 含每个流程的 {pass, fail, duration, db_assertions}
- `README.md` 列出 13 个流程的人类可读结果

## 约束

- **DB 断言**：通过 `pymongo` 直连读 MongoDB 验证落库（不只靠 API 返回）
- **每步截图**：流程 11 大约 15+ 张（welcome/prizes/wheel/phone/otp/result/receipt）
- **可重入**：每次跑前清理 test_* 前缀的 staff/claims/sponsors，不污染其他数据
- **失败快速定位**：每个断言失败时保存当前页面 HTML + screenshot + console log

## 分派建议

- **Codex subagent 不适合**此任务（需要调试交互、DB 断言、反复 tuning selector）
- **建议**：下一次会话手工跑，按流程 1 个一个写脚本调试通过再下一个
- **优先级顺序**：11（最长链路）→ 13（外部）→ 2（注册审核）→ 5（奖励码）→ 4（活动）→ 其余
- **预计工时**：13 个流程 × 30min/个 ≈ 6-8h（含调试）

## 一次启动检查（新会话第一步）

```bash
# 1. 确认环境
curl -s http://localhost:8000/api/health    # 应 {"status":"ok"}
curl -s http://localhost:3000                # 应 200
mongosh ground_rewards --eval "db.staff_users.findOne({invite_code:'NFPSSY'})" \
  # 应返回 wstest1，qr_version 记下来

# 2. 读本文件 + docs/smoke-v26/smoke.mjs（工具函数模板）

# 3. 从流程 11 开始（最有价值）
```

## 已完成基础不要重做

- ✅ v2.6 docx 100% 合规
- ✅ v2.7-A Pydantic refactor
- ✅ v2.7-B H4 receipt_token 前端切换
- ✅ v2.7-B SMS 真实 HTTP API provider
- ✅ 浅冒烟 33/33
- ✅ push 到 origin/main + tag v2.6.0
