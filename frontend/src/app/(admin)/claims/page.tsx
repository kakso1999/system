"use client";

import { useEffect, useState, useCallback } from "react";
import api from "@/lib/api";
import type { Claim, PageResponse, SettlementStatus } from "@/types";

const settlementOptions: { value: SettlementStatus | ""; label: string }[] = [
  { value: "", label: "全部结算" },
  { value: "pending_redeem", label: "待核销" },
  { value: "unpaid", label: "未结算" },
  { value: "paid", label: "已结算" },
  { value: "cancelled", label: "已取消" },
  { value: "frozen", label: "已冻结" },
];

const settlementLabels: Record<SettlementStatus, string> = {
  pending_redeem: "待核销",
  unpaid: "未结算",
  paid: "已结算",
  cancelled: "已取消",
  frozen: "已冻结",
};

const settlementStyles: Record<SettlementStatus, string> = {
  pending_redeem: "bg-orange-100 text-orange-700",
  unpaid: "bg-blue-100 text-blue-700",
  paid: "bg-green-100 text-green-700",
  cancelled: "bg-gray-100 text-gray-700",
  frozen: "bg-purple-100 text-purple-700",
};

function settlementBadge(status?: SettlementStatus) {
  if (!status) return <span className="text-on-surface-variant">—</span>;
  return (
    <span className={`px-2 py-1 rounded-full text-xs font-bold ${settlementStyles[status]}`}>
      {settlementLabels[status]}
    </span>
  );
}

function errorDetail(error: unknown, fallback: string) {
  const axiosError = error as { response?: { data?: { detail?: string } } };
  return axiosError.response?.data?.detail || fallback;
}

