# GroundRewards — 地推领奖系统

线下地推营销系统。地推员通过专属二维码推广活动，用户扫码后通过转盘抽奖领奖。系统支持三级裂变分销、VIP 等级、佣金自动计算、财务结算、提现管理等功能。面向菲律宾等海外市场。

## 技术栈

| 层 | 技术 |
|---|------|
| 前端 | Next.js 16 (App Router) + TypeScript + Tailwind CSS v4 |
| 后端 | Python FastAPI + Motor (async MongoDB) |
| 数据库 | MongoDB |
| 短信 | 腾讯云国际短信 (tencentcloud-sdk-python) |
| 图标 | lucide-react |
| 字体 | Plus Jakarta Sans + Manrope (fonts.loli.net 镜像) |
| 设计 | Material Design 3 色彩系统 |

## 系统架构

```
                    ┌─────────────────────────────────┐
                    │       Browser (用户/地推员/管理员)  │
                    └──────────────┬──────────────────┘
                                   │
                    ┌──────────────▼──────────────────┐
                    │   Next.js Frontend (:3006)       │
                    │   - App Router (SSR/CSR)         │
                    │   - middleware.ts (API 代理)      │
                    │     /api/* → Backend :3005       │
                    │     /uploads/* → Backend :3005   │
                    └──────────────┬──────────────────┘
                                   │ HTTP Proxy
                    ┌──────────────▼──────────────────┐
                    │   FastAPI Backend (:3005)         │
                    │   - JWT 认证 (admin/staff 隔离)   │
                    │   - RESTful API                   │
                    │   - BackgroundTasks (佣金/VIP)    │
                    └──────────────┬──────────────────┘
                                   │
                    ┌──────────────▼──────────────────┐
                    │   MongoDB (:27017)                │
                    │   ground_rewards 数据库           │
                    └──────────────┬──────────────────┘
                                   │
                    ┌──────────────▼──────────────────┐
                    │   腾讯云 SMS (国际短信)            │
                    └─────────────────────────────────┘
```

## 系统角色

| 角色 | 语言 | 入口 | 说明 |
|------|------|------|------|
| 管理员 | 中文 | `/admin-login` | 后台管理所有业务 |
| 地推员 | 英文 | `/staff-login` | 推广、查看业绩、提现 |
| 用户 | 英文 | `/welcome/{code}` | 扫码抽奖领奖 |
| 外部系统 | - | `/api/external/*` | 奖励码验证与核销 |

## 目录结构

