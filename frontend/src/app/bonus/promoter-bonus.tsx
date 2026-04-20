"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { Check, ChevronDown, ChevronUp, Clock, Trophy, Zap } from "lucide-react";
import api from "@/lib/api";
import type { BonusClaimRecord, BonusRecordPage, BonusTodayResponse, BonusTodayTier } from "./bonus-types";
import { formatDateTime, getErrorDetail, toNumber, toPoints } from "./bonus-utils";

type Notice = { kind: "success" | "error"; text: string } | null;

const historyPageSize = 10;

function getNextTier(data: BonusTodayResponse | null) {
  if (!data || data.tiers.length === 0) return null;
  return [...data.tiers].sort((a, b) => a.threshold - b.threshold).find((tier) => !tier.claimed) || null;
}

function getProgressPercent(data: BonusTodayResponse | null) {
  const next = getNextTier(data);
  if (!data || !next) return 100;
  return Math.min(100, (toNumber(data.valid_count) / Math.max(1, next.threshold)) * 100);
}

function claimErrorText(detail: string | undefined) {
  const messages: Record<string, string> = {
    already_claimed: "Already claimed. Your progress has been refreshed.",
    tier_not_reached: "This tier is not reached yet. Progress refreshed.",
    tier_not_found: "This sprint tier is no longer available.",
    rule_disabled: "Sprint rules are currently disabled.",
  };
  return detail ? messages[detail] || "Claim failed. Please try again." : "Claim failed. Please try again.";
}

function tierStatus(tier: BonusTodayTier) {
  if (tier.claimed) return { label: "Claimed", className: "bg-green-100 text-green-700" };
  if (tier.claimable) return { label: "Claimable", className: "bg-secondary-container text-on-secondary-container" };
  return { label: `Progress`, className: "bg-surface-container-low text-on-surface-variant" };
}

function HeaderSection({ date }: { date?: string }) {
  return (
    <section className="space-y-1">
      <div className="inline-flex items-center gap-2 rounded-full bg-primary/10 px-3 py-1 text-xs font-bold uppercase tracking-wider text-primary">
        <Zap className="h-3.5 w-3.5" />
        Daily Sprint
      </div>
      <h1 className="font-[var(--font-headline)] text-3xl font-extrabold tracking-tight">Today&apos;s Mission Sprint</h1>
      <p className="text-sm text-on-surface-variant">{date || "Loading today's mission..."}</p>
    </section>
  );
}

function ProgressCard({ data }: { data: BonusTodayResponse | null }) {
  const next = getNextTier(data);
  const percent = getProgressPercent(data);
  const subtitle = next ? `${data?.valid_count || 0}/${next.threshold} valid claims to unlock ${toPoints(next.amount)}` : "All sprint tiers are completed.";
  return (
    <section className="rounded-xl bg-surface-container-lowest p-6 shadow-sm">
      <div className="flex items-center justify-between gap-4">
        <div>
          <p className="text-xs font-bold uppercase tracking-wider text-on-surface-variant">Next Unclaimed Tier</p>
          <h2 className="mt-1 font-[var(--font-headline)] text-2xl font-extrabold text-primary">
            {next ? `${next.threshold} Valid` : "Complete"}
          </h2>
        </div>
        <div className="rounded-full bg-primary/10 p-3 text-primary"><Trophy className="h-6 w-6" /></div>
      </div>
      <div className="mt-5 space-y-2">
        <div className="h-3 overflow-hidden rounded-full bg-surface-variant">
          <div className="h-full rounded-full bg-primary transition-all" style={{ width: `${percent}%` }} />
        </div>
        <p className="text-sm font-semibold text-on-surface-variant">{subtitle}</p>
      </div>
    </section>
  );
}

function StatusCards({ data }: { data: BonusTodayResponse }) {
  return (
    <section className="grid grid-cols-2 gap-3">
      <article className="rounded-xl bg-surface-container-low p-5">
        <p className="text-[10px] font-bold uppercase tracking-wider text-on-surface-variant">Valid Today</p>
        <p className="mt-2 font-[var(--font-headline)] text-3xl font-extrabold text-primary">{data.valid_count}</p>
      </article>
      <article className="rounded-xl bg-surface-container-low p-5">
        <p className="text-[10px] font-bold uppercase tracking-wider text-on-surface-variant">Earned Today</p>
        <p className="mt-2 font-[var(--font-headline)] text-3xl font-extrabold text-primary">{toPoints(data.total_earned_today)}</p>
      </article>
    </section>
  );
}

