"use client";

import { useCallback, useEffect, useState } from "react";
import api from "@/lib/api";
import type { Campaign, PageResponse } from "@/types";
import type { StaffPerformance } from "./finance-types";
import { toPoints } from "./finance-types";

const pageSize = 20;

type ModalState = {
  staff: StaffPerformance;
  campaignId: string;
  includeBonus: boolean;
} | null;

function getErrorDetail(error: unknown) {
  const response = error as { response?: { data?: { detail?: string; message?: string } } };
  return response.response?.data?.detail || response.response?.data?.message || "";
}

export default function CombinedSettleTab() {
  const [staffList, setStaffList] = useState<StaffPerformance[]>([]);
  const [campaigns, setCampaigns] = useState<Campaign[]>([]);
  const [page, setPage] = useState(1);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [modal, setModal] = useState<ModalState>(null);

  const loadStaff = useCallback(async () => {
    setLoading(true);
    try {
      const res = await api.get<PageResponse<StaffPerformance>>("/api/admin/finance/staff-performance", {
        params: { page, page_size: pageSize },
      });
      setStaffList(res.data.items || []);
      setTotal(res.data.total || 0);
    } catch {
      setStaffList([]);
      setTotal(0);
    } finally {
      setLoading(false);
    }
  }, [page]);

  const loadCampaigns = useCallback(async () => {
    try {
      const res = await api.get<PageResponse<Campaign>>("/api/admin/campaigns/", {
        params: { page: 1, page_size: 100 },
      });
      setCampaigns(res.data.items || []);
    } catch {
      setCampaigns([]);
    }
  }, []);

  useEffect(() => {
    void loadStaff();
  }, [loadStaff]);

  useEffect(() => {
    void loadCampaigns();
  }, [loadCampaigns]);

  const openModal = (staff: StaffPerformance) => {
    setModal({
      staff,
      campaignId: staff.campaign_id || "",
      includeBonus: true,
    });
  };

  const submit = async () => {
    if (!modal) return;
    setSubmitting(true);
    try {
      const res = await api.post<{ message: string }>("/api/admin/finance/combined-settle", {
        staff_id: modal.staff.id,
        campaign_id: modal.campaignId || null,
        include_bonus: modal.includeBonus,
      });
      setModal(null);
      await loadStaff();
      alert(res.data.message || "结算成功");
    } catch (error) {
      alert(getErrorDetail(error) || "结算失败");
    } finally {
      setSubmitting(false);
    }
  };

  const totalPages = Math.max(1, Math.ceil(total / pageSize));

  return (
    <section className="space-y-4">
      <div className="overflow-x-auto rounded-xl bg-surface-container-lowest shadow-sm">
        <table className="w-full min-w-[760px] text-sm">
          <thead>
            <tr className="border-b border-surface-container-high">
              {["地推员", "待结算佣金 (PHP)", "待结算 bonus", "操作"].map((header) => (
                <th key={header} className="px-6 py-4 text-left text-xs font-bold uppercase tracking-wider text-on-surface-variant">{header}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {loading ? <tr><td colSpan={4} className="px-6 py-8 text-center text-on-surface-variant">加载中...</td></tr> : null}
            {!loading && staffList.length === 0 ? <tr><td colSpan={4} className="px-6 py-8 text-center text-on-surface-variant">暂无数据</td></tr> : null}
            {!loading && staffList.map((staff) => (
              <tr key={staff.id} className="border-b border-surface-container-high/60 hover:bg-surface-container-low/40">
                <td className="px-6 py-4">
                  <div className="font-semibold">{staff.name}</div>
                  <div className="font-mono text-xs text-on-surface-variant">{staff.staff_no}</div>
                </td>
                <td className="px-6 py-4 font-bold text-primary">{toPoints(staff.pending_amount ?? 0)}</td>
                <td className="px-6 py-4 text-on-surface-variant">—</td>
                <td className="px-6 py-4">
                  <button
                    onClick={() => openModal(staff)}
                    className="rounded-full bg-primary px-4 py-2 text-xs font-bold text-on-primary"
                  >
                    结算
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="flex items-center justify-center gap-2">
        <button
          onClick={() => setPage((current) => Math.max(1, current - 1))}
          disabled={page === 1}
          className="rounded-lg px-4 py-2 text-sm font-semibold text-on-surface-variant hover:bg-surface-container-low disabled:opacity-40"
        >
          上一页
        </button>
        <span className="px-4 text-sm text-on-surface-variant">{page} / {totalPages}</span>
        <button
          onClick={() => setPage((current) => Math.min(totalPages, current + 1))}
          disabled={page === totalPages}
          className="rounded-lg px-4 py-2 text-sm font-semibold text-on-surface-variant hover:bg-surface-container-low disabled:opacity-40"
        >
          下一页
        </button>
      </div>

      {modal ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className="w-full max-w-md space-y-4 rounded-2xl bg-surface-container-lowest p-6 shadow-xl">
            <div>
              <h2 className="text-xl font-extrabold font-[var(--font-headline)]">合并结算确认</h2>
              <p className="mt-1 text-sm text-on-surface-variant">
                {modal.staff.name} · {modal.staff.staff_no}
              </p>
            </div>

            <div className="rounded-xl bg-surface-container-low p-4 text-sm">
              <p className="text-on-surface-variant">待结算佣金</p>
              <p className="mt-1 text-lg font-bold text-primary">{toPoints(modal.staff.pending_amount ?? 0)}</p>
            </div>

            <label className="flex items-center gap-3 text-sm font-semibold">
              <input
                type="checkbox"
                checked={modal.includeBonus}
                onChange={(event) => setModal((current) => (
                  current ? { ...current, includeBonus: event.target.checked } : current
                ))}
              />
              包含 bonus 奖励
            </label>

            <label className="block space-y-2 text-sm">
              <span className="font-semibold">活动范围</span>
              <select
                value={modal.campaignId}
                onChange={(event) => setModal((current) => (
                  current ? { ...current, campaignId: event.target.value } : current
                ))}
                className="w-full rounded-xl border-none bg-surface-container-low px-4 py-3 focus:ring-2 focus:ring-primary/40"
              >
                <option value="">全部活动</option>
                {campaigns.map((campaign) => (
                  <option key={campaign.id} value={campaign.id}>{campaign.name}</option>
                ))}
              </select>
            </label>

            <div className="flex justify-end gap-3">
              <button
                onClick={() => setModal(null)}
                disabled={submitting}
                className="rounded-xl px-4 py-2 text-sm font-bold text-on-surface-variant hover:bg-surface-container-low disabled:opacity-50"
              >
                取消
              </button>
              <button
                onClick={submit}
                disabled={submitting}
                className="rounded-xl bg-primary px-4 py-2 text-sm font-bold text-on-primary disabled:opacity-50"
              >
                {submitting ? "提交中..." : "确认结算"}
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </section>
  );
}
