# i18n Audit v3.1

## Scope A — Admin Settings Labels
The admin settings surface is driven by `backend/app/routers/settings.py:13-17` and rendered generically in `frontend/src/app/(admin)/settings/page.tsx:109-110`. The seeded inventory below comes from `backend/app/main.py:67-123`; 12 of 54 keys currently have a Chinese label override in settings, so 42 keys still fall back to raw DB keys.

### A.1 Setting key inventory (table)
| key | current UI text | suggested CN label | type | file:line |
| --- | --- | --- | --- | --- |
| risk_phone_unique | Settings label: "手机号唯一限制"<br>Risk Control label: "手机号唯一限制"<br>Description: "Phone unique claim" | 手机号唯一限制 | bool | frontend/src/app/(admin)/settings/page.tsx:21, 109-110<br>frontend/src/app/(admin)/risk-control/page.tsx:64, 91-92<br>backend/app/main.py:70 |
| risk_ip_unique | Settings label: "IP 唯一限制"<br>Risk Control label: "IP 地址唯一限制"<br>Description: "IP unique claim" | IP 唯一限制 | bool | frontend/src/app/(admin)/settings/page.tsx:22, 109-110<br>frontend/src/app/(admin)/risk-control/page.tsx:65, 91-92<br>backend/app/main.py:71 |
| risk_device_unique | Settings label: "设备指纹唯一"<br>Risk Control label: "设备指纹唯一限制"<br>Description: "Device fingerprint unique" | 设备指纹唯一限制 | bool | frontend/src/app/(admin)/settings/page.tsx:23, 109-110<br>frontend/src/app/(admin)/risk-control/page.tsx:66, 91-92<br>backend/app/main.py:72 |
| sms_verification | Settings label: "短信验证"<br>Risk Control label: "短信验证码验证"<br>Description: "SMS OTP verification" | 短信验证码验证 | bool | frontend/src/app/(admin)/settings/page.tsx:24, 109-110<br>frontend/src/app/(admin)/risk-control/page.tsx:67, 91-92<br>backend/app/main.py:73 |
| sms_real_send_enabled | Settings label: "sms_real_send_enabled"<br>Description: "Real SMS send switch (False = demo mode, True = hit sms_api_url)" | 真实短信发送开关 | bool | frontend/src/app/(admin)/settings/page.tsx:109-110<br>backend/app/main.py:74 |
| sms_api_url | Settings label: "sms_api_url"<br>Description: "SMS API endpoint" | 短信 API 地址 | string | frontend/src/app/(admin)/settings/page.tsx:109-110<br>backend/app/main.py:75 |
| sms_appkey | Settings label: "sms_appkey"<br>Description: "SMS appkey (set per-env; rotate before production)" | 短信 AppKey | string | frontend/src/app/(admin)/settings/page.tsx:109-110<br>backend/app/main.py:76 |
| sms_appcode | Settings label: "sms_appcode"<br>Description: "SMS appcode (set per-env)" | 短信 AppCode | string | frontend/src/app/(admin)/settings/page.tsx:109-110<br>backend/app/main.py:77 |
| sms_appsecret | Settings label: "sms_appsecret"<br>Description: "SMS appsecret (set per-env; rotate before production)" | 短信 AppSecret | string | frontend/src/app/(admin)/settings/page.tsx:109-110<br>backend/app/main.py:78 |
| sms_extend | Settings label: "sms_extend"<br>Description: "SMS extend field" | 短信扩展字段 | string | frontend/src/app/(admin)/settings/page.tsx:109-110<br>backend/app/main.py:79 |
| sms_signature | Settings label: "sms_signature"<br>Description: "SMS signature name" | 短信签名 | string | frontend/src/app/(admin)/settings/page.tsx:109-110<br>backend/app/main.py:80 |
| sms_otp_template | Settings label: "sms_otp_template"<br>Description: "SMS message template" | 短信验证码模板 | string | frontend/src/app/(admin)/settings/page.tsx:109-110<br>backend/app/main.py:81 |
| live_qr_enabled | Settings label: "live_qr_enabled"<br>Description: "Enable secure QR+PIN flow" | 动态二维码 + PIN 开关 | bool | frontend/src/app/(admin)/settings/page.tsx:109-110<br>backend/app/main.py:82 |
| live_pin_max_fails | Settings label: "live_pin_max_fails"<br>Description: "Max wrong PIN attempts before locking a token" | PIN 最大错误次数 | number | frontend/src/app/(admin)/settings/page.tsx:109-110<br>backend/app/main.py:83 |
| live_qr_expires_sec | Settings label: "live_qr_expires_sec"<br>Description: "Live QR + PIN expiry seconds" | 动态二维码有效期 | seconds | frontend/src/app/(admin)/settings/page.tsx:109-110<br>backend/app/main.py:84 |
| promo_session_expires_min | Settings label: "promo_session_expires_min"<br>Description: "One-time claim session expiry minutes" | 单次领取会话有效期（分钟） | number | frontend/src/app/(admin)/settings/page.tsx:109-110<br>backend/app/main.py:85 |
| commission_level1_default | Settings label: "一级佣金（默认）"<br>Description: "Level 1 default commission" | 一级佣金默认值 | number | frontend/src/app/(admin)/settings/page.tsx:25, 109-110<br>backend/app/main.py:86 |
| commission_level2 | Settings label: "二级佣金"<br>Description: "Level 2 commission" | 二级佣金 | number | frontend/src/app/(admin)/settings/page.tsx:26, 109-110<br>backend/app/main.py:87 |
| commission_level3 | Settings label: "三级佣金"<br>Description: "Level 3 commission" | 三级佣金 | number | frontend/src/app/(admin)/settings/page.tsx:27, 109-110<br>backend/app/main.py:88 |
| commission_after_redeem | Settings label: "commission_after_redeem"<br>Description: "If True, website-prize commissions stay in 'pending_redeem' until the reward code is externally redeemed, then flipped to 'approved'." | 兑换后结算佣金 | bool | frontend/src/app/(admin)/settings/page.tsx:109-110<br>backend/app/main.py:89 |
| commission_vip1 | Settings label: "VIP1 一级佣金"<br>Description: "VIP1 level 1 commission" | VIP1 一级佣金 | number | frontend/src/app/(admin)/settings/page.tsx:28, 109-110<br>backend/app/main.py:90 |
| commission_vip2 | Settings label: "VIP2 一级佣金"<br>Description: "VIP2 level 1 commission" | VIP2 一级佣金 | number | frontend/src/app/(admin)/settings/page.tsx:29, 109-110<br>backend/app/main.py:91 |
| commission_vip3 | Settings label: "VIP3 一级佣金"<br>Description: "VIP3 level 1 commission" | VIP3 一级佣金 | number | frontend/src/app/(admin)/settings/page.tsx:30, 109-110<br>backend/app/main.py:92 |
| commission_svip | Settings label: "超级VIP 一级佣金"<br>Description: "Super VIP level 1 commission" | 超级 VIP 一级佣金 | number | frontend/src/app/(admin)/settings/page.tsx:31, 109-110<br>backend/app/main.py:93 |
| default_currency | Settings label: "默认货币"<br>Description: "Default currency" | 默认货币 | string | frontend/src/app/(admin)/settings/page.tsx:32, 109-110<br>backend/app/main.py:94 |
| vip_threshold_1 | Settings label: "vip_threshold_1"<br>Description: "VIP1 threshold" | VIP1 升级门槛 | number | frontend/src/app/(admin)/settings/page.tsx:109-110<br>backend/app/main.py:95 |
| vip_threshold_2 | Settings label: "vip_threshold_2"<br>Description: "VIP2 threshold" | VIP2 升级门槛 | number | frontend/src/app/(admin)/settings/page.tsx:109-110<br>backend/app/main.py:96 |
| vip_threshold_3 | Settings label: "vip_threshold_3"<br>Description: "VIP3 threshold" | VIP3 升级门槛 | number | frontend/src/app/(admin)/settings/page.tsx:109-110<br>backend/app/main.py:97 |
| vip_threshold_svip | Settings label: "vip_threshold_svip"<br>Description: "Super VIP threshold" | 超级 VIP 升级门槛 | number | frontend/src/app/(admin)/settings/page.tsx:109-110<br>backend/app/main.py:98 |
| team_reward_100_threshold | Settings label: "team_reward_100_threshold"<br>Description: "Team reward 100 threshold" | 团队奖励 100 人门槛 | number | frontend/src/app/(admin)/settings/page.tsx:109-110<br>backend/app/main.py:99 |
| team_reward_100 | Settings label: "team_reward_100"<br>Description: "Team reward 100 amount (PHP; converted via to_cents on read)" | 团队奖励 100 人金额 | number | frontend/src/app/(admin)/settings/page.tsx:109-110<br>backend/app/main.py:100 |
| team_reward_1000_threshold | Settings label: "team_reward_1000_threshold"<br>Description: "Team reward 1000 threshold" | 团队奖励 1000 人门槛 | number | frontend/src/app/(admin)/settings/page.tsx:109-110<br>backend/app/main.py:101 |
| team_reward_1000 | Settings label: "team_reward_1000"<br>Description: "Team reward 1000 amount (PHP; converted via to_cents on read)" | 团队奖励 1000 人金额 | number | frontend/src/app/(admin)/settings/page.tsx:109-110<br>backend/app/main.py:102 |
| team_reward_10000_threshold | Settings label: "team_reward_10000_threshold"<br>Description: "Team reward 10000 threshold" | 团队奖励 10000 人门槛 | number | frontend/src/app/(admin)/settings/page.tsx:109-110<br>backend/app/main.py:103 |
| team_reward_10000 | Settings label: "team_reward_10000"<br>Description: "Team reward 10000 amount (PHP; converted via to_cents on read)" | 团队奖励 10000 人金额 | number | frontend/src/app/(admin)/settings/page.tsx:109-110<br>backend/app/main.py:104 |
| external_api_key | Settings label: "external_api_key"<br>Description: "X-API-Key required for /api/external/* endpoints (rotate before production)" | 外部接口 API Key | string | frontend/src/app/(admin)/settings/page.tsx:109-110<br>backend/app/main.py:105 |
| project_name | Settings label: "project_name"<br>Description: "Brand / project name shown in headers" | 项目名称 | string | frontend/src/app/(admin)/settings/page.tsx:109-110<br>backend/app/main.py:106 |
| activity_title | Settings label: "activity_title"<br>Description: "Activity title shown to end users" | 活动标题 | string | frontend/src/app/(admin)/settings/page.tsx:109-110<br>backend/app/main.py:107 |
| activity_desc | Settings label: "activity_desc"<br>Description: "Activity description shown to end users" | 活动说明 | string | frontend/src/app/(admin)/settings/page.tsx:109-110<br>backend/app/main.py:108 |
| default_redirect_url | Settings label: "default_redirect_url"<br>Description: "Default redirect URL used by reward codes when no per-item redirect_url is set" | 默认跳转地址 | string | frontend/src/app/(admin)/settings/page.tsx:109-110<br>backend/app/main.py:109 |
| sms_cooldown_sec | Settings label: "sms_cooldown_sec"<br>Description: "Minimum seconds between OTP requests for the same phone" | 短信验证码冷却时间 | seconds | frontend/src/app/(admin)/settings/page.tsx:109-110<br>backend/app/main.py:110 |
| phone_daily_limit | Settings label: "phone_daily_limit"<br>Description: "Maximum OTP requests per phone in a rolling 10-minute window" | 手机号 OTP 请求上限 | number | frontend/src/app/(admin)/settings/page.tsx:109-110<br>backend/app/main.py:111 |
| phone_per_flow_limit | Settings label: "phone_per_flow_limit"<br>Description: "Max OTP sends per phone within a single claim flow/session" | 单次领取流程短信发送上限 | number | frontend/src/app/(admin)/settings/page.tsx:109-110<br>backend/app/main.py:112 |
| ip_daily_limit | Settings label: "ip_daily_limit"<br>Description: "Maximum OTP requests per IP inside ip_window_min" | IP OTP 请求上限 | number | frontend/src/app/(admin)/settings/page.tsx:109-110<br>backend/app/main.py:113 |
| ip_window_min | Settings label: "ip_window_min"<br>Description: "Rolling window in minutes for ip_daily_limit" | IP 限流窗口（分钟） | number | frontend/src/app/(admin)/settings/page.tsx:109-110<br>backend/app/main.py:114 |
| customer_service_enabled | Settings label: "customer_service_enabled"<br>Description: "Show floating customer-service button on user pages" | 客服悬浮按钮开关 | bool | frontend/src/app/(admin)/settings/page.tsx:109-110<br>backend/app/main.py:115 |
| staff_register_enabled | Settings label: "staff_register_enabled"<br>Description: "Allow public staff registration via POST /api/auth/staff/register (default on for continuity)" | 员工公开注册开关 | bool | frontend/src/app/(admin)/settings/page.tsx:109-110<br>backend/app/main.py:116 |
| staff_register_captcha_enabled | Settings label: "staff_register_captcha_enabled"<br>Description: "Require simple math captcha on staff register (frontend-rendered, backend-verified)" | 员工注册验证码开关 | bool | frontend/src/app/(admin)/settings/page.tsx:109-110<br>backend/app/main.py:117 |
| customer_service_whatsapp | Settings label: "customer_service_whatsapp"<br>Description: "WhatsApp link or number (e.g., https://wa.me/63XXXXXXXXXX)" | 客服 WhatsApp 链接 | string | frontend/src/app/(admin)/settings/page.tsx:109-110<br>backend/app/main.py:118 |
| customer_service_telegram | Settings label: "customer_service_telegram"<br>Description: "Telegram link (e.g., https://t.me/yourhandle)" | 客服 Telegram 链接 | string | frontend/src/app/(admin)/settings/page.tsx:109-110<br>backend/app/main.py:119 |
| must_start_work_before_qr | Settings label: "must_start_work_before_qr"<br>Description: "If True, promoter must toggle work_status='promoting' before generating live QR/PIN" | 生成动态二维码前必须开工 | bool | frontend/src/app/(admin)/settings/page.tsx:109-110<br>backend/app/main.py:120 |
| allow_static_link | Settings label: "allow_static_link"<br>Description: "If False, the /welcome/{code} static link is rejected and only signed-link flow is allowed" | 允许静态欢迎链接 | bool | frontend/src/app/(admin)/settings/page.tsx:109-110<br>backend/app/main.py:121 |
| ip_rate_limit_enabled | Settings label: "ip_rate_limit_enabled"<br>Description: "Master switch for IP-based OTP/claim rate limits (ip_daily_limit, ip_window_min)" | IP 限流总开关 | bool | frontend/src/app/(admin)/settings/page.tsx:109-110<br>backend/app/main.py:122 |
| commission_per_valid_claim | Settings label: "commission_per_valid_claim"<br>Description: "A3: settlement unit price per valid claim (PHP). Used as level-1 base when set; falls back to commission_level1_default." | 单个有效领取结算单价 | number | frontend/src/app/(admin)/settings/page.tsx:109-110<br>backend/app/main.py:123 |

