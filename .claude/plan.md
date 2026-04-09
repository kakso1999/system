# Phase 2 实现计划：佣金/VIP/团队奖励

## 实现顺序（6步，每步完成后可测试）

---

### Step 1: 数据基础（种子数据 + 索引 + 类型）

**后端改动：**
- `main.py` seed_settings 新增：
  - `vip_threshold_1`: 10, `vip_threshold_2`: 100, `vip_threshold_3`: 1000, `vip_threshold_svip`: 10000
  - `team_reward_100`: 300, `team_reward_1000`: 500, `team_reward_10000`: 1000
  - `team_reward_100_threshold`: 100, `team_reward_1000_threshold`: 1000, `team_reward_10000_threshold`: 10000
- `database.py` 新增索引：
  - `team_rewards`: `(staff_id, milestone)` unique
  - `vip_upgrade_logs`: `staff_id`
  - `staff_payout_accounts`: `staff_id`, `(staff_id, is_default)`
  - `commission_logs`: `(claim_id, beneficiary_staff_id)` unique（防重复佣金）, `created_at`

**前端改动：**
- `types/index.ts` 新增 `VipUpgradeLog`, `TeamReward`, `PayoutAccount` 类型
- `CommissionLog` 增加 `type`, `rate` 字段

---

### Step 2: 佣金自动计算（核心）

**新建 `backend/app/services/commission.py`：**

```python
async def calculate_commissions(db, staff, claim_id, campaign_id):
    """用户有效领取后，自动生成三级佣金"""
    # 1. 查 system_settings 获取佣金费率
    # 2. 一级佣金：直接给 staff，金额按 staff.vip_level 对应费率
    # 3. 查 staff_relations 找 level=1 的 ancestor → 二级佣金 0.3P
    # 4. 查 staff_relations 找 level=2 的 ancestor → 三级佣金 0.1P
    # 5. 每条插入 commission_logs，status=pending
    # 6. 更新各受益人的 stats.total_commission
    # 7. 用 claim_id + beneficiary_staff_id 唯一索引防重复
```

**修改 `user_flow.py` complete 端点：**
- 在 `claims.insert_one` 成功后调用 `calculate_commissions()`
- 使用 FastAPI `BackgroundTasks` 异步执行，不阻塞响应

**佣金计算逻辑详解：**
```
用户扫码领奖 → claim 成功
  ├─ 地推员 A（直接推广人）→ 一级佣金 = VIP等级对应费率（1P/1.2P/1.5P/1.6P/2P）
  ├─ A 的上级 B（level=1 ancestor）→ 二级佣金 = 0.3P
  └─ B 的上级 C（level=2 ancestor）→ 三级佣金 = 0.1P
```

---

### Step 3: VIP 自动升级

**新建 `backend/app/services/vip.py`：**

```python
async def check_vip_upgrade(db, staff):
    """检查地推员是否达到 VIP 升级门槛"""
    # 1. 读取 system_settings 中的 vip_threshold_*
    # 2. 比较 staff.stats.total_valid 与各门槛
    # 3. 如果当前 vip_level < 应达等级：
    #    - 更新 staff_users.vip_level
    #    - 插入 vip_upgrade_logs（from_level, to_level, trigger=auto）
```

**VIP 等级对照：**
| total_valid | VIP 等级 | 一级佣金 |
|-------------|----------|----------|
| < 10        | 普通(0)  | 1.0P     |
| ≥ 10        | VIP1(1)  | 1.2P     |
| ≥ 100       | VIP2(2)  | 1.5P     |
| ≥ 1000      | VIP3(3)  | 1.6P     |
| ≥ 10000     | SVIP(4)  | 2.0P     |

**调用位置：** `user_flow.py` complete 端点，在佣金计算之前（先升级 VIP 再按新等级算佣金）

---

### Step 4: 团队累计奖励

**新建 `backend/app/services/team_reward.py`：**

```python
async def check_team_rewards(db, staff):
    """检查团队累计有效量是否达到奖励门槛"""
    # 1. 计算团队总有效量（staff 本人 + 所有下级的 total_valid）
    # 2. 读取门槛配置（100/1000/10000）
    # 3. 对每个达到的门槛，检查 team_rewards 是否已发放
    # 4. 未发放的插入 team_rewards 并创建 commission_logs（type=team_reward）
    # 5. 更新 staff.stats.total_commission
```

**团队有效量计算方式：**
- 通过 `staff_relations` 找到所有下级（ancestor_id = staff._id）
- 汇总所有下级的 `stats.total_valid` + staff 自己的

---

### Step 5: 收款账户 + 地推员前台页面

**后端新增端点（promoter.py 或新文件）：**
- `GET /api/promoter/payout-accounts` — 我的收款账户列表
- `POST /api/promoter/payout-accounts` — 添加收款账户
- `PUT /api/promoter/payout-accounts/{id}` — 编辑
- `DELETE /api/promoter/payout-accounts/{id}` — 删除
- `PUT /api/promoter/payout-accounts/{id}/default` — 设为默认
- `GET /api/promoter/vip-progress` — VIP 进度（当前等级、下一等级、差多少）
- `GET /api/promoter/team-rewards` — 团队奖励记录

**前端新页面（(promoter) 路由组）：**
1. `/team` — 我的团队（一二三级 tab 切换，成员列表）
2. `/commission` — 佣金明细（按层级筛选，列表+合计）
3. `/wallet` — 我的钱包（收款账户管理 + 结算记录）

**升级 promoter layout.tsx：**
- 添加共享底部导航栏（Home / QR / Team / Wallet）
- 添加认证守卫

**升级 qrcode/page.tsx：**
- 使用 `qrcode.react` 生成真实二维码（已安装）

---

### Step 6: 管理后台增强

**升级 admin finance 页面：**
- 顶部统计卡片（总佣金/待审核/待结算/已结算）
- 佣金审核功能（pending → approved / rejected）
- VIP 成员列表查看
- 团队奖励发放记录

**升级 admin dashboard：**
- 增加 VIP 分布统计
- 增加待审核佣金数量
- 增加今日佣金总额

---

## 文件改动清单

| 文件 | 操作 | 说明 |
|------|------|------|
| `backend/app/services/commission.py` | 新建 | 佣金自动计算 |
| `backend/app/services/vip.py` | 新建 | VIP 自动升级 |
| `backend/app/services/team_reward.py` | 新建 | 团队奖励 |
| `backend/app/routers/user_flow.py` | 修改 | complete 后触发佣金/VIP/团队 |
| `backend/app/routers/promoter.py` | 修改 | 增加收款账户/VIP/团队奖励端点 |
| `backend/app/routers/finance.py` | 修改 | 增加审核端点 |
| `backend/app/main.py` | 修改 | 新增种子设置 |
| `backend/app/database.py` | 修改 | 新增索引 |
| `frontend/src/types/index.ts` | 修改 | 新增类型 |
| `frontend/src/app/(promoter)/layout.tsx` | 重写 | 共享导航+认证 |
| `frontend/src/app/(promoter)/team/page.tsx` | 新建 | 团队页面 |
| `frontend/src/app/(promoter)/commission/page.tsx` | 新建 | 佣金页面 |
| `frontend/src/app/(promoter)/wallet/page.tsx` | 新建 | 钱包页面 |
| `frontend/src/app/(promoter)/home/page.tsx` | 修改 | 移除重复导航 |
| `frontend/src/app/(promoter)/qrcode/page.tsx` | 修改 | 真实二维码 |
| `frontend/src/app/(admin)/finance/page.tsx` | 修改 | 增强统计+审核 |
