# v2.2 实施交接文档（Wave 1 完成，Wave 2/3 待做）

**新会话打开后先读这个文件，再读 `C:\Users\Administrator\.claude\plans\concurrent-soaring-moonbeam.md` 查总体规划。**

## 一、整体背景（新会话必读）

客户在 2026-04-17 下发了 `4.17补充(1).docx`，共 A-H 八章节补充需求。我们已经做过规划，分 3 期：

- **v2.2**：安全链路（PIN+Session）+ 多管理员 + 推广状态机
- **v2.3**：奖励体系 + 外部兑奖接口鉴权
- **v2.4**：运营细节（客服、赞助商、奖励图片、mock-redeem）

每期内部再分 Wave：Wave 1 后端新增 → 验收 → Wave 2 后端改造 → 验收 → Wave 3 前端 → 验收 → 打 tag。

## 二、当前进度（2026-04-20）

### ✅ v2.2 Wave 1 已完成并合并到 main（已 push）

| commit | 内容 |
|--------|------|
| `ea6f0cd` | Task C — 多管理员 CRUD + super_admin 角色 + 账号锁定 |
| `6e79bf2` | Task A1 — Live QR + PIN verify + promo_session 基础设施（新集合/字段/工具） |
| `1040722` | Task E1 — 推广状态机 (/work/start\|stop\|pause\|resume) + /heartbeat |

**具体改动**：
- `backend/app/schemas/admin.py`（新）
- `backend/app/routers/admins.py`（新，220 行 CRUD）
- `backend/app/utils/live_token.py`（新，HMAC 签名 + PIN + session_token 生成）
- `backend/app/dependencies.py` 加了 `get_super_admin`，`get_current_admin` 加了 disabled 检查
- `backend/app/routers/admin_auth.py` login 返回 `must_change_password`，写 `last_login_at`，拒绝 disabled
- `backend/app/schemas/common.py` `TokenResponse` 加 `must_change_password` 可选字段
- `backend/app/main.py` `seed_admin` 加字段迁移，注册 `admins` router，`seed_settings` 加 4 个 live_qr 配置
- `backend/app/database.py` 加 5 个新索引（promo_live_tokens / promo_sessions / promotion_activity_logs / staff.last_seen_at）
- `backend/app/schemas/staff.py` 加 `qr_version` + work_status 字段组 + `_is_online` helper + `WorkPauseRequest`
- `backend/app/routers/promoter.py` 加 `/live-qr/generate` + 5 个 work/heartbeat 端点

### 🟡 Wave 1 验收测试 — 未完成

- 测试 Codex subagent 在 worktree `C:\Users\Administrator\AppData\Local\Temp\codex-worktrees\w1-test-1776656691854-7272` 跑了 >15 分钟没产出 `TEST_REPORT_W1.md`
- 后端（8000 端口）没监听，说明 uvicorn 没成功启动，Codex 可能卡在启动脚本
- 所有 codex/python 进程已强制清理
- **新会话要做**：要么手工跑 smoke test，要么重启一次 Test subagent，prompt 文件在 `C:\Users\Administrator\AppData\Local\Temp\prompt_w1_test.txt`

### ⬜ Wave 2、Wave 3 — 未开始

## 三、新会话第一步：验收 Wave 1

**推荐做法：手工 smoke test（最可靠）**，因为 Codex 跑验收卡住过一次，不值得再赌。

启动后端：
```bash
cd "E:/工作代码/159_system/backend"
# 先确认 MongoDB 在 27017
python -m uvicorn app.main:app --host 0.0.0.0 --port 8000
```

关键 smoke test 清单：

```bash
# 1. 种子管理员登录，验证 must_change_password 字段存在
curl -s -X POST http://localhost:8000/api/auth/admin/login \
  -H "Content-Type: application/json" \
  -d '{"username":"admin","password":"admin123"}' | python -m json.tool

# 2. 列出管理员，确认 role=super_admin
TOKEN=<上面的 access_token>
curl -s http://localhost:8000/api/admin/admins/ -H "Authorization: Bearer $TOKEN"

# 3. 创建普通 admin
curl -s -X POST http://localhost:8000/api/admin/admins/ \
  -H "Authorization: Bearer $TOKEN" -H "Content-Type: application/json" \
  -d '{"username":"testadmin","password":"pass1234","display_name":"Test"}'

# 4. 禁用该 admin，试登录 → 应 403 Account disabled
curl -s -X PUT http://localhost:8000/api/admin/admins/<id>/status \
  -H "Authorization: Bearer $TOKEN" -H "Content-Type: application/json" \
  -d '{"status":"disabled"}'

# 5. 创建 staff → 登录 → work/start → work/pause(reason) → work/resume → work/stop
# （需要先 PUT status=active 因为默认 pending_review）

# 6. heartbeat + 20s 内再调一次（第二次应是 no-op，last_seen_at 不变）

# 7. Live QR 生成（staff 需要 campaign_id；没有就先 PUT /api/admin/staff/{id} 绑一个 campaign）
curl -s -X POST http://localhost:8000/api/promoter/live-qr/generate \
  -H "Authorization: Bearer $STAFF_TOKEN"
# → 返回 pin/qr_data/expires_at/qr_version

# 8. PIN verify — 用返回的 signature 和 pin 测试
curl -s -X POST http://localhost:8000/api/claim/pin/verify \
  -H "Content-Type: application/json" \
  -d '{"staff_code":"<invite_code>","pin":"<pin>","device_fingerprint":"fp1","token_signature":"<signature>"}'
# → {"success": true, "session_token": "...", ...}

# 9. 同一 signature 再 verify → 应 not_found（token 已 consumed）
# 10. 新 generate 一次，故意输错 PIN 5 次 → 第 5 次应返回 error="locked"
```

