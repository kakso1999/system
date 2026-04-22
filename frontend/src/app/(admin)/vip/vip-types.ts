export type VipTab = "rules" | "members" | "logs";

export interface VipRulesResponse {
  thresholds: { vip1: number; vip2: number; vip3: number; svip: number };
  level1_rates: { default: number; vip1: number; vip2: number; vip3: number; svip: number };
  level2_rate: number;
  level3_rate: number;
}

export interface VipMember {
  id: string;
  staff_no: string;
  name: string;
  phone: string;
  vip_level: number;
  total_valid: number;
  total_commission: number;
  updated_at: string | null;
}

export interface VipUpgradeLogRecord {
  id: string;
  staff_id: string;
  staff_name: string;
  from_level: number;
  to_level: number;
  reason: string;
  created_at: string | null;
}

export const VIP_LEVEL_OPTIONS = [0, 1, 2, 3, 4];

export function vipLabel(level: number) {
  const labels = ["普通", "VIP1", "VIP2", "VIP3", "超级VIP"];
  return labels[level] || `VIP${level}`;
}

export function vipBadgeClass(level: number) {
  const styles = ["bg-slate-100 text-slate-700", "bg-blue-100 text-blue-700", "bg-violet-100 text-violet-700", "bg-amber-100 text-amber-700", "bg-rose-100 text-rose-700"];
  return styles[level] || styles[0];
}
