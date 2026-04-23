"use client";

import { useCallback, useEffect, useState } from "react";
import api from "@/lib/api";
import { copyToClipboard } from "@/lib/clipboard";
import type { CommissionLog, PageResponse, PayoutAccount } from "@/types";
import { accountTypeLabels } from "../wallet/wallet-shared";

type CommissionFilter = "all" | "1" | "2" | "3" | "team_reward";

interface CommissionSummary {
  total_earned: number;
  pending: number;
  approved: number;
  paid: number;
}

interface CommissionRecord extends CommissionLog {
  source_staff_name?: string;
  source_staff_no?: string;
  source_info?: string;
}

interface CommissionResponse extends PageResponse<CommissionRecord> {
  summary?: Partial<CommissionSummary>;
}

const filterTabs: Array<{ key: CommissionFilter; label: string }> = [
  { key: "all", label: "All Levels" },
  { key: "1", label: "Level 1" },
  { key: "2", label: "Level 2" },
  { key: "3", label: "Level 3" },
  { key: "team_reward", label: "Team Rewards" },
];

function toPoints(value: number) {
  return `${value.toFixed(2)}P`;
}

function toNumber(value: unknown) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

function statusBadge(status: string) {
  const styles: Record<string, string> = {
    pending: "bg-yellow-100 text-yellow-700",
    approved: "bg-green-100 text-green-700",
    paid: "bg-green-100 text-green-700",
    rejected: "bg-red-100 text-red-700",
    frozen: "bg-red-100 text-red-700",
  };
  return (
    <span className={`rounded-full px-2 py-1 text-xs font-bold ${styles[status] || "bg-slate-100 text-slate-600"}`}>
      {status}
    </span>
  );
}

function fallbackSummary(items: CommissionRecord[]): CommissionSummary {
  return items.reduce<CommissionSummary>(
    (acc, item) => {
      const amount = toNumber(item.amount);
      acc.total_earned += amount;
      if (item.status === "pending") acc.pending += amount;
      if (item.status === "approved") acc.approved += amount;
      if (item.status === "paid") acc.paid += amount;
      return acc;
    },
    { total_earned: 0, pending: 0, approved: 0, paid: 0 }
  );
}