### A.2 Hard-coded English strings in settings page
- None. `frontend/src/app/(admin)/settings/page.tsx` is already Chinese for page-local copy; the English currently shown to admins comes from dynamic fallback sites at line 99 (raw group keys), line 109 (raw DB keys), and line 110 (backend English descriptions).
- Unmapped group keys currently exposed through the group fallback: `sms_config` -> "短信配置"; `live_qr` -> "动态二维码"; `vip` -> "VIP 配置"; `team_reward` -> "团队奖励"; `integration` -> "接口集成"; `customer_service` -> "客服设置"; `staff_register` -> "员工注册".
- Backend descriptions are passed through verbatim by `backend/app/routers/settings.py:13-17`, so every row in the table above still shows English help text unless frontend metadata overrides it.

### A.3 Implementation proposal
Recommended file: `frontend/src/lib/settings-labels.ts` as a single source of truth for both labels and help text.

```ts
export const SETTING_LABELS: Record<string, { label: string; help?: string; unit?: string; type: string }> = {
  live_qr_expires_sec: { label: "动态二维码有效期", help: "动态二维码与 PIN 的失效秒数", unit: "s", type: "seconds" },
  sms_api_url: { label: "短信 API 地址", help: "短信网关请求地址", type: "string" },
  commission_level1_default: { label: "一级佣金默认值", help: "默认一级佣金基数", type: "number" },
};

export const SETTING_GROUP_LABELS: Record<string, string> = {
  risk_control: "风控设置",
  sms_config: "短信配置",
  live_qr: "动态二维码",
  commission: "佣金配置",
  vip: "VIP 配置",
  team_reward: "团队奖励",
  general: "通用设置",
  integration: "接口集成",
  customer_service: "客服设置",
  staff_register: "员工注册",
};
```

