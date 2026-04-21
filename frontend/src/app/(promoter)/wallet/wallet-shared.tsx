import { CircleHelp, Coins, Landmark, Smartphone } from "lucide-react";
import type { PayoutAccount } from "@/types";

export interface SettlementRecord {
  id: string;
  amount: number;
  currency?: string;
  status: string;
  created_at: string;
}

export interface WithdrawalBalanceSummary {
  total_approved: number;
  total_withdrawn: number;
  available: number;
  pending_withdrawals: number;
}

export type AccountForm = {
  type: PayoutAccount["type"];
  account_name: string;
  account_number: string;
  bank_name: string;
};

export const USDT_NETWORKS = ["TRC20", "ERC20", "BEP20", "Polygon"] as const;
export type UsdtNetwork = typeof USDT_NETWORKS[number];

export const emptyForm: AccountForm = {
  type: "gcash",
  account_name: "",
  account_number: "",
  bank_name: "",
};

export const accountTypeLabels: Record<PayoutAccount["type"], string> = {
  gcash: "GCash",
  maya: "Maya",
  bank: "Bank",
  usdt: "USDT",
  other: "Other",
};

export function toPoints(value: number) {
  return `${value.toFixed(2)}P`;
}

export function maskNumber(value: string) {
  if (value.length <= 4) return value;
  return `${"*".repeat(Math.max(0, value.length - 4))}${value.slice(-4)}`;
}

export function accountIcon(type: PayoutAccount["type"]) {
  if (type === "bank") return Landmark;
  if (type === "usdt") return Coins;
  if (type === "other") return CircleHelp;
  return Smartphone;
}

export function statusBadge(status: string) {
  const styles: Record<string, string> = {
    pending: "bg-yellow-100 text-yellow-700",
    approved: "bg-blue-100 text-blue-700",
    paid: "bg-green-100 text-green-700",
    rejected: "bg-red-100 text-red-700",
    frozen: "bg-red-100 text-red-700",
  };
  const labels: Record<string, string> = {
    pending: "Pending",
    approved: "Approved",
    paid: "Paid",
    rejected: "Rejected",
    frozen: "Frozen",
  };
  return (
    <span className={`rounded-full px-2 py-1 text-xs font-bold ${styles[status] || "bg-slate-100 text-slate-700"}`}>
      {labels[status] || status}
    </span>
  );
}
