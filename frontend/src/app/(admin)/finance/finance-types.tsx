import type { CommissionLog, Staff } from "@/types";

export type TabKey = "staff" | "commissions";

export interface FinanceOverview {
  total_commission: number;
  pending: number;
  approved: number;
  paid: number;
  frozen: number;
}

export interface StaffPerformance extends Staff {
  pending_amount?: number;
  paid_amount?: number;
}

export interface AdminCommissionRecord extends CommissionLog {
  staff_name?: string;
  staff_no?: string;
  source_staff_name?: string;
}

export function toPoints(value: number) {
  return `${Number(value || 0).toFixed(2)}P`;
}

export function vipLabel(level: number) {
  const labels = ["普通", "VIP1", "VIP2", "VIP3", "超级VIP"];
  return labels[level] || `VIP${level}`;
}

export function statusBadge(status: string) {
  const styles: Record<string, string> = {
    pending: "bg-yellow-100 text-yellow-700",
    approved: "bg-green-100 text-green-700",
    paid: "bg-green-100 text-green-700",
    rejected: "bg-red-100 text-red-700",
    frozen: "bg-red-100 text-red-700",
  };
  const labels: Record<string, string> = {
    pending: "待审核",
    approved: "已审核",
    paid: "已打款",
    rejected: "已拒绝",
    frozen: "已冻结",
  };
  return (
    <span className={`rounded-full px-2 py-1 text-xs font-bold ${styles[status] || "bg-slate-100 text-slate-700"}`}>
      {labels[status] || status}
    </span>
  );
}
