import type { BonusTier, StaffOption } from "./bonus-types";

export function toNumber(value: unknown, fallback = 0) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

export function toPoints(value: unknown) {
  return `${toNumber(value).toFixed(2)}P`;
}

export function formatDateTime(value: string | null | undefined) {
  if (!value) return "-";
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? "-" : date.toLocaleString();
}

export function formatRuleTiers(tiers: BonusTier[]) {
  if (tiers.length === 0) return "-";
  return [...tiers]
    .sort((a, b) => a.threshold - b.threshold)
    .map((tier) => `${tier.threshold}/${toPoints(tier.amount)}`)
    .join(" · ");
}

export function sortedTiers(tiers: BonusTier[]) {
  return [...tiers].sort((a, b) => a.threshold - b.threshold);
}

export function getErrorDetail(error: unknown) {
  const axiosErr = error as { response?: { status?: number; data?: { detail?: unknown } } };
  const detail = axiosErr.response?.data?.detail;
  return typeof detail === "string" ? detail : undefined;
}

export function buildStaffMap(staff: StaffOption[]) {
  return new Map(staff.map((item) => [item.id, item]));
}

export function getStaffLabel(staffId: string | undefined, staffMap: Map<string, StaffOption>) {
  if (!staffId) return { name: "-", no: "" };
  const staff = staffMap.get(staffId);
  if (staff) return { name: staff.name, no: staff.staff_no };
  return { name: `ID ${staffId.slice(-6)}`, no: "" };
}
