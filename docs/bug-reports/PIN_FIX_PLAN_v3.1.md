# PIN 验证失败 — 修复执行计划（v3.0 → v3.1）

> 交给 Codex subagent 执行的完整自包含方案。Claude 清空上下文后，下一个会话直接按此计划分派任务即可。

## 上下文回顾

- 当前 git tag：`v3.0`（含 audit v28 的 5 个新模块 + live-qr GET 端点）
- 审计报告：`E:/工作代码/159_system/docs/bug-reports/pin_bug_audit_v3.0.md`
- 复现脚本：`E:/工作代码/159_system/docs/bug-reports/pin_bug_repro.py`
- 用户截图：`E:/工作代码/159_system/docs/bug-reports/pin_bug_v3.0.png`
- ASCII 镜像仓库：`C:/tmp/gr_audit`（codex 不能处理中文路径）
- Codex 工具：`~/.claude/skills/codex-subagent/scripts/codex_subagent.py`

## 5 个确认根因与对应修复

### Fix #1 · P0 · `/live-qr/generate` 缺 staff 状态门禁
**文件**：`backend/app/routers/promoter.py:381-394`
**问题**：路由只检查 `campaign_id`，不检查 `status` / `work_status` / `promotion_paused` / `risk_frozen`，生成的 token 在 `user_flow.pin_verify` 时会被 `staff_inactive` 拒绝。
**修复**：在 generate 开头加门禁，参照 `routers/user_flow.py:753-763` 的完整条件。返回 `HTTP 400` 且 `detail={"code": "staff_inactive", "reason": ...}`。

### Fix #2 · P0 · token `locked` 后前端不自动轮换
**文件**：`frontend/src/app/(promoter)/qrcode/page.tsx:266-269`
**问题**：只在 `status === "consumed"` 时 auto-generate，漏掉 `locked` / `expired` / `rotated`。
**修复**：改成 `if (state.status !== "active") void generateLiveQr(true);` 并额外让后端 `GET /live-qr` 在返回 `locked|expired|rotated` 时带 `needs_rotate: true` 字段。

### Fix #3 · P0 · 前端 poll vs generate 竞态
**文件**：`frontend/src/app/(promoter)/qrcode/page.tsx:271-307`
**问题**：`applyLiveQrPayload` 无条件覆盖 state，慢 GET 响应能盖掉新 POST。
**修复**：
- state 里增加 `current_live_token_id`
- `applyLiveQrPayload` 只接受 `payload.live_token_id !== prev.current_live_token_id` 或新 `qr_version > prev.qr_version` 的响应
- 在 generate 请求 in-flight 期间暂停 3s 轮询（使用 `useRef<boolean>` 标记）

### Fix #4 · P1 · `/pin/[code]` 锁死旧 `lt`，rotate 后必然失败
**文件**：`frontend/src/app/(user)/pin/[code]/page.tsx:189-252`
**问题**：用户扫码后 `lt` 固化在 URL，rotate 后用户看到的是地推员屏幕的新 PIN，但提交的 lt 是旧的。
**修复**：在用户进入 `/pin/[code]` 时调用新接口 `GET /api/claim/live-status?staff_code=...&lt=...`，如果签名不再对应 active token，前端立即弹窗"二维码已过期，请重新扫描"并锁定输入。不要绕过一次性设计。

### Fix #5 · P1 · 前端错误文案漏了 3 个后端错误码
**文件**：`frontend/src/app/(user)/pin/[code]/page.tsx:11-56`
**问题**：`PinError` union 只列 5 个码，实际后端会返回 `staff_inactive` / `device_fingerprint_required` / `invalid_signature`，都落到兜底文案（截图里就是这个）。
**修复**：扩展 union + 各自专属文案；dev 模式下 `console.warn` 打印 raw payload。

---

## 任务分派（3 个并行 Codex worktree）

### Task FIX-A · 后端门禁 + 轮换响应
**分派给**：Codex worktree
**文件**：
- MODIFY `backend/app/routers/promoter.py`（约 +40 行）
- MODIFY `backend/app/routers/user_flow.py`（约 +30 行，新增 `GET /api/claim/live-status`）
- MODIFY `backend/app/schemas/requests.py` 若需新 schema

