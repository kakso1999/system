"use client";

import { useEffect, useState, useCallback } from "react";
import api from "@/lib/api";
import type { Claim, PageResponse } from "@/types";

export default function ClaimsPage() {
  const [claims, setClaims] = useState<Claim[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [phoneFilter, setPhoneFilter] = useState("");
  const [statusFilter, setStatusFilter] = useState("");
  const [loading, setLoading] = useState(true);

  const loadClaims = useCallback(async () => {
    setLoading(true);
    try {
      const params: Record<string, string | number> = { page, page_size: 20 };
      if (phoneFilter) params.phone = phoneFilter;
      if (statusFilter) params.status = statusFilter;
      const res = await api.get<PageResponse<Claim>>("/api/admin/claims", { params });
      setClaims(res.data.items);
      setTotal(res.data.total);
    } catch {
      setClaims([]);
    } finally {
      setLoading(false);
    }
  }, [page, phoneFilter, statusFilter]);

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

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-extrabold font-[var(--font-headline)] tracking-tight">领取记录</h1>
        <p className="text-on-surface-variant mt-1">共 {total} 条记录</p>
      </div>

      <div className="flex gap-3">
        <input type="text" placeholder="搜索手机号..." value={phoneFilter}
          onChange={(e) => { setPhoneFilter(e.target.value); setPage(1); }}
          className="flex-1 bg-surface-container-lowest border-none rounded-xl py-3 px-4 text-sm focus:ring-2 focus:ring-primary/40"
        />
        <select value={statusFilter} onChange={(e) => { setStatusFilter(e.target.value); setPage(1); }}
          className="bg-surface-container-lowest border-none rounded-xl py-3 px-4 text-sm focus:ring-2 focus:ring-primary/40"
        >
          <option value="">全部状态</option>
          <option value="success">成功</option>
          <option value="failed">失败</option>
          <option value="blocked">拦截</option>
        </select>
      </div>

      <div className="bg-surface-container-lowest rounded-xl shadow-sm overflow-x-auto">
        <table className="w-full text-sm min-w-[800px]">
          <thead>
            <tr className="border-b border-surface-container-high">
              {["时间", "手机号", "IP", "奖项类型", "奖励码", "状态", "风控命中"].map((h) => (
                <th key={h} className="text-left px-6 py-4 font-bold text-on-surface-variant text-xs uppercase tracking-wider">{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr><td colSpan={7} className="px-6 py-8 text-center text-on-surface-variant">加载中...</td></tr>
            ) : claims.length === 0 ? (
              <tr><td colSpan={7} className="px-6 py-8 text-center text-on-surface-variant">暂无数据</td></tr>
            ) : (
              claims.map((c) => (
                <tr key={c.id} className="border-b border-surface-container-high/50 hover:bg-surface-container-low/50 transition-colors">
                  <td className="px-6 py-4 text-xs text-on-surface-variant">{new Date(c.created_at).toLocaleString()}</td>
                  <td className="px-6 py-4 font-mono text-xs">{c.phone}</td>
                  <td className="px-6 py-4 font-mono text-xs">{c.ip}</td>
                  <td className="px-6 py-4">
                    <span className={`px-2 py-1 rounded-full text-xs font-bold ${c.prize_type === "website" ? "bg-primary/10 text-primary" : "bg-secondary-container text-on-secondary-container"}`}>
                      {c.prize_type === "website" ? "网站奖" : "现场奖"}
                    </span>
                  </td>
                  <td className="px-6 py-4 font-mono text-xs">{c.reward_code || "-"}</td>
                  <td className="px-6 py-4">{statusBadge(c.status)}</td>
                  <td className="px-6 py-4 text-xs">{c.risk_hit?.length > 0 ? c.risk_hit.join(", ") : "-"}</td>
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
    </div>
  );
}