```
159_system/
├── backend/
│   ├── app/
│   │   ├── main.py                    # FastAPI 入口，路由注册，种子数据
│   │   ├── config.py                  # 环境变量配置 (pydantic-settings)
│   │   ├── database.py                # MongoDB 连接 + 索引创建
│   │   ├── dependencies.py            # JWT 认证依赖 (admin/staff 分离)
│   │   │
│   │   ├── routers/                   # API 路由 (15 个模块)
│   │   │   ├── admin_auth.py          #   管理员登录/改密/refresh
│   │   │   ├── staff_auth.py          #   地推员登录/注册/改密/refresh
│   │   │   ├── staff.py               #   地推员 CRUD + 树状视图 + 删除
│   │   │   ├── campaigns.py           #   活动 CRUD + 绑定地推员 + 奖品统计
│   │   │   ├── wheel.py               #   转盘奖项 CRUD + 图片上传
│   │   │   ├── reward_codes.py        #   奖励码管理 + CSV 导入
│   │   │   ├── user_flow.py           #   用户扫码→转盘→验证→领奖全流程
│   │   │   ├── claims.py              #   领取记录查询 (多维度筛选)
│   │   │   ├── risk_control.py        #   风控开关设置
│   │   │   ├── settings.py            #   系统配置
│   │   │   ├── promoter.py            #   地推员前台 (首页/团队/佣金/收款/提现)
│   │   │   ├── finance.py             #   财务结算 + 佣金审核 + 提现管理
│   │   │   ├── dashboard.py           #   Dashboard 统计
│   │   │   └── external.py            #   外部奖励码验证/核销 API
│   │   │
│   │   ├── services/                  # 业务逻辑层
│   │   │   ├── commission.py          #   佣金自动计算 (三级分佣)
│   │   │   ├── vip.py                 #   VIP 自动升级
│   │   │   ├── team_reward.py         #   团队累计奖励
│   │   │   └── withdrawals.py         #   提现申请处理
│   │   │
│   │   ├── schemas/                   # Pydantic 数据模型
│   │   │   ├── common.py              #   通用 (分页/Token/消息/Refresh)
│   │   │   ├── staff.py               #   地推员相关
│   │   │   └── campaign.py            #   活动/转盘/奖励码
│   │   │
│   │   └── utils/                     # 工具函数
│   │       ├── security.py            #   密码哈希 + JWT
│   │       ├── helpers.py             #   ObjectId 递归序列化
│   │       ├── sms.py                 #   腾讯云 SMS 发送
│   │       └── datetime.py            #   时区处理 (Asia/Manila)
│   │
│   ├── uploads/                       # 奖项图片上传目录
│   ├── requirements.txt
│   ├── .env                           # 环境变量 (不提交 git)
│   └── .env.example
│
├── frontend/
│   ├── next.config.ts                 # Next.js 配置 (skipTrailingSlashRedirect)
│   ├── src/
│   │   ├── middleware.ts              # API 代理 → 后端 (消除 CORS)
│   │   │
│   │   ├── lib/
│   │   │   ├── api.ts                 #   Axios 封装 + 401 拦截 + Token 自动刷新
│   │   │   ├── auth.ts                #   Cookie 管理 (admin/staff 隔离)
│   │   │   └── clipboard.ts           #   剪贴板兼容 (HTTP fallback)
│   │   │
│   │   ├── types/index.ts             # TypeScript 类型定义
│   │   │
│   │   └── app/
│   │       ├── layout.tsx             #   根布局 (字体加载)
│   │       ├── globals.css            #   MD3 色彩系统
│   │       ├── page.tsx               #   首页重定向
│   │       │
│   │       ├── (auth)/                #   认证页面组
│   │       │   ├── admin-login/       #     管理员登录
│   │       │   ├── staff-login/       #     地推员登录
│   │       │   └── staff-register/    #     地推员注册 (支持邀请码)
│   │       │
│   │       ├── (admin)/               #   管理后台 (侧边栏布局, 中文)
│   │       │   ├── layout.tsx         #     侧边栏 + 认证守卫
│   │       │   ├── dashboard/         #     数据统计面板
│   │       │   ├── staff/             #     地推员管理 (列表+树状)
│   │       │   ├── campaigns/         #     活动管理 + 转盘 + 绑定
│   │       │   ├── claims/            #     领取记录 (多维筛选)
│   │       │   ├── finance/           #     财务结算 + 佣金审核 + 提现管理
│   │       │   ├── risk-control/      #     风控设置 + 拦截日志
│   │       │   └── settings/          #     系统设置
│   │       │
│   │       ├── (promoter)/            #   地推员前台 (底部导航, 英文)
│   │       │   ├── layout.tsx         #     底部导航 + 认证守卫
│   │       │   ├── home/              #     首页 (业绩/VIP/佣金)
│   │       │   ├── qrcode/            #     专属二维码
│   │       │   ├── team/              #     我的团队 + 邀请
│   │       │   ├── commission/        #     佣金明细
│   │       │   └── wallet/            #     钱包 (收款账户/提现)
│   │       │
│   │       └── (user)/                #   用户领奖端 (无认证, 英文)
│   │           ├── welcome/[code]/    #     扫码欢迎页 (礼炮+奖品轮播)
│   │           ├── wheel/[code]/      #     转盘抽奖 + 手机验证 + 领奖
│   │           └── result/[id]/       #     领奖结果页
│   │
│   └── package.json
│
├── CLAUDE.md                          # 项目架构文档
├── EXTERNAL_API.md                    # 外部奖励码 API 文档
├── SMS_CONFIG.txt                     # SMS 服务配置说明
└── .gitignore
```

## 核心业务流程

### 用户领奖流程

```
用户扫码 → 欢迎页 (礼炮动效) → 奖品展示 → 转盘抽奖 (后端决定结果)
  ├─ 未中奖 → 显示"No Prize"
  ├─ 现场奖 → 手机验证 → 风控校验 → 确认领取
  └─ 网站奖 → 手机验证 → 风控校验 → 自动生成奖励码 → 跳转领奖网站
```

### 佣金计算流程

```
用户有效领取 → BackgroundTasks 异步处理:
  1. VIP 升级检查 (先升级, 影响佣金费率)
  2. 三级佣金自动计算:
     ├─ 一级: 直接地推员 → 按 VIP 等级 (1P/1.2P/1.5P/1.6P/2P)
     ├─ 二级: 上级地推员 → 0.3P
     └─ 三级: 上上级地推员 → 0.1P
  3. 团队累计奖励检查 (100/1000/10000 门槛)
  
佣金状态: 自动 approved → 地推员申请提现 → 管理员审批 → 打款完成
```

### 裂变关系

```
地推员 A (顶级)
  ├── B (一级下级, A 邀请)
  │   ├── D (A 的二级, B 的一级)
  │   └── E (A 的二级, B 的一级)
  └── C (一级下级, A 邀请)
      └── F (A 的三级, C 的一级)

B 的用户领奖 → A 得二级佣金 0.3P, B 得一级佣金 (按B的VIP)
F 的用户领奖 → A 得三级佣金 0.1P, C 得二级佣金 0.3P, F 得一级佣金
```

