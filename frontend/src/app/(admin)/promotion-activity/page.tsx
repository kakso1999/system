"use client";

import { useEffect, useState } from "react";

import api from "@/lib/api";
import type { PageResponse } from "@/types";

type ActivityItem = {
  id: string;
  staff_id: string;
  staff_name: string;
  staff_no: string;
  event_type: string;
  created_at: string;
  ip?: string;
  device_fingerprint?: string;
  metadata?: Record<string, unknown> | null;
};

const PAGE_SIZE = 20;
const EVENT_OPTIONS = [
  { value: "", label: "全部" },
  { value: "qr_generated", label: "qr_generated" },
  { value: "pin_verified", label: "pin_verified" },
  { value: "work_start", label: "work_start" },
  { value: "work_stop", label: "work_stop" },
  { value: "work_pause", label: "work_pause" },
  { value: "work_resume", label: "work_resume" },
  { value: "other", label: "other" },
];

function formatDateTime(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return "—";
  }
  return date.toLocaleString();
}

function formatMetadata(metadata?: Record<string, unknown> | null) {
  if (!metadata || Object.keys(metadata).length === 0) {
    return "—";
  }
  try {
    const text = JSON.stringify(metadata);
    return text.length > 80 ? `${text.slice(0, 80)}...` : text;
  } catch {
    return "—";
  }
}

function buildDateFrom(value: string) {
  return value ? `${value}T00:00:00` : "";
}

function buildDateTo(value: string) {
  return value ? `${value}T23:59:59.999999` : "";
}

export default function PromotionActivityPage() {
  const [items, setItems] = useState<ActivityItem[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [staffId, setStaffId] = useState("");
  const [eventType, setEventType] = useState("");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let active = true;

    const loadActivity = async () => {
      setLoading(true);
      try {
        const params: Record<string, string | number> = { page, page_size: PAGE_SIZE };
        const staffIdValue = staffId.trim();
        if (staffIdValue) {
          params.staff_id = staffIdValue;
        }
        if (eventType) {
          params.event_type = eventType;
        }
        if (dateFrom) {
          params.date_from = buildDateFrom(dateFrom);
        }
        if (dateTo) {
          params.date_to = buildDateTo(dateTo);
        }

        const res = await api.get<PageResponse<ActivityItem>>("/api/admin/promotion-activity/", { params });
        if (!active) {
          return;
        }
        setItems(res.data.items || []);
        setTotal(res.data.total || 0);
      } catch {
        if (!active) {
          return;
        }
        setItems([]);
        setTotal(0);
      } finally {
        if (active) {
          setLoading(false);
        }
      }
    };

    loadActivity();

    return () => {
      active = false;
    };
  }, [page, staffId, eventType, dateFrom, dateTo]);

  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const hasFilters = staffId || eventType || dateFrom || dateTo;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-extrabold font-[var(--font-headline)] tracking-tight">员工推广记录</h1>
        <p className="mt-1 text-on-surface-variant">共 {total} 条记录</p>
      </div>

      <div className="rounded-xl bg-surface-container-lowest p-4 shadow-sm">
        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-5">
          <input
            type="text"
            value={staffId}
            placeholder="输入员工 ID"
            onChange={(event) => { setStaffId(event.target.value); setPage(1); }}
            className="rounded-xl border-none bg-surface-container-low px-4 py-3 text-sm focus:ring-2 focus:ring-primary/40"
          />
          <select
            value={eventType}
            onChange={(event) => { setEventType(event.target.value); setPage(1); }}
            className="rounded-xl border-none bg-surface-container-low px-4 py-3 text-sm focus:ring-2 focus:ring-primary/40"
          >
            {EVENT_OPTIONS.map((option) => (
              <option key={option.value || "all"} value={option.value}>{option.label}</option>
            ))}
          </select>
          <input
            type="date"
            value={dateFrom}
            onChange={(event) => { setDateFrom(event.target.value); setPage(1); }}
            className="rounded-xl border-none bg-surface-container-low px-4 py-3 text-sm focus:ring-2 focus:ring-primary/40"
          />
          <input
            type="date"
            value={dateTo}
            onChange={(event) => { setDateTo(event.target.value); setPage(1); }}
            className="rounded-xl border-none bg-surface-container-low px-4 py-3 text-sm focus:ring-2 focus:ring-primary/40"
          />
          <button
            type="button"
            onClick={() => {
              setStaffId("");
              setEventType("");
              setDateFrom("");
              setDateTo("");
              setPage(1);
            }}
            disabled={!hasFilters}
            className="rounded-xl px-4 py-3 text-sm font-semibold text-on-surface-variant transition-colors hover:bg-surface-container-low disabled:cursor-not-allowed disabled:opacity-40"
          >
            清除筛选
          </button>
        </div>
      </div>

      <div className="overflow-x-auto rounded-xl bg-surface-container-lowest shadow-sm">
        <table className="min-w-[1100px] w-full text-sm">
          <thead>
            <tr className="border-b border-surface-container-high">
              {["时间", "地推员", "事件类型", "IP", "设备指纹", "备注"].map((header) => (
                <th key={header} className="px-6 py-4 text-left text-xs font-bold uppercase tracking-wider text-on-surface-variant">
                  {header}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr>
                <td colSpan={6} className="px-6 py-8 text-center text-on-surface-variant">加载中...</td>
              </tr>
            ) : items.length === 0 ? (
              <tr>
                <td colSpan={6} className="px-6 py-8 text-center text-on-surface-variant">暂无数据</td>
              </tr>
            ) : (
              items.map((item, index) => (
                <tr
                  key={item.id}
                  className={`${index % 2 === 0 ? "bg-surface-container-lowest" : "bg-surface-container-low/30"} border-b border-surface-container-high/50 transition-colors hover:bg-surface-container-low/60`}
                >
                  <td className="px-6 py-4 text-xs text-on-surface-variant">{formatDateTime(item.created_at)}</td>
                  <td className="px-6 py-4">
                    <div className="font-semibold">{item.staff_name || "—"}</div>
                    <div className="text-xs text-on-surface-variant">{item.staff_no || item.staff_id || "—"}</div>
                  </td>
                  <td className="px-6 py-4 font-mono text-xs">{item.event_type || "—"}</td>
                  <td className="px-6 py-4 font-mono text-xs">{item.ip || "—"}</td>
                  <td className="max-w-[240px] px-6 py-4 font-mono text-xs" title={item.device_fingerprint || "—"}>
                    <div className="truncate">{item.device_fingerprint || "—"}</div>
                  </td>
                  <td className="max-w-[320px] px-6 py-4 font-mono text-xs text-on-surface-variant" title={formatMetadata(item.metadata)}>
                    <div className="truncate">{formatMetadata(item.metadata)}</div>
                  </td>
                </tr>
              ))
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
    </div>
  );
}