Consumption plan:
- In `frontend/src/app/(admin)/settings/page.tsx:99,109-110`, replace `groupLabels[group] || group`, `settingLabels[s.key] || s.key`, and `s.description` with `SETTING_GROUP_LABELS[group] ?? group`, `SETTING_LABELS[s.key]?.label ?? s.key`, and `SETTING_LABELS[s.key]?.help ?? s.description`.
- Use `SETTING_LABELS[s.key]?.type` and `unit` to drive rendering: keep booleans as toggles, render numeric values with a number input where appropriate, and show suffixes such as `s` for second-based settings.
- Reuse the same metadata in `frontend/src/app/(admin)/risk-control/page.tsx:91-92` so the four risk-control labels are not duplicated in a second map.
- Keep DB keys unchanged. The mapping file is display-only, so requests can still submit the raw key back to `/api/admin/settings/{key}`.
- Separate follow-up to avoid confusion in VIP pages: `backend/app/routers/vip_admin.py:143-146` reads `vip1_threshold` / `vip2_threshold` / `vip3_threshold` / `svip_threshold`, while the seeded keys are `vip_threshold_1` / `vip_threshold_2` / `vip_threshold_3` / `vip_threshold_svip` at `backend/app/main.py:95-98`.

## Scope B — Chinese strings in Promoter/User UIs
Promoter/user scan included `frontend/src/app/(promoter)/**`, `frontend/src/app/(user)/**`, `frontend/src/components/**`, and the shared sprint module `frontend/src/app/bonus/promoter-bonus.tsx` because `/sprint` imports it directly.