## 风控系统

| 规则 | 说明 | 可开关 |
|------|------|--------|
| 手机号唯一 | 同一活动同一手机号只能领一次 | ✅ |
| IP 唯一 | 同一活动同一 IP 只能领一次 | ✅ |
| 设备指纹唯一 | 浏览器指纹去重 | ✅ |
| SMS 验证码 | 腾讯云国际短信 6 位 OTP | ✅ |
| OTP 频率限制 | 同一手机号 10 分钟最多 3 次 | 自动 |
| IP 频率限制 | 同一 IP 1 小时最多 10 次 OTP | 自动 |
| 领取频率限制 | 同一 IP 1 小时最多 5 次领取 | 自动 |
| OTP 暴力保护 | 5 次错误自动作废 | 自动 |
| 奖品数量限制 | 每员工每奖品最大数量 (max_per_staff) | 按奖项配置 |

## VIP 等级

| 等级 | 累计有效量 | 一级佣金 |
|------|-----------|---------|
| 普通 | < 10 | 1.0P |
| VIP1 | ≥ 10 | 1.2P |
| VIP2 | ≥ 100 | 1.5P |
| VIP3 | ≥ 1000 | 1.6P |
| 超级VIP | ≥ 10000 | 2.0P |

## MongoDB Collections

| 集合 | 用途 |
|------|------|
| `admins` | 管理员账号 |
| `staff_users` | 地推员 (含 stats, vip_level, invite_code) |
| `staff_relations` | 裂变关系 (closure table: staff_id, ancestor_id, level) |
| `staff_payout_accounts` | 地推员收款账户 (GCash/Maya/Bank/USDT) |
| `campaigns` | 活动配置 |
| `wheel_items` | 转盘奖项 (weight=概率%, max_per_staff) |
| `reward_codes` | 奖励码池 (自动生成 RC + 8位随机码) |
| `claims` | 用户领取记录 |
| `scan_logs` | 扫码记录 |
| `otp_records` | OTP 验证码 (TTL 自动过期) |
| `risk_logs` | 风控拦截日志 |
| `commission_logs` | 佣金记录 (auto approved) |
| `team_rewards` | 团队累计奖励 |
| `vip_upgrade_logs` | VIP 升级记录 |
| `withdrawal_requests` | 提现申请 |
| `system_settings` | 系统配置 (key-value) |
| `finance_action_logs` | 财务操作日志 |

## API 路由总览

### 认证 (无需 Token)
```
POST /api/auth/admin/login           管理员登录
POST /api/auth/admin/refresh         管理员 Token 刷新
POST /api/auth/admin/password        管理员改密
POST /api/auth/staff/login           地推员登录
POST /api/auth/staff/register        地推员注册 (支持邀请码)
POST /api/auth/staff/refresh         地推员 Token 刷新
POST /api/auth/staff/password        地推员改密
```

### 管理后台 (需 Admin Token)
```
GET    /api/admin/dashboard/                        统计面板
GET    /api/admin/staff/                             地推员列表
POST   /api/admin/staff/                             创建地推员
GET    /api/admin/staff/tree                         地推员树状视图
GET    /api/admin/staff/{id}                         地推员详情
GET    /api/admin/staff/{id}/children                下级成员
PUT    /api/admin/staff/{id}                         编辑地推员
PUT    /api/admin/staff/{id}/status                  启用/禁用/审核
PUT    /api/admin/staff/{id}/reset-password           重置密码
DELETE /api/admin/staff/{id}                         删除地推员
GET    /api/admin/campaigns/                         活动列表
POST   /api/admin/campaigns/                         创建活动
PUT    /api/admin/campaigns/{id}                     编辑活动
PUT    /api/admin/campaigns/{id}/status              启用/暂停
DELETE /api/admin/campaigns/{id}                     删除 (仅草稿)
POST   /api/admin/campaigns/{id}/bind-staff          绑定地推员
GET    /api/admin/campaigns/{id}/staff               活动下地推员
GET    /api/admin/campaigns/{id}/staff/{sid}/prize-stats  奖品统计
GET    /api/admin/wheel-items/                       转盘奖项列表
POST   /api/admin/wheel-items/                       添加奖项
PUT    /api/admin/wheel-items/{id}                   编辑奖项
DELETE /api/admin/wheel-items/{id}                   删除奖项
PUT    /api/admin/wheel-items/{id}/toggle            启用/禁用
POST   /api/admin/wheel-items/{id}/upload-image      上传图片
GET    /api/admin/reward-codes/                      奖励码列表
POST   /api/admin/reward-codes/import                CSV 导入
PUT    /api/admin/reward-codes/{id}/block             作废
PUT    /api/admin/reward-codes/{id}/unblock           恢复
GET    /api/admin/claims/                            领取记录
GET    /api/admin/claims/{id}                        记录详情
GET    /api/admin/risk-control/                      风控设置
PUT    /api/admin/risk-control/                      更新风控
GET    /api/admin/risk-control/logs                  风控日志
GET    /api/admin/settings/                          系统配置
PUT    /api/admin/settings/{key}                     更新配置
GET    /api/admin/finance/overview                   财务总览
GET    /api/admin/finance/staff-performance          地推员业绩
GET    /api/admin/finance/commissions                佣金列表
PUT    /api/admin/finance/commission/{id}/approve     审核通过
PUT    /api/admin/finance/commission/{id}/reject      驳回
POST   /api/admin/finance/manual-settle              手动结算
GET    /api/admin/finance/settlement-records          结算记录
GET    /api/admin/finance/withdrawal-requests         提现申请列表
PUT    /api/admin/finance/withdrawal-requests/{id}/approve   审批提现
PUT    /api/admin/finance/withdrawal-requests/{id}/reject    驳回提现
PUT    /api/admin/finance/withdrawal-requests/{id}/complete  完成打款
GET    /api/admin/finance/logs                       操作日志
```

