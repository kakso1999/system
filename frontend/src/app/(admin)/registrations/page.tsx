"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import api from "@/lib/api";
import type { PageResponse } from "@/types";
import RejectModal from "../finance/reject-modal";

type RegistrationStatus = "pending" | "approved" | "rejected";

interface RegistrationApplication {
  id: string;
  name: string;
  phone: string;
  username: string;
  invite_code: string | null;
  referrer_staff: { id: string; name: string; staff_no: string } | null;
  status: RegistrationStatus;
  rejection_reason: string;
  applied_at: string;
  reviewed_at: string | null;
  reviewed_by_admin_id: string | null;
  approved_staff_id: string | null;
}

interface PendingCountResponse {
  count: number;
}

const PAGE_SIZE = 20;
const STATUS_OPTIONS: Array<{ key: "all" | RegistrationStatus; label: string }> = [
  { key: "all", label: "全部" },
  { key: "pending", label: "待审核" },
  { key: "approved", label: "已通过" },
  { key: "rejected", label: "已拒绝" },
];

function formatDateTime(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return "—";
  }

  const year = date.getFullYear();
  const month = `${date.getMonth() + 1}`.padStart(2, "0");
  const day = `${date.getDate()}`.padStart(2, "0");
  const hours = `${date.getHours()}`.padStart(2, "0");
  const minutes = `${date.getMinutes()}`.padStart(2, "0");

  return `${year}-${month}-${day} ${hours}:${minutes}`;
}

function maskPhone(phone: string) {
  const value = phone.trim();
  if (!value) {
    return "—";
  }
  if (value.length < 8) {
    return value;
  }

  const prefixLength = value.startsWith("+") ? Math.min(4, value.length - 4) : Math.min(3, value.length - 4);
  const prefix = value.slice(0, prefixLength);
  const suffix = value.slice(-4);
  return `${prefix} ***** ${suffix}`;
}

function statusBadge(status: RegistrationStatus) {
  const styles: Record<RegistrationStatus, string> = {
    pending: "bg-orange-100 text-orange-700",
    approved: "bg-green-100 text-green-700",
    rejected: "bg-red-100 text-red-700",
  };
  const labels: Record<RegistrationStatus, string> = {
    pending: "待审核",
    approved: "已通过",
    rejected: "已拒绝",
  };

  return (
    <span className={`rounded-full px-2 py-1 text-xs font-bold ${styles[status]}`}>
      {labels[status]}
    </span>
  );
}