### B.1 Promoter pages
#### C:/tmp/gr_audit/.codex-subagent/worktrees/i18n-audit-1776937059191-3376/frontend/src/app/(promoter)/home/page.tsx
- L205: "今日冲单奖励" -> "Today's Sprint Bonus" (context: `BonusSprintCard` heading under the English kicker "Daily Sprint")
- L228: "暂无奖励规则" -> "No sprint rules available yet." (context: empty-state paragraph when `bonus?.rule` is missing)
- Route import check: `C:/tmp/gr_audit/.codex-subagent/worktrees/i18n-audit-1776937059191-3376/frontend/src/app/bonus/promoter-bonus.tsx` is used by `/sprint` and contains no runtime CJK strings.

### B.2 User pages
- No CJK runtime strings found under `C:/tmp/gr_audit/.codex-subagent/worktrees/i18n-audit-1776937059191-3376/frontend/src/app/(user)`.
- No CJK runtime strings found in scanned shared components under `C:/tmp/gr_audit/.codex-subagent/worktrees/i18n-audit-1776937059191-3376/frontend/src/components`.

### B.3 Locale formatting issues
- None found with explicit `zh-CN` locale in promoter/user scope.
- Related note (not counted): default-locale date rendering appears at `C:/tmp/gr_audit/.codex-subagent/worktrees/i18n-audit-1776937059191-3376/frontend/src/app/(promoter)/home/page.tsx:75`, `C:/tmp/gr_audit/.codex-subagent/worktrees/i18n-audit-1776937059191-3376/frontend/src/app/(promoter)/home/page.tsx:509`, `C:/tmp/gr_audit/.codex-subagent/worktrees/i18n-audit-1776937059191-3376/frontend/src/app/(promoter)/team/page.tsx:151`, `C:/tmp/gr_audit/.codex-subagent/worktrees/i18n-audit-1776937059191-3376/frontend/src/app/(promoter)/commission/page.tsx:206`, `C:/tmp/gr_audit/.codex-subagent/worktrees/i18n-audit-1776937059191-3376/frontend/src/app/(promoter)/wallet/page.tsx:196`, and `C:/tmp/gr_audit/.codex-subagent/worktrees/i18n-audit-1776937059191-3376/frontend/src/app/(promoter)/wallet/withdrawal-section.tsx:149`; if the product must be fixed to English formatting rather than browser locale, these should be pinned to `en-US`.

