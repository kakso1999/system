import api from "@/lib/api";
import type { PageResponse, Staff } from "@/types";
import {
  pageSize,
  type ManualCommissionFormValues,
  type ManualCommissionRecord,
  type StaffLite,
} from "./manual-commission-shared";

function toStaffLite(staff: Staff): StaffLite {
  return { id: staff.id, name: staff.name, staff_no: staff.staff_no, phone: staff.phone };
}

export async function fetchRecentManualCommissions() {
  const res = await api.get<PageResponse<ManualCommissionRecord>>("/api/admin/finance/commissions", {
    params: { type: "manual", page: 1, page_size: pageSize },
  });
  return res.data.items || [];
}

export async function searchStaff(keyword: string) {
  const res = await api.get<PageResponse<Staff>>("/api/admin/staff/", {
    params: { page: 1, page_size: 8, search: keyword },
  });
  return (res.data.items || []).map(toStaffLite);
}

export async function fetchStaffMap(
  records: ManualCommissionRecord[],
  currentMap: Record<string, StaffLite>,
) {
  const ids = Array.from(new Set(records.flatMap((item) => [item.beneficiary_staff_id, item.source_staff_id || ""])));
  const missingIds = ids.filter((id) => id && !currentMap[id]);
  if (!missingIds.length) return currentMap;
  const results = await Promise.allSettled(missingIds.map((id) => api.get<Staff>(`/api/admin/staff/${id}`)));
  return results.reduce<Record<string, StaffLite>>((next, result, index) => {
    if (result.status === "fulfilled") next[missingIds[index]] = toStaffLite(result.value.data);
    return next;
  }, { ...currentMap });
}

export async function createManualCommission(beneficiary: StaffLite, form: ManualCommissionFormValues) {
  await api.post("/api/admin/commissions/manual", {
    beneficiary_staff_id: beneficiary.id,
    amount: Number(form.amount),
    level: Number(form.level),
    remark: form.remark.trim(),
    claim_id: form.claim_id.trim() || undefined,
    source_staff_id: form.source_staff_id.trim() || undefined,
    campaign_id: form.campaign_id.trim() || undefined,
  });
}

export async function adjustManualCommission(recordId: string, amount: string, remark: string) {
  await api.post(`/api/admin/commissions/${recordId}/adjust`, {
    new_amount: Number(amount),
    remark: remark.trim(),
  });
}

export async function cancelManualCommission(recordId: string, remark: string) {
  await api.post(`/api/admin/commissions/${recordId}/cancel`, { remark: remark.trim() });
}
