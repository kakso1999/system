"use client";

import { useEffect, useState, useCallback } from "react";
import api from "@/lib/api";
import type { Staff, PageResponse } from "@/types";

export default function FinancePage() {
  const [staffList, setStaffList] = useState<(Staff & { pending_amount?: number; paid_amount?: number })[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(true);
  const [settleModal, setSettleModal] = useState<{ staff: Staff } | null>(null);
  const [settleAmount, setSettleAmount] = useState("");
  const [settleRemark, setSettleRemark] = useState("");
  const [settling, setSettling] = useState(false);

  const loadStaffPerformance = useCallback(async () => {
    setLoading(true);
    try {
      const res = await api.get<PageResponse<Staff>>("/api/admin/finance/staff-performance", { params: { page, page_size: 20 } });
      setStaffList(res.data.items);
      setTotal(res.data.total);
    } catch {
      setStaffList([]);
    } finally {
      setLoading(false);
    }
  }, [page]);

  useEffect(() => { loadStaffPerformance(); }, [loadStaffPerformance]);

  const handleSettle = async () => {
    if (!settleModal || !settleAmount) return;
    setSettling(true);
    try {
      await api.post("/api/admin/finance/manual-settle", {
        staff_id: settleModal.staff.id,
        amount: parseFloat(settleAmount),
        remark: settleRemark,
      });
      setSettleModal(null);
      setSettleAmount("");
      setSettleRemark("");
      loadStaffPerformance();
    } catch (err: unknown) {
      const axiosErr = err as { response?: { data?: { detail?: string } } };
      alert(axiosErr.response?.data?.detail || "Settlement failed");
    } finally {
      setSettling(false);
    }
  };

  const totalPages = Math.ceil(total / 20);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-extrabold font-[var(--font-headline)] tracking-tight">财务结算</h1>
        <p className="text-on-surface-variant mt-1">按地推员业绩手动结算</p>
      </div>

      <div className="bg-surface-container-lowest rounded-xl shadow-sm overflow-x-auto">
        <table className="w-full text-sm min-w-[700px]">
          <thead>
            <tr className="border-b border-surface-container-high">
              {["编号", "姓名", "VIP", "有效量", "总佣金", "已结算", "待结算", "操作"].map((h) => (
                <th key={h} className="text-left px-6 py-4 font-bold text-on-surface-variant text-xs uppercase tracking-wider">{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr><td colSpan={8} className="px-6 py-8 text-center text-on-surface-variant">加载中...</td></tr>
            ) : staffList.length === 0 ? (
              <tr><td colSpan={8} className="px-6 py-8 text-center text-on-surface-variant">暂无数据</td></tr>
            ) : (
              staffList.map((s) => (
                <tr key={s.id} className="border-b border-surface-container-high/50 hover:bg-surface-container-low/50 transition-colors">
                  <td className="px-6 py-4 font-mono text-xs">{s.staff_no}</td>
                  <td className="px-6 py-4 font-semibold">{s.name}</td>
                  <td className="px-6 py-4 text-primary font-bold text-xs">{["普通", "VIP1", "VIP2", "VIP3", "SVIP"][s.vip_level]}</td>
                  <td className="px-6 py-4 font-bold">{s.stats?.total_valid ?? 0}</td>
                  <td className="px-6 py-4 font-bold text-secondary">{(s.stats?.total_commission ?? 0).toFixed(2)}</td>
                  <td className="px-6 py-4 text-green-600 font-bold">{((s as Record<string, unknown>).paid_amount as number ?? 0).toFixed(2)}</td>
                  <td className="px-6 py-4 text-primary font-bold">{((s as Record<string, unknown>).pending_amount as number ?? 0).toFixed(2)}</td>
                  <td className="px-6 py-4">
                    <button onClick={() => setSettleModal({ staff: s })}
                      className="bg-primary/10 text-primary px-4 py-2 rounded-lg text-xs font-bold hover:bg-primary hover:text-white transition-all"
                    >结算</button>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {totalPages > 1 && (
        <div className="flex items-center justify-center gap-2">
          <button onClick={() => setPage(Math.max(1, page - 1))} disabled={page === 1}
            className="px-4 py-2 rounded-lg text-sm font-semibold text-on-surface-variant hover:bg-surface-container-low disabled:opacity-40">上一页</button>
          <span className="text-sm text-on-surface-variant px-4">{page} / {totalPages}</span>
          <button onClick={() => setPage(Math.min(totalPages, page + 1))} disabled={page === totalPages}
            className="px-4 py-2 rounded-lg text-sm font-semibold text-on-surface-variant hover:bg-surface-container-low disabled:opacity-40">下一页</button>
        </div>
      )}

      {/* Settlement Modal */}
      {settleModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-inverse-surface/40 backdrop-blur-sm">
          <div className="bg-surface-container-lowest rounded-2xl p-8 w-full max-w-md shadow-2xl">
            <h2 className="text-xl font-extrabold font-[var(--font-headline)] mb-2">手动结算</h2>
            <p className="text-on-surface-variant text-sm mb-6">
              地推员: {settleModal.staff.name} ({settleModal.staff.staff_no})
            </p>
            <div className="space-y-4">
              <div>
                <label className="text-sm font-bold text-on-surface-variant block mb-1">结算金额 (PHP)</label>
                <input type="number" step="0.01" value={settleAmount}
                  onChange={(e) => setSettleAmount(e.target.value)}
                  className="w-full bg-surface-container-low border-none rounded-xl py-3 px-4 text-sm focus:ring-2 focus:ring-primary/40" required />
              </div>
              <div>
                <label className="text-sm font-bold text-on-surface-variant block mb-1">备注</label>
                <input type="text" value={settleRemark}
                  onChange={(e) => setSettleRemark(e.target.value)}
                  className="w-full bg-surface-container-low border-none rounded-xl py-3 px-4 text-sm focus:ring-2 focus:ring-primary/40" />
              </div>
              <div className="flex gap-3 pt-4">
                <button onClick={() => setSettleModal(null)}
                  className="flex-1 py-3 rounded-full border border-outline-variant text-on-surface-variant font-bold text-sm">取消</button>
                <button onClick={handleSettle} disabled={settling}
                  className="flex-1 bg-primary text-on-primary py-3 rounded-full font-bold text-sm shadow-md disabled:opacity-60">
                  {settling ? "处理中..." : "确认结算"}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