export default function RegistrationsPage() {
  const [items, setItems] = useState<RegistrationApplication[]>([]);
  const [status, setStatus] = useState<"all" | RegistrationStatus>("pending");
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);
  const [total, setTotal] = useState(0);
  const [pendingCount, setPendingCount] = useState(0);
  const [loading, setLoading] = useState(true);
  const [updatingId, setUpdatingId] = useState("");
  const [rejectTarget, setRejectTarget] = useState<RegistrationApplication | null>(null);
  const [rejectReason, setRejectReason] = useState("");
  const [submittingReject, setSubmittingReject] = useState(false);

  const loadPendingCount = useCallback(async () => {
    try {
      const res = await api.get<PendingCountResponse>("/api/admin/registrations/pending-count");
      setPendingCount(Math.max(0, Number(res.data.count || 0)));
    } catch {
      setPendingCount(0);
    }
  }, []);

  const loadRegistrations = useCallback(async () => {
    setLoading(true);
    try {
      const params: Record<string, string | number> = { page, page_size: PAGE_SIZE };
      if (status !== "all") {
        params.status = status;
      }
      const keyword = search.trim();
      if (keyword) {
        params.q = keyword;
      }
      const res = await api.get<PageResponse<RegistrationApplication>>("/api/admin/registrations/", { params });
      setItems(res.data.items || []);
      setTotal(res.data.total || 0);
    } catch {
      setItems([]);
      setTotal(0);
    } finally {
      setLoading(false);
    }
  }, [page, search, status]);

  useEffect(() => {
    loadRegistrations();
  }, [loadRegistrations]);

  useEffect(() => {
    loadPendingCount();
  }, [loadPendingCount]);

  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  useEffect(() => {
    if (!loading && page > totalPages) {
      setPage(totalPages);
    }
  }, [loading, page, totalPages]);

  const refreshData = useCallback(async () => {
    await Promise.all([loadRegistrations(), loadPendingCount()]);
  }, [loadPendingCount, loadRegistrations]);

  const handleApprove = async (item: RegistrationApplication) => {
    if (!window.confirm("确认通过该申请？")) {
      return;
    }

    setUpdatingId(item.id);
    try {
      await api.post(`/api/admin/registrations/${item.id}/approve`);
      await refreshData();
    } catch (error: unknown) {
      const axiosErr = error as { response?: { data?: { detail?: string } } };
      alert(axiosErr.response?.data?.detail || "操作失败");
    } finally {
      setUpdatingId("");
    }
  };

  const submitReject = async () => {
    if (!rejectTarget || !rejectReason.trim()) {
      return;
    }

    setSubmittingReject(true);
    try {
      await api.post(`/api/admin/registrations/${rejectTarget.id}/reject`, { reason: rejectReason.trim() });
      setRejectTarget(null);
      setRejectReason("");
      await refreshData();
    } catch (error: unknown) {
      const axiosErr = error as { response?: { data?: { detail?: string } } };
      alert(axiosErr.response?.data?.detail || "操作失败");
    } finally {
      setSubmittingReject(false);
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 xl:flex-row xl:items-center xl:justify-between">
        <div>
          <h1 className="text-3xl font-extrabold font-[var(--font-headline)] tracking-tight">注册审核</h1>
          <p className="mt-1 text-on-surface-variant">审核专用员工注册申请</p>
        </div>
        <div className="flex flex-col gap-3 lg:flex-row lg:items-center">
          <div className="inline-flex rounded-full bg-surface-container-lowest p-1 shadow-sm">
            {STATUS_OPTIONS.map((option) => {
              const active = status === option.key;
              const label = option.key === "pending" ? `${option.label} ${pendingCount}` : option.label;
              return (
                <button
                  key={option.key}
                  onClick={() => { setStatus(option.key); setPage(1); }}
                  className={`rounded-full px-4 py-2 text-sm font-bold ${active ? "bg-primary text-on-primary" : "text-on-surface-variant"}`}
                >
                  {label}
                </button>
              );
            })}
          </div>
          <input
            type="text"
            value={search}
            placeholder="搜索姓名 / 手机号 / 用户名..."
            onChange={(event) => { setSearch(event.target.value); setPage(1); }}
            className="w-full min-w-72 rounded-xl border-none bg-surface-container-lowest px-4 py-3 text-sm transition-all focus:ring-2 focus:ring-primary/40"
          />
        </div>
      </div>

      <div className="overflow-x-auto rounded-xl bg-surface-container-lowest shadow-sm">
        <table className="min-w-[980px] w-full text-sm">
          <thead>
            <tr className="border-b border-surface-container-high">
              {["申请时间", "姓名", "手机", "用户名", "推荐人", "状态", "操作"].map((header) => (
                <th key={header} className="px-6 py-4 text-left text-xs font-bold uppercase tracking-wider text-on-surface-variant">
                  {header}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr>
                <td colSpan={7} className="px-6 py-8 text-center text-on-surface-variant">加载中...</td>
              </tr>
            ) : items.length === 0 ? (
              <tr>
                <td colSpan={7} className="px-6 py-8 text-center text-on-surface-variant">暂无数据</td>
              </tr>
            ) : (
              items.map((item) => {
                const disabled = updatingId === item.id || submittingReject;
                return (
                  <tr key={item.id} className="border-b border-surface-container-high/50 transition-colors hover:bg-surface-container-low/50">
                    <td className="px-6 py-4 text-xs text-on-surface-variant">{formatDateTime(item.applied_at)}</td>
                    <td className="px-6 py-4 font-semibold">{item.name}</td>
                    <td className="px-6 py-4 font-mono text-xs">{maskPhone(item.phone)}</td>
                    <td className="px-6 py-4 font-mono text-xs">{item.username}</td>
                    <td className="px-6 py-4 text-xs text-on-surface-variant">
                      {item.referrer_staff ? `${item.referrer_staff.name} / ${item.referrer_staff.staff_no}` : "—"}
                    </td>
                    <td className="px-6 py-4">{statusBadge(item.status)}</td>
                    <td className="px-6 py-4">
                      {item.status === "pending" && (
                        <div className="flex items-center gap-2">
                          <button
                            onClick={() => handleApprove(item)}
                            disabled={disabled}
                            className="rounded-lg bg-green-50 px-3 py-1.5 text-xs font-bold text-green-700 transition-colors hover:bg-green-100 disabled:opacity-60"
                          >
                            通过
                          </button>
                          <button
                            onClick={() => { setRejectTarget(item); setRejectReason(""); }}
                            disabled={disabled}
                            className="rounded-lg bg-error/10 px-3 py-1.5 text-xs font-bold text-error transition-colors hover:bg-error/15 disabled:opacity-60"
                          >
                            拒绝
                          </button>
                        </div>
                      )}
                      {item.status === "approved" && (
                        <div className="flex items-center gap-2 text-xs text-green-700">
                          <span className="font-bold">已通过</span>
                          {item.approved_staff_id && (
                            <Link href="/staff" className="font-semibold text-primary hover:underline">
                              查看员工
                            </Link>
                          )}
                        </div>
                      )}
                      {item.status === "rejected" && (
                        <div className="group relative inline-flex items-center">
                          <span className="text-xs font-bold text-red-700">已拒绝</span>
                          {item.rejection_reason && (
                            <span className="pointer-events-none absolute left-0 top-full z-10 mt-2 hidden min-w-56 rounded-xl bg-inverse-surface px-3 py-2 text-xs text-inverse-on-surface shadow-lg group-hover:block">
                              {item.rejection_reason}
                            </span>
                          )}
                        </div>
                      )}
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>

      {totalPages > 1 && (
        <div className="flex items-center justify-center gap-2">
          <button
            onClick={() => setPage((prev) => Math.max(1, prev - 1))}
            disabled={page === 1}
            className="rounded-lg px-4 py-2 text-sm font-semibold text-on-surface-variant transition-all hover:bg-surface-container-low disabled:opacity-40"
          >
            上一页
          </button>
          <span className="px-4 text-sm text-on-surface-variant">{page} / {totalPages}</span>
          <button
            onClick={() => setPage((prev) => Math.min(totalPages, prev + 1))}
            disabled={page === totalPages}
            className="rounded-lg px-4 py-2 text-sm font-semibold text-on-surface-variant transition-all hover:bg-surface-container-low disabled:opacity-40"
          >
            下一页
          </button>
        </div>
      )}

      {rejectTarget && (
        <RejectModal
          heading="拒绝申请"
          title={`${rejectTarget.name} · ${rejectTarget.username}`}
          reason={rejectReason}
          submitting={submittingReject}
          placeholder="请输入拒绝原因"
          confirmLabel="确认拒绝"
          onReasonChange={setRejectReason}
          onCancel={() => { setRejectTarget(null); setRejectReason(""); }}
          onConfirm={submitReject}
        />
      )}
    </div>
  );
}
