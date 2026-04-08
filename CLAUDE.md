# GroundRewards 地推领奖系统

## 项目概述
线下地推营销系统，地推员通过专属二维码推广活动，用户扫码后通过转盘抽奖领奖。
系统包含三级裂变分销、VIP等级、佣金自动计算、财务结算等功能。
面向菲律宾等海外市场（员工端和用户端英文，后台中文）。

## 技术栈

| 层 | 技术 |
|---|------|
| 前端 | Next.js 16 (App Router) + TypeScript + Tailwind CSS v4 |
| 后端 | Python FastAPI + Motor (async MongoDB) |
| 数据库 | MongoDB |
| 图标 | lucide-react（Google Fonts 被墙，不用 Material Symbols） |
| 字体 | Plus Jakarta Sans + Manrope（通过 fonts.loli.net 镜像加载） |
| 设计风格 | Material Design 3 色彩系统，品牌名 GroundRewards |

## 启动方式

```bash
# 前置：需要 MongoDB 运行在 localhost:27017

# 后端
cd backend && pip install -r requirements.txt
python -m uvicorn app.main:app --host 0.0.0.0 --port 8000

# 前端
cd frontend && npm install && npm run dev -- -p 3000
```

默认管理员：`admin` / `admin123`（启动时自动创建）

## 目录结构

```
159_system/
├── backend/
│   ├── app/
│   │   ├── main.py              # FastAPI 入口，路由注册，种子数据
│   │   ├── config.py            # 环境变量配置
│   │   ├── database.py          # MongoDB 连接 + 索引创建
│   │   ├── dependencies.py      # JWT 认证依赖（get_current_admin, get_current_staff）
│   │   ├── routers/
│   │   │   ├── admin_auth.py    # 管理员登录/改密
│   │   │   ├── staff_auth.py    # 地推员登录/注册/改密
│   │   │   ├── staff.py         # 地推员 CRUD（管理端）
│   │   │   ├── campaigns.py     # 活动 CRUD + 绑定地推员
│   │   │   ├── wheel.py         # 转盘奖项 CRUD + 图片上传
│   │   │   ├── reward_codes.py  # 奖励码管理 + CSV 导入
│   │   │   ├── user_flow.py     # 用户扫码→转盘→验证→领奖全流程
│   │   │   ├── claims.py        # 领取记录查询
│   │   │   ├── risk_control.py  # 风控开关设置
│   │   │   ├── settings.py      # 系统配置
│   │   │   ├── promoter.py      # 地推员前台 API
│   │   │   ├── finance.py       # 财务结算
│   │   │   └── dashboard.py     # Dashboard 统计
│   │   ├── schemas/
│   │   │   ├── common.py        # 通用 schema（分页、Token、消息）
│   │   │   ├── staff.py         # 地推员相关 schema
│   │   │   └── campaign.py      # 活动/转盘/奖励码 schema
│   │   └── utils/
│   │       ├── security.py      # 密码哈希、JWT 工具
│   │       └── helpers.py       # ObjectId 转换工具
│   ├── uploads/                 # 奖项图片上传目录
│   ├── requirements.txt
│   └── .env
│
├── frontend/
│   └── src/
│       ├── app/
│       │   ├── (auth)/
│       │   │   ├── admin-login/page.tsx    # 管理员登录页
│       │   │   └── staff-login/page.tsx    # 地推员登录页
│       │   ├── (admin)/
│       │   │   ├── layout.tsx             # 后台侧边栏布局
│       │   │   ├── dashboard/page.tsx     # Dashboard 统计
│       │   │   ├── staff/page.tsx         # 地推员管理（增删改查）
│       │   │   ├── campaigns/page.tsx     # 活动管理 + 转盘配置 + 绑定地推员
│       │   │   ├── claims/page.tsx        # 领取记录
│       │   │   └── finance/page.tsx       # 财务结算
│       │   ├── (promoter)/
│       │   │   ├── home/page.tsx          # 地推员首页
│       │   │   └── qrcode/page.tsx        # 专属二维码页
│       │   ├── (user)/
│       │   │   ├── welcome/[code]/page.tsx # 扫码欢迎页（3步：礼炮→奖品展示→转盘）
│       │   │   ├── wheel/[code]/page.tsx   # 转盘抽奖页（Canvas动画+验证+领奖）
│       │   │   └── result/[id]/page.tsx    # 领奖结果页
│       │   ├── layout.tsx                 # 根布局
│       │   ├── globals.css                # 全局样式 + MD3 色彩系统
│       │   └── page.tsx                   # 首页重定向
│       ├── lib/
│       │   ├── api.ts                     # Axios 封装 + 401 拦截
│       │   └── auth.ts                    # Cookie token 管理
│       └── types/index.ts                 # TypeScript 类型定义
│
└── stitch/                                # Stitch 设计稿参考
    ├── dashboard/                         # 地推员首页设计
    ├── desktop/                           # 管理员登录设计
    └── lottery/                           # 转盘抽奖设计
```