export default function CommissionPage() {
  const [activeFilter, setActiveFilter] = useState<CommissionFilter>("all");
  const [records, setRecords] = useState<CommissionRecord[]>([]);
  const [summary, setSummary] = useState<CommissionSummary>({ total_earned: 0, pending: 0, approved: 0, paid: 0 });
  const [defaultAccount, setDefaultAccount] = useState<PayoutAccount | null>(null);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(true);

  const loadCommissions = useCallback(async () => {
    setLoading(true);
    try {
      const params: Record<string, string | number> = { page, page_size: 10 };
      if (activeFilter === "team_reward") params.type = "team_reward";
      if (["1", "2", "3"].includes(activeFilter)) params.level = Number(activeFilter);
      const res = await api.get<CommissionResponse>("/api/promoter/commission", { params });
      const items = res.data.items || [];
      setRecords(items);
      setTotal(res.data.total || 0);
      const computed = fallbackSummary(items);
      setSummary({
        total_earned: toNumber(res.data.summary?.total_earned ?? computed.total_earned),
        pending: toNumber(res.data.summary?.pending ?? computed.pending),
        approved: toNumber(res.data.summary?.approved ?? computed.approved),
        paid: toNumber(res.data.summary?.paid ?? computed.paid),
      });
    } catch {
      setRecords([]);
      setTotal(0);
      setSummary({ total_earned: 0, pending: 0, approved: 0, paid: 0 });
    } finally {
      setLoading(false);
    }
  }, [activeFilter, page]);

  const loadDefaultAccount = useCallback(async () => {
    try {
      const res = await api.get<PayoutAccount[] | PageResponse<PayoutAccount>>("/api/promoter/payout-accounts");
      const accounts = Array.isArray(res.data) ? res.data : (res.data.items || []);
      setDefaultAccount(accounts.find((account) => account.is_default) || null);
    } catch {
      setDefaultAccount(null);
    }
  }, []);

  useEffect(() => { loadCommissions(); }, [loadCommissions]);
  useEffect(() => { loadDefaultAccount(); }, [loadDefaultAccount]);

  const totalPages = Math.max(1, Math.ceil(total / 10));
  const defaultAccountLine = defaultAccount
    ? defaultAccount.type === "bank"
      ? `Bank: ${defaultAccount.bank_name} · ${defaultAccount.account_name} · ${defaultAccount.account_number}`
      : defaultAccount.type === "usdt"
        ? `USDT (${defaultAccount.bank_name}): ${defaultAccount.account_number}`
        : `${accountTypeLabels[defaultAccount.type]}: ${defaultAccount.account_name} · ${defaultAccount.account_number}`
    : "No default payout account set.";

  const copyDefaultAccount = async () => {
    if (!defaultAccount) return;
    await copyToClipboard(defaultAccountLine);
    alert("Copied!");
  };

  return (
    <div className="mx-auto max-w-lg px-4 pt-8 pb-8 space-y-5">
      <section className="space-y-1">
        <h1 className="text-3xl font-extrabold font-[var(--font-headline)] tracking-tight">My Commission</h1>
        <p className="text-sm text-on-surface-variant">Review your commission history and payouts.</p>
      </section>

      <section className="grid grid-cols-2 gap-3">
        <article className="bg-surface-container-lowest rounded-xl p-4 shadow-sm">
          <p className="text-xs uppercase tracking-wider font-bold text-on-surface-variant">Total (incl. Bonus)</p>
          <p className="text-xl font-extrabold font-[var(--font-headline)] mt-2 text-primary">{toPoints(summary.total_earned)}</p>
          <p className="mt-1 text-xs text-on-surface-variant">Commission + Bonus</p>
        </article>
        <article className="bg-surface-container-lowest rounded-xl p-4 shadow-sm">
          <p className="text-xs uppercase tracking-wider font-bold text-on-surface-variant">Pending</p>
          <p className="text-xl font-extrabold font-[var(--font-headline)] mt-2 text-yellow-700">{toPoints(summary.pending)}</p>
        </article>
        <article className="bg-surface-container-lowest rounded-xl p-4 shadow-sm">
          <p className="text-xs uppercase tracking-wider font-bold text-on-surface-variant">Approved</p>
          <p className="text-xl font-extrabold font-[var(--font-headline)] mt-2 text-green-700">{toPoints(summary.approved)}</p>
        </article>
        <article className="bg-surface-container-lowest rounded-xl p-4 shadow-sm">
          <p className="text-xs uppercase tracking-wider font-bold text-on-surface-variant">Paid</p>
          <p className="text-xl font-extrabold font-[var(--font-headline)] mt-2 text-primary">{toPoints(summary.paid)}</p>
        </article>
      </section>

      <section className="bg-surface-container-lowest rounded-xl p-4 shadow-sm">
        <div className="flex items-center justify-between gap-3">
          <div>
            <p className="text-xs uppercase tracking-wider font-bold text-on-surface-variant">Default Payout Account</p>
            <p className="text-sm font-bold mt-1">{defaultAccountLine}</p>
          </div>
          <button
            onClick={copyDefaultAccount}
            disabled={!defaultAccount}
            className="rounded-full bg-primary px-4 py-2 text-sm font-bold text-on-primary disabled:opacity-40"
          >
            Copy
          </button>
        </div>
      </section>

      <section className="bg-surface-container-lowest rounded-xl p-2 shadow-sm">
        <div className="grid grid-cols-2 gap-2">
          {filterTabs.map((tab) => (
            <button
              key={tab.key}
              onClick={() => { setActiveFilter(tab.key); setPage(1); }}
              className={`rounded-full px-3 py-2 text-xs font-bold transition-colors ${
                activeFilter === tab.key ? "bg-primary text-on-primary" : "text-on-surface-variant hover:bg-surface-container-low"
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>
      </section>

      <section className="space-y-3">
        {loading ? (
          <div className="bg-surface-container-lowest rounded-xl p-6 text-center text-on-surface-variant">Loading...</div>
        ) : records.length === 0 ? (
          <div className="bg-surface-container-lowest rounded-xl p-6 text-center text-on-surface-variant">No commission records.</div>
        ) : (
          records.map((record) => (
            <article key={record.id} className="bg-surface-container-lowest rounded-xl p-5 shadow-sm">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="text-xs text-on-surface-variant">{new Date(record.created_at).toLocaleString("en-US")}</p>
                  <p className="text-sm font-semibold mt-1">
                    {record.source_staff_name || record.source_staff_no || record.source_info || record.commission_no}
                  </p>
                </div>
                {statusBadge(record.status)}
              </div>
              <div className="mt-3 flex items-center justify-between gap-3">
                <div className="space-y-1">
                  <p className="text-xs uppercase tracking-wider text-on-surface-variant font-bold">
                    Level {record.level} - {record.type}
                  </p>
                  <p className="text-xs text-on-surface-variant">Rate: {toNumber(record.rate).toFixed(2)}%</p>
                </div>
                <p className="text-xl font-extrabold font-[var(--font-headline)] text-primary">{toPoints(toNumber(record.amount))}</p>
              </div>
            </article>
          ))
        )}
      </section>

      <section className="flex items-center justify-between bg-surface-container-lowest rounded-xl p-4 shadow-sm">
        <button
          onClick={() => setPage((prev) => Math.max(1, prev - 1))}
          disabled={page === 1}
          className="rounded-full border border-outline-variant px-4 py-2 text-sm font-bold text-on-surface-variant disabled:opacity-40"
        >
          Previous
        </button>
        <p className="text-sm text-on-surface-variant">{page} / {totalPages}</p>
        <button
          onClick={() => setPage((prev) => Math.min(totalPages, prev + 1))}
          disabled={page === totalPages}
          className="rounded-full bg-primary px-4 py-2 text-sm font-bold text-on-primary disabled:opacity-40"
        >
          Next
        </button>
      </section>
    </div>
  );
}