export default function ClaimsPage() {
  const [claims, setClaims] = useState<Claim[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [phoneFilter, setPhoneFilter] = useState("");
  const [statusFilter, setStatusFilter] = useState("");
  const [settlementFilter, setSettlementFilter] = useState<SettlementStatus | "">("");
  const [ipFilter, setIpFilter] = useState("");
  const [deviceFilter, setDeviceFilter] = useState("");
  const [prizeTypeFilter, setPrizeTypeFilter] = useState("");
  const [loading, setLoading] = useState(true);
  const [cancelModal, setCancelModal] = useState<Claim | null>(null);
  const [cancelReason, setCancelReason] = useState("");
  const [actioningClaimId, setActioningClaimId] = useState("");

  const loadClaims = useCallback(async () => {
    setLoading(true);
    try {
      const params: Record<string, string | number> = { page, page_size: 20 };
      if (phoneFilter) params.phone = phoneFilter;
      if (statusFilter) params.status = statusFilter;
      if (settlementFilter) params.settlement_status = settlementFilter;
      if (ipFilter) params.ip = ipFilter;
      if (deviceFilter) params.device_fingerprint = deviceFilter;
      if (prizeTypeFilter) params.prize_type = prizeTypeFilter;
      const res = await api.get<PageResponse<Claim>>("/api/admin/claims/", { params });
      setClaims(res.data.items);
      setTotal(res.data.total);
    } catch {
      setClaims([]);
    } finally {
      setLoading(false);
    }
  }, [page, phoneFilter, statusFilter, settlementFilter, ipFilter, deviceFilter, prizeTypeFilter]);

  useEffect(() => { loadClaims(); }, [loadClaims]);

  const totalPages = Math.ceil(total / 20);

  const statusBadge = (status: string) => {
    const styles: Record<string, string> = {
      success: "bg-green-100 text-green-700",
      failed: "bg-red-100 text-red-700",
      blocked: "bg-yellow-100 text-yellow-700",
    };
    return (
      <span className={`px-2 py-1 rounded-full text-xs font-bold ${styles[status] || "bg-gray-100"}`}>
        {status}
      </span>
    );
  };

  const resetFilters = () => {
    setPhoneFilter(""); setStatusFilter(""); setSettlementFilter(""); setIpFilter("");
    setDeviceFilter(""); setPrizeTypeFilter(""); setPage(1);
  };

  const hasFilters = phoneFilter || statusFilter || settlementFilter || ipFilter || deviceFilter || prizeTypeFilter;

  const submitCancel = async () => {
    if (!cancelModal || !cancelReason.trim()) return;
    setActioningClaimId(cancelModal.id);
    try {
      await api.post<Claim>(`/api/admin/claims/${cancelModal.id}/cancel`, { reason: cancelReason.trim() });
      setCancelModal(null);
      setCancelReason("");
      await loadClaims();
    } catch (error: unknown) {
      alert(errorDetail(error, "取消失败"));
    } finally {
      setActioningClaimId("");
    }
  };

  const updateSettlement = async (claim: Claim, action: "freeze" | "unfreeze") => {
    const confirmText = action === "freeze" ? "确认冻结该领取记录？" : "确认解冻该领取记录？";
    if (!window.confirm(confirmText)) return;
    setActioningClaimId(claim.id);
    try {
      await api.post<Claim>(`/api/admin/claims/${claim.id}/${action}`);
      await loadClaims();
    } catch (error: unknown) {
      alert(errorDetail(error, action === "freeze" ? "冻结失败" : "解冻失败"));
    } finally {
      setActioningClaimId("");
    }
  };

  const actionButtonClass = "px-3 py-1 rounded-lg text-xs font-bold transition-colors disabled:opacity-50";

  const rowActions = (claim: Claim) => {
    const disabled = actioningClaimId === claim.id;
    if (claim.settlement_status === "paid" || claim.settlement_status === "cancelled" || !claim.settlement_status) {
      return <span className="text-on-surface-variant">-</span>;
    }
    return (
      <div className="flex gap-2">
        {claim.settlement_status === "frozen" && (
          <button disabled={disabled} onClick={() => updateSettlement(claim, "unfreeze")}
            className={`${actionButtonClass} bg-primary/10 text-primary hover:bg-primary/15`}>
            解冻
          </button>
        )}
        <button disabled={disabled} onClick={() => { setCancelModal(claim); setCancelReason(""); }}
          className={`${actionButtonClass} bg-error/10 text-error hover:bg-error/15`}>
          取消
        </button>
        {claim.settlement_status === "unpaid" && (
          <button disabled={disabled} onClick={() => updateSettlement(claim, "freeze")}
            className={`${actionButtonClass} bg-purple-100 text-purple-700 hover:bg-purple-200`}>
            冻结
          </button>
        )}
      </div>
    );
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-extrabold font-[var(--font-headline)] tracking-tight">领取记录</h1>
        <p className="text-on-surface-variant mt-1">共 {total} 条记录</p>
      </div>

      {/* Filters */}
      <div className="bg-surface-container-lowest rounded-xl p-4 shadow-sm space-y-3">
        <div className="flex gap-3">
          <input type="text" placeholder="搜索手机号..." value={phoneFilter}
            onChange={(e) => { setPhoneFilter(e.target.value); setPage(1); }}
            className="flex-1 bg-surface-container-low border-none rounded-xl py-3 px-4 text-sm focus:ring-2 focus:ring-primary/40"
          />
          <input type="text" placeholder="搜索 IP..." value={ipFilter}
            onChange={(e) => { setIpFilter(e.target.value); setPage(1); }}
            className="flex-1 bg-surface-container-low border-none rounded-xl py-3 px-4 text-sm focus:ring-2 focus:ring-primary/40"
          />
        </div>
        <div className="flex gap-3">
          <input type="text" placeholder="搜索设备指纹..." value={deviceFilter}
            onChange={(e) => { setDeviceFilter(e.target.value); setPage(1); }}
            className="flex-1 bg-surface-container-low border-none rounded-xl py-3 px-4 text-sm focus:ring-2 focus:ring-primary/40"
          />
          <select value={prizeTypeFilter} onChange={(e) => { setPrizeTypeFilter(e.target.value); setPage(1); }}
            className="bg-surface-container-low border-none rounded-xl py-3 px-4 text-sm focus:ring-2 focus:ring-primary/40"
          >
            <option value="">全部奖项</option>
            <option value="onsite">现场奖</option>
            <option value="website">网站奖</option>
          </select>
          <select value={statusFilter} onChange={(e) => { setStatusFilter(e.target.value); setPage(1); }}
            className="bg-surface-container-low border-none rounded-xl py-3 px-4 text-sm focus:ring-2 focus:ring-primary/40"
          >
            <option value="">全部状态</option>
            <option value="success">成功</option>
            <option value="failed">失败</option>
            <option value="blocked">拦截</option>
          </select>
          <select value={settlementFilter} onChange={(e) => { setSettlementFilter(e.target.value as SettlementStatus | ""); setPage(1); }}
            className="bg-surface-container-low border-none rounded-xl py-3 px-4 text-sm focus:ring-2 focus:ring-primary/40"
          >
            {settlementOptions.map((option) => (
              <option key={option.value || "all"} value={option.value}>{option.label}</option>
            ))}
          </select>
          {hasFilters && (
            <button onClick={resetFilters}
              className="px-4 py-2 rounded-xl text-sm font-semibold text-error hover:bg-error/10 transition-colors whitespace-nowrap">
              清除筛选
            </button>
          )}
        </div>
      </div>

      <div className="bg-surface-container-lowest rounded-xl shadow-sm overflow-x-auto">
        <table className="w-full text-sm min-w-[1100px]">
          <thead>
            <tr className="border-b border-surface-container-high">
              {["时间", "手机号", "IP", "设备指纹", "奖项类型", "奖励码", "状态", "结算状态", "风控命中", "操作"].map((h) => (
                <th key={h} className="text-left px-6 py-4 font-bold text-on-surface-variant text-xs uppercase tracking-wider">{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr><td colSpan={10} className="px-6 py-8 text-center text-on-surface-variant">加载中...</td></tr>
            ) : claims.length === 0 ? (
              <tr><td colSpan={10} className="px-6 py-8 text-center text-on-surface-variant">暂无数据</td></tr>
            ) : (
              claims.map((c) => (
                <tr key={c.id} className="border-b border-surface-container-high/50 hover:bg-surface-container-low/50 transition-colors">
                  <td className="px-6 py-4 text-xs text-on-surface-variant">{new Date(c.created_at).toLocaleString()}</td>
                  <td className="px-6 py-4 font-mono text-xs">{c.phone}</td>
                  <td className="px-6 py-4 font-mono text-xs">{c.ip}</td>
                  <td className="px-6 py-4 font-mono text-xs max-w-[100px] truncate" title={c.device_fingerprint}>{c.device_fingerprint || "-"}</td>
                  <td className="px-6 py-4">
                    <span className={`px-2 py-1 rounded-full text-xs font-bold ${c.prize_type === "website" ? "bg-primary/10 text-primary" : "bg-secondary-container text-on-secondary-container"}`}>
                      {c.prize_type === "website" ? "网站奖" : "现场奖"}
                    </span>
                  </td>
                  <td className="px-6 py-4 font-mono text-xs">{c.reward_code || "-"}</td>
                  <td className="px-6 py-4">{statusBadge(c.status)}</td>
                  <td className="px-6 py-4">{settlementBadge(c.settlement_status)}</td>
                  <td className="px-6 py-4 text-xs">{c.risk_hit?.length > 0 ? c.risk_hit.join(", ") : "-"}</td>
                  <td className="px-6 py-4">{rowActions(c)}</td>
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

      {cancelModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-4">
          <div className="w-full max-w-md rounded-xl bg-surface-container-lowest p-6 shadow-xl">
            <h2 className="text-xl font-extrabold font-[var(--font-headline)]">取消结算</h2>
            <p className="mt-1 text-sm text-on-surface-variant">手机号：{cancelModal.phone}</p>
            <textarea
              value={cancelReason}
              onChange={(e) => setCancelReason(e.target.value)}
              placeholder="请输入取消原因"
              className="mt-4 min-h-28 w-full rounded-xl border-none bg-surface-container-low px-4 py-3 text-sm focus:ring-2 focus:ring-primary/40"
            />
            <div className="mt-5 flex justify-end gap-3">
              <button onClick={() => { setCancelModal(null); setCancelReason(""); }}
                className="rounded-xl px-4 py-2 text-sm font-bold text-on-surface-variant hover:bg-surface-container-low">
                取消
              </button>
              <button onClick={submitCancel} disabled={!cancelReason.trim() || actioningClaimId === cancelModal.id}
                className="rounded-xl bg-error px-4 py-2 text-sm font-bold text-on-error disabled:opacity-50">
                确认
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