## Summary counts
- A total keys: 54
- A admin-settings hardcoded strings: 0
- B promoter CN strings: 2
- B user CN strings: 0
- B locale format issues: 0

## Methodology
```powershell
rg -n -P "[\x{4e00}-\x{9fff}]" 'frontend/src/app/(promoter)' 'frontend/src/app/(user)' 'frontend/src/components'
rg -n "zh-CN|toLocaleString\(|toLocaleDateString\(|toLocaleTimeString\(" 'frontend/src/app/(promoter)' 'frontend/src/app/(user)' 'frontend/src/components'
rg -n '/api/admin/settings|system_settings|commission_|vip_threshold|team_reward|sms_|live_qr|default_currency|project_name|activity_' 'frontend/src/app/(admin)'
$i=1; Get-Content -Path 'frontend/src/app/(admin)/settings/page.tsx' -Encoding utf8 | ForEach-Object { '{0,4}: {1}' -f $i, $_; $i++ }
$i=1; Get-Content -Path 'frontend/src/app/(admin)/risk-control/page.tsx' -Encoding utf8 | ForEach-Object { '{0,4}: {1}' -f $i, $_; $i++ }
$i=1; Get-Content -Path 'backend/app/main.py' -Encoding utf8 | ForEach-Object { '{0,4}: {1}' -f $i, $_; $i++ }
$i=1; Get-Content -Path 'backend/app/routers/settings.py' -Encoding utf8 | ForEach-Object { '{0,4}: {1}' -f $i, $_; $i++ }
```

```python
import ast, re
from pathlib import Path

root = Path(r'C:/tmp/gr_audit/.codex-subagent/worktrees/i18n-audit-1776937059191-3376')
main_text = (root / 'backend/app/main.py').read_text(encoding='utf-8')
settings_text = (root / 'frontend/src/app/(admin)/settings/page.tsx').read_text(encoding='utf-8')
risk_text = (root / 'frontend/src/app/(admin)/risk-control/page.tsx').read_text(encoding='utf-8')

module = ast.parse(main_text)
defaults = None
for node in module.body:
    if isinstance(node, ast.AsyncFunctionDef) and node.name == 'seed_settings':
        for stmt in node.body:
            if isinstance(stmt, ast.Assign) and any(isinstance(t, ast.Name) and t.id == 'defaults' for t in stmt.targets):
                defaults = ast.literal_eval(stmt.value)
                break

seed_lines = {m.group(1): i for i, line in enumerate(main_text.splitlines(), start=1) if (m := re.search(r'"key": "([^"]+)"', line)) and m.group(1) not in locals().get('seed_lines', {})}
# settings/risk maps and report rows were then derived from the parsed defaults plus line-numbered TSX reads.
```