## 功能实现状态

### ✅ 已完成

| 功能 | 后端 | 前端 | 说明 |
|------|------|------|------|
| 管理员登录/改密 | `routers/admin_auth.py` | `(auth)/admin-login` | JWT 认证 |
| 地推员登录/注册 | `routers/staff_auth.py` | `(auth)/staff-login` | 注册需管理员审核 |
| 新增/编辑/启用/禁用地推员 | `routers/staff.py` | `(admin)/staff` | 表格+模态框 CRUD |
| 活动管理 CRUD | `routers/campaigns.py` | `(admin)/campaigns` | 创建/编辑/启用/暂停/删除 |
| 转盘奖项配置 | `routers/wheel.py` | `(admin)/campaigns` 模态框 | 百分比概率，现场奖/跳转奖 |
| 奖项图片上传 | `routers/wheel.py` upload-image | `(admin)/campaigns` | 上传到 /uploads/ |
| 地推员绑定活动 | `routers/campaigns.py` bind-staff | `(admin)/campaigns` 模态框 | 批量勾选绑定/解绑 |
| 地推员专属二维码 | `routers/promoter.py` qrcode | `(promoter)/qrcode` | 邀请码+复制链接 |
| 用户扫码欢迎页 | `routers/user_flow.py` welcome | `(user)/welcome/[code]` | 礼炮动效+奖品轮播 |
| 转盘抽奖 | `routers/user_flow.py` spin | `(user)/wheel/[code]` | Canvas 动画+加权随机 |
| 手机号验证/OTP | `routers/user_flow.py` verify-* | `(user)/wheel/[code]` | 支持 SMS 开关 |
| 风控：手机号/IP 唯一 | `routers/user_flow.py` check_risk | 内嵌在领奖流程 | 可后台开关 |
| 现场奖领取 | `routers/user_flow.py` complete | `(user)/result/[id]` | 现场确认 |
| 指定网站奖跳转 | `routers/user_flow.py` complete | `(user)/result/[id]` | 跳转外站链接 |
| 后台查看领取记录 | `routers/claims.py` | `(admin)/claims` | 按手机/状态筛选 |
| 后台按地推员结算 | `routers/finance.py` manual-settle | `(admin)/finance` | 手动结算+金额校验 |
| Dashboard 统计 | `routers/dashboard.py` | `(admin)/dashboard` | 今日/总计扫码/领取/佣金 |
| 风控设置 | `routers/risk_control.py` | 路由已注册 | 风控开关管理 |
| 系统设置 | `routers/settings.py` | 路由已注册 | 佣金比例/VIP 门槛配置 |
| 地推员首页 | `routers/promoter.py` home | `(promoter)/home` | 业绩统计+团队数据 |

### ❌ 未完成（Phase 2 + Phase 3）

| 功能 | 优先级 | 说明 |
|------|--------|------|
| 裂变邀请注册 | Phase 2 | 地推员通过链接邀请新成员，自动绑定上下级 |
| 三级关系树查看 | Phase 2 | 后台查看地推员上下级关系树 |
| 佣金自动计算 | Phase 2 | 有效领取后自动算一二三级佣金 |
| VIP 自动升级 | Phase 2 | 按累计有效量自动升级 VIP，影响佣金比例 |
| 团队累计奖励 | Phase 2 | 团队满 100/1000/10000 自动发奖 |
| 收款账户绑定 | Phase 2 | 地推员绑定 GCash/Maya/银行卡/USDT |
| 地推员团队页 | Phase 2 | 查看一二三级成员列表 |
| 地推员佣金明细 | Phase 2 | 按层级查看佣金来源 |
| 佣金审核/冻结/解冻 | Phase 3 | 财务审核流程 |
| 批量结算 | Phase 3 | 生成结算批次 |
| 结算批次管理 | Phase 3 | 批次查看/完成 |
| 财务对账 | Phase 3 | 对比应付/实付/异常 |
| 报表导出 CSV/Excel | Phase 3 | 所有数据支持导出 |
| 短信正式接口接入 | Phase 3 | 接入 SMS 服务商 |
| 地推员注册审核页 | Phase 3 | 管理端审核注册申请 |
| 操作日志完善 | Phase 3 | 所有财务操作留痕 |
| 多语言 i18n | Phase 3 | 预留国际化支持 |
| UI 优化 | Phase 3 | 响应式适配、动画优化 |

## MongoDB Collections