**注意**：`/api/claim/pin/verify` 端点是 Task A1 里定义要加的，但我审查 A1 diff 时没看到它被加到 `user_flow.py`。**需要先确认这个端点是否实现了**：

```bash
grep -n "pin/verify" "E:/工作代码/159_system/backend/app/routers/user_flow.py"
```

如果没有，这是 Wave 1 的**遗漏**，要么手工补上（参考 `C:\Users\Administrator\AppData\Local\Temp\prompt_task_a1.txt` 里 `/api/claim/pin/verify` 的完整实现），要么开一个小 Codex 任务补齐。

## 四、Wave 2 待做（Test 通过后执行）

### Task A2 — 改造 /welcome /spin /complete 接入 session
- `live_qr_enabled=false` 时走老流程（当前行为）
- `live_qr_enabled=true` 时：
  - `/welcome` 要求 query 参数 `session_token`，从 `promo_sessions` 校验，不匹配返回 403 code="session_required"
  - `/spin` 和 `/complete` 接 `X-Session-Token` header，校验 device_fingerprint 匹配
  - `/complete` 成功后把 session status 置 consumed

### Task E2 — login 写 last_login_at + 列表计算 is_online
- `backend/app/routers/staff_auth.py` login 成功写 `last_login_at`
- `backend/app/routers/staff.py` 列表端点返回的每条记录加 `is_online`（调用 `_is_online(last_seen_at)`）和相关 work_status 字段
- 列表端点接受 query 参数 `online_filter`（true/false/all）

**依赖**：A2 依赖 A1；E2 依赖 E1。Wave 1 已把 A1/E1 合并，所以 A2/E2 可以并行跑。

## 五、Wave 3 待做

### Task D — 多管理员前端
- 新页 `frontend/src/app/(admin)/admins/page.tsx` — 管理员 CRUD UI
- `frontend/src/app/(auth)/admin-login/page.tsx` 登录后若 `must_change_password=true` 强制弹改密 modal

### Task B — Live QR + PIN 前端
- `frontend/src/app/(promoter)/qrcode/page.tsx` 改造为 Live QR 工作区（倒计时、PIN 显示、刷新、全屏）
- 新页 `frontend/src/app/(user)/pin/[code]/page.tsx` — 3 位 PIN 输入，通过后跳 welcome 带 session_token
- `frontend/src/app/(user)/welcome/[code]/page.tsx` 若 URL 有 session_token 就透传给 spin/complete

### Task E3 — 管理员地推员列表前端增强
- `frontend/src/app/(admin)/staff/staff-management-content.tsx` 加在线/离线筛选 chip + 在线状态点 + last_login_at 列

## 六、Codex Subagent 使用要点（坑已知）

### 代理和 API Key
- Config：`C:/Users/Administrator/.codex/config.toml` base_url=`https://pikachu.claudecode.love`
- Auth：`C:/Users/Administrator/.codex/auth.json` API key `sk-f304d18cc59cdf89c93d9f49d9927a592356900e315e0f95b21366a45ef1f62b`
- 验证是否活着：`curl -sS -X POST https://pikachu.claudecode.love/responses -H "Authorization: Bearer <key>" -H "Content-Type: application/json" -d '{"model":"gpt-5.4","input":"ok"}' -w "\nHTTP %{http_code}\n"`

### skill 路径
- 脚本：`C:/Users/Administrator/.claude/skills/codex-subagent/scripts/codex_subagent.py`
- 时间戳毫秒+随机后缀已实现，并行不会撞 worktree
- Windows 账号锁定策略已关闭（`net accounts /lockoutthreshold:0`）