### 地推员前台 (需 Staff Token)
```
GET  /api/promoter/home                   首页数据
GET  /api/promoter/qrcode                 专属二维码
GET  /api/promoter/team                   我的团队
GET  /api/promoter/commission             我的佣金
GET  /api/promoter/vip-progress           VIP 进度
GET  /api/promoter/team-rewards           团队奖励
GET  /api/promoter/payout-accounts        收款账户列表
POST /api/promoter/payout-accounts        添加收款账户
PUT  /api/promoter/payout-accounts/{id}            编辑
DELETE /api/promoter/payout-accounts/{id}           删除
PUT  /api/promoter/payout-accounts/{id}/default    设为默认
GET  /api/promoter/withdrawal-balance     可提现余额
POST /api/promoter/withdrawal-requests    申请提现
GET  /api/promoter/withdrawal-requests    提现记录
```

### 用户领奖 (无需 Token)
```
GET  /api/claim/welcome/{code}     扫码欢迎页 (含扫码计数)
POST /api/claim/spin               转盘抽奖 (后端决定结果)
POST /api/claim/verify-phone       手机号验证 / 发送 OTP
POST /api/claim/verify-otp         OTP 校验
POST /api/claim/complete           确认领奖 (风控+佣金+VIP)
GET  /api/claim/result/{id}        领奖结果
```

### 外部接口 (无需 Token, 公开)
```
GET  /api/external/reward-code/{code}/check    检查奖励码状态
POST /api/external/reward-code/{code}/redeem   核销奖励码
```

### 系统
```
GET  /api/health                    健康检查
```

## 鉴权机制

Admin 和 Staff 使用**独立的 Cookie 命名空间**，互不干扰：

| 角色 | Token Cookie | Role Cookie | Refresh Cookie |
|------|-------------|-------------|----------------|
| Admin | `admin_token` | `admin_role` | `admin_refresh_token` |
| Staff | `staff_token` | `staff_role` | `staff_refresh_token` |

- JWT 认证，Access Token 有效期 60 分钟
- Refresh Token 有效期 7 天，401 时自动刷新
- Cookie 设置: `path=/`, `sameSite=lax`, HTTPS 时自动 `secure=true`
- 前端 middleware.ts 代理所有 `/api/*` 请求到后端，消除 CORS 问题

## 部署

### 环境要求
- Python 3.12+
- Node.js 20+
- MongoDB 6+

### 启动

```bash
# 后端
cd backend
pip install -r requirements.txt
cp .env.example .env   # 编辑配置
python -m uvicorn app.main:app --host 0.0.0.0 --port 3005 --workers 2

# 前端
cd frontend
npm install
npm run build
BACKEND_URL=http://localhost:3005 npm run start -- -p 3006
```

### 生产环境配置

```bash
# backend/.env
JWT_SECRET_KEY=<随机长字符串>
CORS_ORIGINS=http://你的域名:3006
TENCENT_SECRET_ID=<腾讯云密钥>
TENCENT_SECRET_KEY=<腾讯云密钥>
TENCENT_SMS_SDK_APP_ID=1401108922
TENCENT_SMS_TEMPLATE_ID=2625481

# 前端环境变量 (middleware.ts 使用)
BACKEND_URL=http://localhost:3005
```

### 默认账号
- 管理员: `admin` / `admin123` (启动时自动创建)

## 许可
Private - All rights reserved.
