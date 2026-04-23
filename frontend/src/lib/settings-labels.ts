export type SettingMeta = {
  label: string;
  help?: string;
  unit?: string;
  type: "bool" | "number" | "string" | "seconds" | "minutes" | "percent";
};

export const SETTING_LABELS: Record<string, SettingMeta> = {
  risk_phone_unique: { label: "手机号唯一限制", help: "限制同一手机号仅能领取一次", type: "bool" },
  risk_ip_unique: { label: "IP 唯一限制", help: "限制同一 IP 仅能领取一次", type: "bool" },
  risk_device_unique: { label: "设备指纹唯一限制", help: "限制同一设备指纹仅能领取一次", type: "bool" },
  sms_verification: { label: "短信验证码验证", help: "领取流程是否启用短信验证码验证", type: "bool" },
  sms_real_send_enabled: { label: "真实短信发送开关", help: "开启后调用短信接口，关闭为演示模式", type: "bool" },
  sms_api_url: { label: "短信 API 地址", help: "短信网关请求地址", type: "string" },
  sms_appkey: { label: "短信 AppKey", help: "短信服务 AppKey", type: "string" },
  sms_appcode: { label: "短信 AppCode", help: "短信服务 AppCode", type: "string" },
  sms_appsecret: { label: "短信 AppSecret", help: "短信服务 AppSecret", type: "string" },
  sms_extend: { label: "短信扩展字段", help: "短信请求的扩展字段", type: "string" },
  sms_signature: { label: "短信签名", help: "短信签名名称", type: "string" },
  sms_otp_template: { label: "短信验证码模板", help: "短信验证码模板内容或编号", type: "string" },
  live_qr_enabled: { label: "动态二维码 + PIN 开关", help: "启用动态二维码与 PIN 验证流程", type: "bool" },
  live_pin_max_fails: { label: "PIN 最大错误次数", help: "令牌锁定前允许的 PIN 输错次数", type: "number" },
  live_qr_expires_sec: { label: "动态二维码有效期", help: "动态二维码与 PIN 的有效时长", unit: "秒", type: "seconds" },
  promo_session_expires_min: { label: "单次领取会话有效期（分钟）", help: "单次领取会话失效前保留的分钟数", unit: "分钟", type: "minutes" },
  commission_level1_default: { label: "一级佣金默认值", help: "默认一级佣金基数", type: "number" },
  commission_level2: { label: "二级佣金", help: "二级推广佣金值", type: "number" },
  commission_level3: { label: "三级佣金", help: "三级推广佣金值", type: "number" },
  commission_after_redeem: { label: "兑换后结算佣金", help: "开启后，奖励兑换成功后再结算佣金", type: "bool" },
  commission_vip1: { label: "VIP1 一级佣金", help: "VIP1 的一级佣金值", type: "number" },
  commission_vip2: { label: "VIP2 一级佣金", help: "VIP2 的一级佣金值", type: "number" },
  commission_vip3: { label: "VIP3 一级佣金", help: "VIP3 的一级佣金值", type: "number" },
  commission_svip: { label: "超级 VIP 一级佣金", help: "超级 VIP 的一级佣金值", type: "number" },
  default_currency: { label: "默认货币", help: "系统默认显示货币", type: "string" },
  vip_threshold_1: { label: "VIP1 升级门槛", help: "达到 VIP1 所需的门槛值", type: "number" },
  vip_threshold_2: { label: "VIP2 升级门槛", help: "达到 VIP2 所需的门槛值", type: "number" },
  vip_threshold_3: { label: "VIP3 升级门槛", help: "达到 VIP3 所需的门槛值", type: "number" },
  vip_threshold_svip: { label: "超级 VIP 升级门槛", help: "达到超级 VIP 所需的门槛值", type: "number" },
  team_reward_100_threshold: { label: "团队奖励 100 人门槛", help: "触发 100 人团队奖励所需门槛", type: "number" },
  team_reward_100: { label: "团队奖励 100 人金额", help: "达到 100 人团队奖励时发放金额", type: "number" },
  team_reward_1000_threshold: { label: "团队奖励 1000 人门槛", help: "触发 1000 人团队奖励所需门槛", type: "number" },
  team_reward_1000: { label: "团队奖励 1000 人金额", help: "达到 1000 人团队奖励时发放金额", type: "number" },
  team_reward_10000_threshold: { label: "团队奖励 10000 人门槛", help: "触发 10000 人团队奖励所需门槛", type: "number" },
  team_reward_10000: { label: "团队奖励 10000 人金额", help: "达到 10000 人团队奖励时发放金额", type: "number" },
  external_api_key: { label: "外部接口 API Key", help: "外部接口调用所需的 API Key", type: "string" },
  project_name: { label: "项目名称", help: "页头等位置显示的项目名称", type: "string" },
  activity_title: { label: "活动标题", help: "面向用户展示的活动标题", type: "string" },
  activity_desc: { label: "活动说明", help: "面向用户展示的活动说明", type: "string" },
  default_redirect_url: { label: "默认跳转地址", help: "未单独配置时奖励码使用的默认跳转地址", type: "string" },
  sms_cooldown_sec: { label: "短信验证码冷却时间", help: "同一手机号两次验证码请求的最短间隔", unit: "秒", type: "seconds" },
  phone_daily_limit: { label: "手机号 OTP 请求上限", help: "同一手机号在滚动窗口内的验证码请求上限", type: "number" },
  phone_per_flow_limit: { label: "单次领取流程短信发送上限", help: "单次领取流程内可发送的验证码次数上限", type: "number" },
  ip_daily_limit: { label: "IP OTP 请求上限", help: "单个 IP 在限流窗口内的验证码请求上限", type: "number" },
  ip_window_min: { label: "IP 限流窗口（分钟）", help: "IP 验证码限流的滚动窗口时长", unit: "分钟", type: "minutes" },
  customer_service_enabled: { label: "客服悬浮按钮开关", help: "是否在用户页面显示悬浮客服按钮", type: "bool" },
  staff_register_enabled: { label: "员工公开注册开关", help: "是否允许公开提交员工注册", type: "bool" },
  staff_register_captcha_enabled: { label: "员工注册验证码开关", help: "员工注册时是否启用算术验证码", type: "bool" },
  customer_service_whatsapp: { label: "客服 WhatsApp 链接", help: "客服 WhatsApp 联系链接或号码", type: "string" },
  customer_service_telegram: { label: "客服 Telegram 链接", help: "客服 Telegram 联系链接", type: "string" },
  must_start_work_before_qr: { label: "生成动态二维码前必须开工", help: "开启后需先开工才能生成动态二维码", type: "bool" },
  allow_static_link: { label: "允许静态欢迎链接", help: "关闭后仅允许签名链接流程访问欢迎页", type: "bool" },
  ip_rate_limit_enabled: { label: "IP 限流总开关", help: "是否启用基于 IP 的验证码与领取限流", type: "bool" },
  commission_per_valid_claim: { label: "单个有效领取结算单价", help: "每个有效领取的结算单价", type: "number" },
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

export function getSettingLabel(key: string): string {
  return SETTING_LABELS[key]?.label ?? key;
}

export function getSettingHelp(key: string, fallback?: string): string {
  return SETTING_LABELS[key]?.help ?? fallback ?? "";
}

export function getSettingUnit(key: string): string {
  return SETTING_LABELS[key]?.unit ?? "";
}

export function getGroupLabel(group: string): string {
  return SETTING_GROUP_LABELS[group] ?? group;
}