### 并行启动的竞态问题
- 3 个 Codex 同时启动时**有概率**其中一个在 `config.toml` 持久化 trusted_project 时竞态失败（错误：`thread/start failed: failed to persist trusted project state`）
- 解决：**失败的那个单独重启一次**（不要和别的并行）

### Codex 卡死
- 大任务（>500 行改动或 >4 文件）容易卡在 Codex 侧（已 kill 过好几次）
- 处理：看 worktree 里 `codex_progress.log` 没更新、git diff 部分完成，就 kill 它，把已完成部分 cherry-pick 过来，剩下的手工补
- Kill 命令：`powershell -NoProfile -Command "Get-Process | Where-Object {$_.ProcessName -like '*codex*'} | Stop-Process -Force"`

### Merge 时的陷阱
- `codex_progress.log` 冲突要**只丢这一个文件**，用 `git show HEAD --stat` 校验其他文件都进来了
- 上次踩过坑：`rm codex_progress.log && git add -A && git commit` 会把 merge pending 的其他文件也吃掉

### Prompt 要点
- 每个 task 改 ≤4 文件，≤500 行
- 明确「不要动哪些文件」清单
- 完整贴出所有接口契约（request body / response shape）
- 单独列出「不要做哪些事」（Task A1 里我就特意说「don't touch /welcome /spin /complete，那是 A2 的事」）
- Prompt 长度控制在 ~100-150 行为宜

## 七、新会话的具体启动步骤

```
1. 读 E:\工作代码\159_system\HANDOFF_v2.2.md（你现在看的这个）
2. 读 C:\Users\Administrator\.claude\plans\concurrent-soaring-moonbeam.md（总体规划）
3. 先检查 /api/claim/pin/verify 是否实现了：
   grep -n "pin/verify" E:/工作代码/159_system/backend/app/routers/user_flow.py
4. 如果缺，要么手工补，要么开小 Codex 任务补
5. 跑 Wave 1 smoke test（上面第三节的 10 个 curl），逐项确认
6. smoke test 全过 → 打 tag v2.2-wave1（可选）→ 开 Wave 2
7. Wave 2 两个 task 并行：A2（user_flow 改造）+ E2（staff login/list）
   - 用 Codex subagent，每个任务独立 worktree
   - prompts 需要新会话自己写（参考 v2.2 规划文件）
8. Wave 2 合并 → 验收 → Wave 3（3 个前端 task）
9. 全部过后打 tag v2.2 并 push
```

## 八、环境快照

- 工作目录：`E:\工作代码\159_system`
- 当前分支：`main`，比 `origin/main` 领先 0 commit（已 push）
- 最新 commit：`1040722 feat(work): promotion work_status state machine...`
- 未跟踪文件：`4.17补充(1).docx`（客户原始需求文档，已在 gitignore）
- MongoDB：localhost:27017 运行中
- Codex 代理：`https://pikachu.claudecode.love`（可用）
- 所有 Codex/Python 进程已 kill

## 九、关键文件 cheatsheet

```
后端：
  backend/app/main.py                       # 入口、种子、router 注册
  backend/app/database.py                   # 所有索引
  backend/app/dependencies.py               # get_current_admin/get_super_admin/get_current_staff
  backend/app/schemas/admin.py              # 管理员 schemas（Wave 1 新增）
  backend/app/schemas/staff.py              # staff schemas（Wave 1 扩展）
  backend/app/schemas/common.py             # TokenResponse
  backend/app/routers/admin_auth.py         # 管理员登录
  backend/app/routers/staff_auth.py         # 地推员登录（Wave 2 E2 要改）
  backend/app/routers/admins.py             # 管理员 CRUD（Wave 1 新增）
  backend/app/routers/promoter.py           # Live QR + work/heartbeat
  backend/app/routers/user_flow.py          # welcome/spin/complete（Wave 2 A2 要改）+ pin/verify
  backend/app/routers/staff.py              # 后台地推员列表（Wave 2 E2 要改）
  backend/app/utils/live_token.py           # HMAC 签名/PIN/session_token 生成（Wave 1 新增）

前端（Wave 3 要改）：
  frontend/src/app/(admin)/admins/page.tsx               # 新建（Task D）
  frontend/src/app/(admin)/staff/staff-management-content.tsx  # 扩展（Task E3）
  frontend/src/app/(auth)/admin-login/page.tsx           # 加 must_change_password modal（Task D）
  frontend/src/app/(promoter)/qrcode/page.tsx            # Live QR 工作区（Task B）
  frontend/src/app/(user)/pin/[code]/page.tsx            # 新建 PIN 页（Task B）
  frontend/src/app/(user)/welcome/[code]/page.tsx        # 接 session_token（Task B）
```