function TierCard(props: { tier: BonusTodayTier; validCount: number; claiming: boolean; onClaim: (tier: BonusTodayTier) => void }) {
  const status = tierStatus(props.tier);
  const progressText = props.tier.claimed ? "Reward already added to your earnings." : props.tier.claimable ? "Ready to claim now." : `${props.validCount}/${props.tier.threshold} valid claims`;
  return (
    <article className="rounded-xl bg-surface-container-lowest p-5 shadow-sm">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-xs font-bold uppercase tracking-wider text-on-surface-variant">Reach {props.tier.threshold} Valid</p>
          <p className="mt-1 font-[var(--font-headline)] text-2xl font-extrabold text-primary">{toPoints(props.tier.amount)}</p>
        </div>
        <span className={`rounded-full px-3 py-1 text-xs font-bold ${status.className}`}>{status.label}</span>
      </div>
      <div className="mt-4 flex items-center justify-between gap-3">
        <p className="text-sm text-on-surface-variant">{progressText}</p>
        {props.tier.claimed && <Check className="h-5 w-5 text-green-600" />}
        {props.tier.claimable && (
          <button onClick={() => props.onClaim(props.tier)} disabled={props.claiming} className="rounded-full bg-primary px-4 py-2 text-sm font-bold text-on-primary disabled:opacity-60">
            {props.claiming ? "Claiming..." : "Claim"}
          </button>
        )}
      </div>
    </article>
  );
}

function EmptyRuleCard({ validCount }: { validCount: number }) {
  return (
    <section className="rounded-xl bg-surface-container-lowest p-6 text-center shadow-sm">
      <p className="font-[var(--font-headline)] text-xl font-extrabold text-on-surface">No sprint rule yet</p>
      <p className="mt-2 text-sm text-on-surface-variant">You have {validCount} valid claims today. Bonus tiers will appear here when enabled.</p>
    </section>
  );
}

function HistoryPanel(props: { records: BonusClaimRecord[]; loading: boolean; page: number; totalPages: number; onPrev: () => void; onNext: () => void }) {
  return (
    <section className="space-y-3">
      {props.loading ? <div className="rounded-xl bg-surface-container-lowest p-5 text-center text-on-surface-variant">Loading history...</div> : null}
      {!props.loading && props.records.length === 0 ? <div className="rounded-xl bg-surface-container-lowest p-5 text-center text-on-surface-variant">No bonus history yet.</div> : null}
      {!props.loading && props.records.map((record) => (
        <article key={record.id} className="rounded-xl bg-surface-container-lowest p-4 shadow-sm">
          <div className="flex items-start justify-between gap-3">
            <div>
              <p className="text-xs text-on-surface-variant">{formatDateTime(record.created_at)}</p>
              <p className="mt-1 text-sm font-bold">Tier {record.tier_threshold} · {record.date}</p>
            </div>
            <span className="rounded-full bg-primary/10 px-3 py-1 text-xs font-bold text-primary">{record.status}</span>
          </div>
          <div className="mt-3 flex items-center justify-between text-sm">
            <span className="text-on-surface-variant">Valid at claim: {record.valid_count_at_claim}</span>
            <span className="font-[var(--font-headline)] text-lg font-extrabold text-primary">{toPoints(record.amount)}</span>
          </div>
        </article>
      ))}
      {props.totalPages > 1 && (
        <div className="flex items-center justify-between rounded-xl bg-surface-container-lowest p-4">
          <button onClick={props.onPrev} disabled={props.page === 1} className="rounded-full border border-outline-variant px-4 py-2 text-sm font-bold text-on-surface-variant disabled:opacity-40">Previous</button>
          <span className="text-sm text-on-surface-variant">{props.page} / {props.totalPages}</span>
          <button onClick={props.onNext} disabled={props.page === props.totalPages} className="rounded-full bg-primary px-4 py-2 text-sm font-bold text-on-primary disabled:opacity-40">Next</button>
        </div>
      )}
    </section>
  );
}