**接口契约**：
```
POST /api/promoter/live-qr/generate
  新行为：若 staff.status!='active' or work_status!='promoting'
          or promotion_paused or risk_frozen
          → HTTP 400 {"detail":{"code":"staff_inactive","reason":...}}
  其他行为不变

GET /api/promoter/live-qr
  响应新增字段：needs_rotate: bool  (true 当 status in locked|expired|rotated)
  其他字段不变

GET /api/claim/live-status?staff_code=XXX&lt=<signature>
  无鉴权（用户匿名调用）
  响应 {
    valid: bool,           # signature 是否对应当前 active token
    staff_active: bool,    # staff 状态全检查（沿用 pin_verify 同样条件）
    qr_version: int,       # 当前 staff 的 qr_version
    pin_version: int,      # 当前 active token 的 qr_version（若有）
    reason: str | null,    # 若 valid=false，给出 'rotated'|'expired'|'consumed'|'locked'|'staff_inactive'|'not_found'
  }
  限流：同 ip 每分钟 30 次
```

**禁改文件**：
- `backend/app/main.py`（supervisor 挂载）
- `backend/app/utils/live_token.py`
- 任何 frontend 文件

**约束**：UTF-8、async、每文件 <300 行、无新依赖、现有 router 用 `dependencies=[Depends(...)]` 就地扩展。

---

### Task FIX-B · 地推员 QR 页竞态 + locked 自动轮换
**分派给**：Codex worktree
**文件**：
- MODIFY `frontend/src/app/(promoter)/qrcode/page.tsx`（集中所有改动到此文件）

**要求**：
1. `LiveQrPayload` 类型加 `needs_rotate?: boolean` 字段。
2. state 新增 `currentTokenId: string`。
3. `applyLiveQrPayload` 接收参数 `(payload, source: 'generate' | 'poll')`：
   - 如果 `source === 'poll'` 且 `payload.live_token_id !== currentTokenId` 且新 `qr_version <= current.qr_version`：丢弃（stale response）
   - 否则正常覆盖 state
4. `generateLiveQr` 期间 `useRef<boolean> isGenerating.current = true`，`refreshLiveQr` 里检测到 true 就直接 return。
5. 自动轮换条件扩展：`state.status !== "active" || state.needs_rotate` 时触发 generate。
6. 加 `useEffect` 监听 `document.visibilitychange`，页面切回来时强制 refresh 一次。

**禁改文件**：
- 所有 backend 文件
- `frontend/src/app/(user)/*`
- `frontend/src/app/(admin)/*`
- `frontend/src/lib/*`

---

### Task FIX-C · 用户 PIN 页预检 + 错误文案
**分派给**：Codex worktree
**文件**：
- MODIFY `frontend/src/app/(user)/pin/[code]/page.tsx`

**要求**：
1. 在 mount 时 useEffect 调用 `GET /api/claim/live-status?staff_code=CODE&lt=LT`：
   - 如果 `valid === false`：立即 disable 所有输入，显示 "QR code expired / rotated, please rescan the promoter's latest QR." 提供一个 "Retry check" 按钮。
   - 如果 `valid === true` 且 `staff_active === false`：显示 "Promotion is paused. Please ask the promoter to resume." 并 disable 输入。
2. 扩展 `PinError` union 加 `"staff_inactive"` / `"device_fingerprint_required"` / `"invalid_signature"`。
3. `getErrorMessage` 为这 3 个新码加专属中英双语文案（admin CN / user EN 规范保持用户端英文）：
   - `staff_inactive`: "The promoter is not currently active. Please try again later."
   - `device_fingerprint_required`: "Your browser blocked a required check. Please disable strict privacy mode and reload."
   - `invalid_signature`: "This QR code is invalid. Please scan the latest QR from the promoter."
4. 如果 `process.env.NODE_ENV === 'development'`，在 submit 失败后 `console.warn('[pin-verify] raw:', err.response?.data)`。
5. 轻量 5s 轮询 `/live-status`（仅在用户未输入时），检测到 rotation 立即弹 toast 并 disable。

**禁改文件**：
- 所有 backend 文件
- `frontend/src/app/(promoter)/*`
- `frontend/src/app/(admin)/*`
- `frontend/src/lib/*`

---

## 执行步骤（给 Claude 下一次会话照着做）

