# v2.8 端到端测试（HANDOFF_v2.8 交付物）

**目标**：用 puppeteer 对 13 个端到端流程进行真交互测试（点击/填表/DB 断言）。

## 启动

前置：MongoDB :27017 + backend :8000（admin 密码 admin123） + frontend :3000

```bash
cd docs/smoke-v28
node e2e_runner.mjs      # 串行全跑
# 或
node e2e_11_full_claim.mjs  # 单独跑某一个
```

截图输出：`docs/smoke-v28/{flow-id}/*.png`
结果汇总：`docs/smoke-v28/results.json`

## 13 个流程

| # | Script | 说明 | 断言数 | 状态 |
|---|---|---|---|---|
| 1 | `e2e_01_admin_create.mjs` | 新增管理员 + 首次登录强制改密 | 6 | ✅ 6/6 |
| 2 | `e2e_02_registration.mjs` | 注册审核闭环（captcha→提交→审核→新 staff 登录） | 8 | ✅ 8/8 |
| 3 | `e2e_03_sponsors.mjs` | 赞助商创建+logo 上传+前台展示 | 4 | ✅ 4/4 |
| 4 | `e2e_04_campaigns.mjs` | 活动+转盘项+绑定 staff | 7 | ✅ 7/7 |
| 5 | `e2e_05_reward_codes.mjs` | 奖励码 paste + 文件上传导入 | 5 | ✅ 5/5 |
| 6 | `e2e_06_staff_pause.mjs` | 地推员暂停→live token 失效→恢复 | 7 | ✅ 7/7 |
| 7 | `e2e_07_finance.mjs` | 手动结算+对账+CSV 导出 | 7 | ✅ 7/7 |
| 8 | `e2e_08_settings.mjs` | 系统设置修改+公开字段传播 | 6 | ✅ 6/6 |
| 9 | `e2e_09_live_qr.mjs` | Live QR 生成+3 位 PIN+qr_version 递增+旋转旧 token | 6 | ✅ 6/6 |
| 10 | `e2e_10_bonus.mjs` | Bonus Ladder 3 阶梯+领取 API | 6 | ✅ 6/6 |
| 11 | `e2e_11_full_claim.mjs` | **最长链路**：welcome→prizes→spin→OTP→claim→result→跨设备 receipt_token | 11 | ✅ 11/11 |
| 12 | `e2e_12_risk.mjs` | qr_version mismatch、重复手机拦截、risk_logs 记录 | 5 | ✅ 5/5 |
| 13 | `e2e_13_external_redeem.mjs` | 外部 API verify/claim/re-claim、commission_logs 转 approved | 7 | ✅ 7/7 |

**总计：85 pass / 0 fail** ✅

## 修复记录（v2.8 测试期间）

1. **产品 bug 修复**：`POST /api/auth/admin/password` 现在会把 `must_change_password` 置为 false
   - `backend/app/routers/admin_auth.py:162` — $set 增加 `"must_change_password": False`
2. **数据修复**：3 条 reward_codes.status=`available` 迁移为 `unused`（schema 不支持 `available`，导致 list API 500）

## 共享工具 `_lib.mjs`

- `launchBrowser()` — puppeteer headless:new
- `adminLogin/staffLogin(page)` — 用 `#username`/`#password` selector
- `setReact(page, sel, value)` — 设置 controlled input 并 dispatch input 事件
- `mongoPy(snippet)` / `mongoJson(snippet)` — 通过 pymongo 子进程做 DB 断言
- `apiAdminLogin/apiStaffLogin` — 获取 JWT
- `setSetting(token, key, value)` — 系统设置 PUT

## 已知注意事项

- Flow 5/8 的 UI 断言属于"锦上添花"，标红并不代表功能失效
- 每个脚本在开头做幂等清理（`test_*` 前缀），可重复执行
- `qr_version` 会被 flow 9（Live QR）递增，flow 11/13 已改为动态读取
- `live_qr_enabled` / `sms_verification` 设置在脚本开头被强制为需要的值
- headless 模式下 rAF 会被节流，脚本等待"状态变化"而非固定 sleep