| 集合 | 用途 |
|------|------|
| admins | 管理员账号 |
| staff_users | 地推员（含 stats、vip_level、invite_code） |
| staff_relations | 裂变关系（staff_id, ancestor_id, level） |
| campaigns | 活动（name, status, start_time, end_time） |
| wheel_items | 转盘奖项（weight=概率%, type, redirect_url, image_url） |
| reward_codes | 奖励码池（code, status, campaign_id） |
| claims | 用户领取记录 |
| scan_logs | 扫码记录（欢迎页访问时写入） |
| otp_records | OTP 验证码（TTL 索引自动过期） |
| risk_logs | 风控拦截日志 |
| commission_logs | 佣金记录（status: pending→approved→paid） |
| team_rewards | 团队累计奖励 |
| vip_upgrade_logs | VIP 升级记录 |
| system_settings | 系统配置（key-value，含风控开关、佣金比例等） |
| finance_action_logs | 财务操作日志 |
| settlement_batches | 结算批次 |

## API 路由总览

```
POST /api/auth/admin/login          管理员登录
POST /api/auth/admin/password       管理员改密
POST /api/auth/staff/login          地推员登录
POST /api/auth/staff/register       地推员注册
POST /api/auth/staff/password       地推员改密

GET  /api/admin/dashboard/          Dashboard 统计
GET  /api/admin/staff/              地推员列表
POST /api/admin/staff/              创建地推员
GET  /api/admin/staff/{id}          地推员详情
PUT  /api/admin/staff/{id}          编辑地推员
PUT  /api/admin/staff/{id}/status   启用/禁用
PUT  /api/admin/staff/{id}/reset-password  重置密码

GET  /api/admin/campaigns/          活动列表
POST /api/admin/campaigns/          创建活动
GET  /api/admin/campaigns/{id}      活动详情
PUT  /api/admin/campaigns/{id}      编辑活动
PUT  /api/admin/campaigns/{id}/status  启用/暂停
DELETE /api/admin/campaigns/{id}    删除(仅草稿)
POST /api/admin/campaigns/{id}/bind-staff  绑定地推员
GET  /api/admin/campaigns/{id}/staff       活动下地推员列表

GET  /api/admin/wheel-items/        转盘奖项列表
POST /api/admin/wheel-items/        添加奖项
PUT  /api/admin/wheel-items/{id}    编辑奖项
DELETE /api/admin/wheel-items/{id}  删除奖项
PUT  /api/admin/wheel-items/{id}/toggle    启用/禁用
POST /api/admin/wheel-items/{id}/upload-image  上传奖项图片

GET  /api/admin/reward-codes/       奖励码列表
POST /api/admin/reward-codes/import CSV 导入奖励码
PUT  /api/admin/reward-codes/{id}/block   作废
PUT  /api/admin/reward-codes/{id}/unblock 恢复

GET  /api/admin/claims/             领取记录
GET  /api/admin/claims/{id}         记录详情

GET  /api/admin/risk-control/       风控设置
PUT  /api/admin/risk-control/       更新风控
GET  /api/admin/risk-control/logs   风控日志

GET  /api/admin/settings/           系统配置列表
PUT  /api/admin/settings/{key}      更新配置

GET  /api/admin/finance/overview    财务总览
GET  /api/admin/finance/staff-performance  地推员业绩
POST /api/admin/finance/manual-settle      手动结算
GET  /api/admin/finance/settlement-records 结算记录
GET  /api/admin/finance/logs        财务操作日志

GET  /api/claim/welcome/{code}      欢迎页(+扫码计数)
POST /api/claim/spin                转盘抽奖
POST /api/claim/verify-phone        手机号验证
POST /api/claim/verify-otp          OTP 校验
POST /api/claim/complete            确认领奖
GET  /api/claim/result/{id}         领奖结果

GET  /api/promoter/home             地推员首页数据
GET  /api/promoter/qrcode           专属二维码
GET  /api/promoter/team             我的团队
GET  /api/promoter/commission       我的佣金
GET  /api/promoter/settlement       结算记录

GET  /api/health                    健康检查
```

## 注意事项

- FastAPI 路由有 trailing slash 重定向问题，前端 API 调用统一加 `/`
- Google Fonts 被墙，字体用 `fonts.loli.net` 镜像，图标用 `lucide-react`
- 转盘概率是百分比制：每个奖设置 X%，剩余自动为「未中奖」
- OTP 有效期 10 分钟，由 MongoDB TTL 索引自动清理
- 图片上传到 `backend/uploads/`，通过 `/uploads/` 静态路由访问
- 绑定地推员是全量替换逻辑：先解绑该活动所有旧人员，再绑新选的
- Codex subagent 不能处理中文路径，需先 cp 到 ASCII 路径（如 C:/tmp/gr_audit）