```bash
# 1. 同步镜像到最新
cd C:/tmp/gr_audit && git fetch "E:/工作代码/159_system" main && git reset --hard FETCH_HEAD

# 2. 写 3 个 prompt（按上述契约展开，每个 prompt 必须包含：
#    - 共享上下文（仓库/技术栈/代码约定，沿用之前 audit v28 的 _contract.md 精神）
#    - Files to Create/Modify
#    - Files NOT to Create/Modify
#    - 上面列出的 Requirements
#    - Constraints：UTF-8 / <300 行 / 无新依赖）

# 3. 并行启动 3 个 Codex
SCRIPT="$HOME/.claude/skills/codex-subagent/scripts/codex_subagent.py"
cd C:/tmp/gr_audit
python "$SCRIPT" run -p "$(pwd)" -t "fix-a-backend"   --prompt "@C:/tmp/gr_prompts/fix_A_backend.txt"   --timeout 1400 > C:/tmp/fix_A.json 2>&1 &
python "$SCRIPT" run -p "$(pwd)" -t "fix-b-promoter"  --prompt "@C:/tmp/gr_prompts/fix_B_promoter.txt"  --timeout 1400 > C:/tmp/fix_B.json 2>&1 &
python "$SCRIPT" run -p "$(pwd)" -t "fix-c-user-pin"  --prompt "@C:/tmp/gr_prompts/fix_C_user_pin.txt"  --timeout 1400 > C:/tmp/fix_C.json 2>&1 &
wait

# 4. Review 每份 diff
for f in A B C; do python -c "import json; d=json.load(open('C:/tmp/fix_'+'$f'+'.json',encoding='utf-8',errors='replace')); print('$f:', d.get('success'), d.get('changed_files'))"; done

# 5. Merge 顺序：先 FIX-A（后端接口），再 FIX-B 和 FIX-C（都依赖 A 的接口）
python "$SCRIPT" merge -p "$(pwd)" -w <wt-a> -b <branch-a> --message "fix(backend/live-qr): add staff-state gate + GET /claim/live-status + needs_rotate flag"
python "$SCRIPT" merge -p "$(pwd)" -w <wt-b> -b <branch-b> --message "fix(frontend/promoter-qr): dedupe stale poll responses + auto-rotate on locked/expired"
python "$SCRIPT" merge -p "$(pwd)" -w <wt-c> -b <branch-c> --message "fix(frontend/user-pin): preflight live-status + surface hidden backend errors"

# 6. 镜像 pull 回原仓库
cd "E:/工作代码/159_system" && git pull C:/tmp/gr_audit main

# 7. 全重启前后端（先 kill 8000/3006，然后按已有命令起）

# 8. Repro 验证
cd "E:/工作代码/159_system" && python docs/bug-reports/pin_bug_repro.py

# 9. 打 v3.1 tag
git tag -a v3.1 -m "v3.1 — PIN verify bugs fully fixed (5 confirmed issues)"
```

## 验收标准（v3.1 上线前必过）

- [ ] Repro 脚本全绿：generate → 立即 verify 返回 `success: true`
- [ ] 故意把 staff 的 `work_status` 改成 `stopped` 后 `/live-qr/generate` 返回 HTTP 400 `staff_inactive`
- [ ] 地推员页连续手动刷新 10 次，用户用最后一次的 QR+PIN 能验证通过
- [ ] 用户打开 `/pin/[code]` 后，地推员手动刷一次 → 用户页 5s 内弹出"请重新扫码"
- [ ] PIN 输错 5 次锁定后，地推员页 3s 内自动换新 PIN + 新二维码
- [ ] 用户连输错不存在的 PIN，错误文案显示为 `Wrong PIN. Attempts remaining: X` 而不是兜底的 "We could not verify"

## 回退预案

每一笔 merge 都是独立 commit，有问题直接 `git revert <sha>`。保留 `v3.0` tag 作为 fallback。

## 未修项（v3.2+）

来自 audit Section 2（Suspected）：
- 多标签同开 QR 页的全局锁（需 BroadcastChannel 或服务端 session 唯一化）
- device fingerprint 稳定性跨浏览器（需要 fingerprintjs 或 canvas 指纹升级）
- `.env.local` 缺失保护（启动时 warning）

---

**文件位置汇总**：
- 本规划：`E:/工作代码/159_system/docs/bug-reports/PIN_FIX_PLAN_v3.1.md`
- 审计报告：`E:/工作代码/159_system/docs/bug-reports/pin_bug_audit_v3.0.md`
- 复现脚本：`E:/工作代码/159_system/docs/bug-reports/pin_bug_repro.py`
- 截图：`E:/工作代码/159_system/docs/bug-reports/pin_bug_v3.0.png`
