import type { CommissionLog, Staff } from "@/types";

export type StaffLite = Pick<Staff, "id" | "name" | "staff_no" | "phone">;

export interface ManualCommissionRecord extends CommissionLog {
  remark?: string;
  claim_id?: string | null;
  campaign_id?: string | null;
  source_staff_id?: string | null;
  cancel_reason?: string | null;
}

export interface ManualCommissionFormValues {
  level: string;
  amount: string;
  remark: string;
  claim_id: string;
  source_staff_id: string;
  campaign_id: string;
}

export type AdjustModalState = { record: ManualCommissionRecord; amount: string; remark: string } | null;
export type CancelModalState = { record: ManualCommissionRecord; remark: string } | null;

export const pageSize = 10;

export const emptyForm: ManualCommissionFormValues = {
  level: "0",
  amount: "",
  remark: "",
  claim_id: "",
  source_staff_id: "",
  campaign_id: "",
};

export function getErrorDetail(error: unknown) {
  const response = error as { response?: { data?: { detail?: string; message?: string } } };
  return response.response?.data?.detail || response.response?.data?.message || "操作失败";
}

export function formatMoney(value: number) {
  return `PHP ${Number(value || 0).toFixed(2)}`;
}

export function formatTime(value?: string) {
  return value ? new Date(value).toLocaleString() : "-";
}

export function staffLabel(staff?: StaffLite | null) {
  return staff ? `${staff.name} / ${staff.staff_no} / ${staff.phone}` : "";
}

export function getStatusMeta(status: string) {
  const styles: Record<string, string> = {
    pending: "bg-amber-100 text-amber-700",
    approved: "bg-blue-100 text-blue-700",
    pending_redeem: "bg-violet-100 text-violet-700",
    cancelled: "bg-slate-200 text-slate-700",
    paid: "bg-emerald-100 text-emerald-700",
  };
  const labels: Record<string, string> = {
    pending: "待审核",
    approved: "已审核",
    pending_redeem: "待核销",
    cancelled: "已取消",
    paid: "已打款",
  };
  return {
    className: styles[status] || "bg-slate-100 text-slate-700",
    label: labels[status] || status,
  };
}