export default function PromoterBonusPage() {
  const [today, setToday] = useState<BonusTodayResponse | null>(null);
  const [history, setHistory] = useState<BonusClaimRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadingHistory, setLoadingHistory] = useState(false);
  const [showHistory, setShowHistory] = useState(false);
  const [historyPage, setHistoryPage] = useState(1);
  const [historyTotal, setHistoryTotal] = useState(0);
  const [claimingThreshold, setClaimingThreshold] = useState<number | null>(null);
  const [notice, setNotice] = useState<Notice>(null);

  const loadToday = useCallback(async (silent = false) => {
    if (!silent) setLoading(true);
    try {
      const res = await api.get<BonusTodayResponse>("/api/promoter/bonus/today");
      setToday(res.data);
    } finally {
      if (!silent) setLoading(false);
    }
  }, []);

  const loadHistory = useCallback(async () => {
    setLoadingHistory(true);
    try {
      const res = await api.get<BonusRecordPage>("/api/promoter/bonus/history", { params: { page: historyPage, page_size: historyPageSize } });
      setHistory(res.data.items || []);
      setHistoryTotal(res.data.total || 0);
    } finally {
      setLoadingHistory(false);
    }
  }, [historyPage]);

  useEffect(() => { loadToday().catch(() => setLoading(false)); }, [loadToday]);
  useEffect(() => { if (showHistory) loadHistory().catch(() => setLoadingHistory(false)); }, [loadHistory, showHistory]);

  useEffect(() => {
    const poll = () => { if (document.visibilityState === "visible") loadToday(true).catch(() => {}); };
    const intervalId = window.setInterval(poll, 30_000);
    document.addEventListener("visibilitychange", poll);
    return () => { window.clearInterval(intervalId); document.removeEventListener("visibilitychange", poll); };
  }, [loadToday]);

  const totalHistoryPages = useMemo(() => Math.max(1, Math.ceil(historyTotal / historyPageSize)), [historyTotal]);

  const claimTier = async (tier: BonusTodayTier) => {
    if (!window.confirm(`Claim ${toPoints(tier.amount)} for reaching ${tier.threshold} valid claims?`)) return;
    setClaimingThreshold(tier.threshold);
    setNotice(null);
    try {
      await api.post("/api/promoter/bonus/claim", { tier_threshold: tier.threshold });
      setNotice({ kind: "success", text: "Bonus claimed successfully." });
    } catch (error) {
      setNotice({ kind: "error", text: claimErrorText(getErrorDetail(error)) });
    } finally {
      setClaimingThreshold(null);
      await loadToday(true).catch(() => {});
      if (showHistory) await loadHistory().catch(() => {});
    }
  };

  if (loading || !today) {
    return <div className="flex min-h-screen items-center justify-center bg-surface text-on-surface-variant font-semibold">Loading...</div>;
  }

  return (
    <main className="mx-auto max-w-lg space-y-5 px-4 pb-8 pt-8">
      <HeaderSection date={today.date} />
      {notice && <div className={`rounded-xl p-4 text-sm font-bold ${notice.kind === "success" ? "bg-green-100 text-green-700" : "bg-red-100 text-red-700"}`}>{notice.text}</div>}
      <ProgressCard data={today} />
      <StatusCards data={today} />
      {today.rule && today.tiers.length > 0 ? (
        <section className="space-y-3">
          {today.tiers.map((tier) => <TierCard key={tier.threshold} tier={tier} validCount={today.valid_count} claiming={claimingThreshold === tier.threshold} onClaim={claimTier} />)}
        </section>
      ) : <EmptyRuleCard validCount={today.valid_count} />}
      <section className="space-y-3">
        <button onClick={() => setShowHistory((value) => !value)} className="flex w-full items-center justify-center gap-2 rounded-full px-4 py-3 text-sm font-bold text-primary hover:bg-primary/10">
          <Clock className="h-4 w-4" />
          View full history
          {showHistory ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
        </button>
        {showHistory && <HistoryPanel records={history} loading={loadingHistory} page={historyPage} totalPages={totalHistoryPages} onPrev={() => setHistoryPage((page) => Math.max(1, page - 1))} onNext={() => setHistoryPage((page) => Math.min(totalHistoryPages, page + 1))} />}
      </section>
    </main>
  );
}
