"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Menu, LogOut, Wallet, QrCode, Play, Pause, Square, RotateCcw, Zap } from "lucide-react";
import api from "@/lib/api";
import { clearAuth } from "@/lib/auth";

type WorkStatus = "stopped" | "promoting" | "paused";
type WorkAction = "start" | "stop" | "pause" | "resume";

interface HomeData {
  staff: {
    id: string; name: string; staff_no: string; vip_level: number;
    invite_code: string; stats: { total_scans: number; total_valid: number; total_commission: number; team_size: number; level1_count: number; level2_count: number; level3_count: number };
    status?: "active" | "disabled" | "pending_review";
    risk_frozen?: boolean;
    work_status?: WorkStatus;
    promotion_paused?: boolean; pause_reason?: string;
    paused_at?: string | null; resumed_at?: string | null;
    started_promoting_at?: string | null; stopped_promoting_at?: string | null;
  };
  today: { scans: number; valid_claims: number; commission: number };
  settlement: { available: number; settled: number; pending: number };
}

const VIP_LABELS = ["Regular", "VIP 1", "VIP 2", "VIP 3", "Super VIP"];
const VIP_TARGETS = [0, 20, 60, 120, 240];

interface VipProgress {
  current_level: number;
  current_valid: number;
  next_level: number | null;
  next_level_required: number;
  remaining_valid: number;
  progress_percent: number;
}

interface BonusTodaySummary {
  date: string;
  valid_count: number;
  rule: { enabled: boolean } | null;
  tiers: Array<{ threshold: number; amount: number; claimable: boolean; claimed: boolean }>;
  total_earned_today: number;
}

interface RecentClaimItem {
  id: string;
  phone_masked: string;
  prize_type: string;
  reward_code: string;
  settlement_status: string;
  created_at: string;
}

function toPoints(value: number) {
  return `${value.toFixed(2)}P`;
}

function toNumber(value: unknown, fallback = 0) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function formatRelative(iso: string | null | undefined): string {
  if (!iso) return "unknown";
  const time = new Date(iso).getTime();
  if (!Number.isFinite(time)) return "unknown";
  const seconds = Math.max(0, Math.floor((Date.now() - time) / 1000));
  if (seconds < 60) return "just now";
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  return new Date(time).toLocaleDateString();
}

function getWorkStatus(status: unknown): WorkStatus {
  return status === "promoting" || status === "paused" || status === "stopped" ? status : "stopped";
}

function getApiDetail(error: unknown) {
  const response = (error as { response?: { status?: number; data?: { detail?: unknown } } }).response;
  if (response?.status !== 400 || typeof response.data?.detail !== "string") {
    return undefined;
  }
  return response.data.detail;
}

type WorkStatusCardProps = {
  staff: HomeData["staff"]; workStatus: WorkStatus; submitting: WorkAction | null; workError: string;
  disabled: boolean;
  onAction: (action: WorkAction) => void | Promise<void>; onOpenPause: () => void;
};

const primaryWorkButton = "flex flex-1 items-center justify-center gap-2 rounded-full bg-primary px-5 py-3 font-bold text-on-primary shadow-md shadow-primary/20 transition-all active:scale-[0.98] disabled:opacity-60";
const pauseWorkButton = "flex flex-1 items-center justify-center gap-2 rounded-full bg-surface-container-low px-5 py-3 font-bold text-primary transition-all active:scale-[0.98] disabled:opacity-60";
const outlineWorkButton = "flex flex-1 items-center justify-center gap-2 rounded-full border border-outline-variant px-5 py-3 font-bold text-on-surface-variant transition-all active:scale-[0.98] disabled:opacity-60";

const WorkStatusControls = ({
  workStatus,
  submitting,
  disabled: controlsDisabled,
  onAction,
  onOpenPause,
}: Omit<WorkStatusCardProps, "staff" | "workError">) => {
  const disabled = !!submitting || controlsDisabled;
  if (workStatus === "stopped") {
    return (
      <button onClick={() => onAction("start")} disabled={disabled} className={primaryWorkButton.replace("flex-1", "w-full")}>
        <Play className="h-5 w-5" />{submitting === "start" ? "Starting..." : "Start Promoting"}
      </button>
    );
  }
  const isPromoting = workStatus === "promoting";
  const LeadingIcon = isPromoting ? Pause : RotateCcw;
  const leadingAction = isPromoting ? "pause" : "resume";
  return (
    <>
      <button onClick={isPromoting ? onOpenPause : () => onAction("resume")} disabled={disabled}
        className={isPromoting ? pauseWorkButton : primaryWorkButton}>
        <LeadingIcon className="h-5 w-5" />
        {submitting === leadingAction ? (isPromoting ? "Pausing..." : "Resuming...") : (isPromoting ? "Pause" : "Resume")}
      </button>
      <button onClick={() => onAction("stop")} disabled={disabled} className={outlineWorkButton}>
        <Square className="h-5 w-5" />{submitting === "stop" ? "Stopping..." : "Stop"}
      </button>
    </>
  );
};

const WorkStatusCard = (props: WorkStatusCardProps) => {
  const statusTitle = props.workStatus === "promoting" ? "Promoting" : props.workStatus === "paused" ? "Paused" : "Stopped";
  const badgeText = props.workStatus === "promoting" ? "Active" : props.workStatus === "paused" ? "On Pause" : "Offline";
  const badgeClass = props.workStatus === "promoting" ? "bg-primary/10 text-primary" : "bg-surface-container-low text-on-surface-variant";
  const cardClass = props.workStatus === "stopped" ? "bg-surface-container-low" : "bg-surface-container-lowest";
  const details = props.workStatus === "promoting"
    ? <p className="text-sm text-on-surface-variant">Promoting since {formatRelative(props.staff.started_promoting_at)}</p>
    : props.workStatus === "paused"
      ? <div className="space-y-1 text-sm text-on-surface-variant"><p>Paused: {props.staff.pause_reason || "No reason provided"}</p><p>Paused at {formatRelative(props.staff.paused_at)}</p></div>
      : <p className="text-sm text-on-surface-variant">Start your session when you are ready to promote.</p>;
  return (
    <section className={`${cardClass} rounded-xl shadow-sm p-6 space-y-4`}>
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-xs font-bold uppercase tracking-wider text-on-surface-variant">Work Status</p>
          <h3 className="text-2xl font-extrabold font-[var(--font-headline)] mt-1 text-primary">{statusTitle}</h3>
        </div>
        <span className={`rounded-full px-3 py-1 text-xs font-bold ${badgeClass}`}>{badgeText}</span>
      </div>
      {details}
      <div className="flex gap-3">
        <WorkStatusControls workStatus={props.workStatus} submitting={props.submitting} disabled={props.disabled}
          onAction={props.onAction} onOpenPause={props.onOpenPause} />
      </div>
      {props.workError && <p className="text-sm font-semibold text-error">{props.workError}</p>}
    </section>
  );
};

type PauseModalProps = {
  reason: string; submitting: WorkAction | null; error: string; onReasonChange: (reason: string) => void;
  onClose: () => void; onSubmit: () => void | Promise<void>;
};

const PauseModal = ({ reason, submitting, error, onReasonChange, onClose, onSubmit }: PauseModalProps) => (
  <div onClick={onClose} className="fixed inset-0 z-[60] flex items-center justify-center bg-black/30 px-4 backdrop-blur-sm">
    <div onClick={(event) => event.stopPropagation()} className="w-full max-w-sm rounded-2xl bg-surface-container-lowest p-6 shadow-2xl">
      <h3 className="text-xl font-extrabold font-[var(--font-headline)] text-on-surface">Pause Promotion</h3>
      <p className="mt-1 text-sm text-on-surface-variant">Enter a reason before pausing your session.</p>
      <textarea
        value={reason}
        onChange={(event) => onReasonChange(event.target.value)}
        className="mt-4 h-28 w-full resize-none rounded-xl border-none bg-surface-container-low px-4 py-3 text-sm focus:ring-2 focus:ring-primary/40"
        placeholder="Pause reason"
        autoFocus
      />
      <div className="mt-4 flex gap-3">
        <button onClick={onClose} disabled={!!submitting}
          className="flex-1 rounded-full border border-outline-variant py-3 text-sm font-bold text-on-surface-variant disabled:opacity-60">
          Cancel
        </button>
        <button onClick={onSubmit} disabled={!!submitting || !reason.trim()}
          className="flex-1 rounded-full bg-primary py-3 text-sm font-bold text-on-primary disabled:opacity-60">
          {submitting === "pause" ? "Pausing..." : "Pause"}
        </button>
      </div>
      {error && <p className="mt-3 text-sm font-semibold text-error">{error}</p>}
    </div>
  </div>
);

function BonusSprintCard({ bonus, onOpen }: { bonus: BonusTodaySummary | null; onOpen: () => void }) {
  const totalTiers = bonus?.tiers.length || 0;
  const claimable = bonus?.tiers.filter((tier) => tier.claimable).length || 0;
  const validToday = bonus?.valid_count || 0;
  const nextTier = bonus?.tiers.find((tier) => !tier.claimed);
  const progress = nextTier ? Math.min(100, (validToday / Math.max(1, nextTier.threshold)) * 100) : totalTiers > 0 ? 100 : 0;

  return (
    <section className="bg-surface-container-lowest rounded-xl shadow-sm p-6 space-y-4">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-xs font-bold uppercase tracking-wider text-on-surface-variant">Daily Sprint</p>
          <h3 className="text-2xl font-extrabold font-[var(--font-headline)] mt-1 text-primary">今日冲单奖励</h3>
        </div>
        <div className="rounded-full bg-primary/10 p-3 text-primary">
          <Zap className="h-5 w-5" />
        </div>
      </div>
      {bonus?.rule ? (
        <>
          <div className="grid grid-cols-2 gap-3">
            <div className="rounded-xl bg-surface-container-low p-4">
              <p className="text-[10px] font-bold uppercase tracking-wider text-on-surface-variant">Valid Today</p>
              <p className="mt-1 text-2xl font-extrabold font-[var(--font-headline)]">{validToday}</p>
            </div>
            <div className="rounded-xl bg-surface-container-low p-4">
              <p className="text-[10px] font-bold uppercase tracking-wider text-on-surface-variant">Claimable</p>
              <p className="mt-1 text-2xl font-extrabold font-[var(--font-headline)]">{claimable}/{totalTiers}</p>
            </div>
          </div>
          <div className="h-2 w-full overflow-hidden rounded-full bg-surface-variant">
            <div className="h-full rounded-full bg-primary transition-all" style={{ width: `${progress}%` }} />
          </div>
        </>
      ) : (
        <p className="rounded-xl bg-surface-container-low p-4 text-sm text-on-surface-variant">暂无奖励规则</p>
      )}
      <button onClick={onOpen} className="w-full rounded-full bg-primary px-5 py-3 text-sm font-bold text-on-primary transition-all active:scale-[0.98]">
        Go to Sprint
      </button>
    </section>
  );
}

function getDefaultVipProgress(staff: HomeData["staff"]): VipProgress {
  const currentLevel = toNumber(staff.vip_level, 0);
  const currentValid = toNumber(staff.stats.total_valid, 0);
  if (currentLevel >= VIP_LABELS.length - 1) {
    return {
      current_level: VIP_LABELS.length - 1,
      current_valid: currentValid,
      next_level: null,
      next_level_required: currentValid,
      remaining_valid: 0,
      progress_percent: 100,
    };
  }

  const nextLevel = currentLevel + 1;
  const target = VIP_TARGETS[nextLevel] ?? currentValid;
  const remaining = Math.max(0, target - currentValid);
  const progress = target > 0 ? Math.min(100, (currentValid / target) * 100) : 100;

  return {
    current_level: currentLevel,
    current_valid: currentValid,
    next_level: nextLevel,
    next_level_required: target,
    remaining_valid: remaining,
    progress_percent: progress,
  };
}

function parseThresholds(raw: unknown): Array<{ level: number; threshold: number }> {
  if (!Array.isArray(raw)) return [];
  return raw
    .map((item) => {
      if (!item || typeof item !== "object") return null;
      const value = item as Record<string, unknown>;
      const level = toNumber(value.level, -1);
      const threshold = toNumber(value.threshold, -1);
      if (level < 0 || threshold < 0) return null;
      return { level, threshold };
    })
    .filter((item): item is { level: number; threshold: number } => item !== null)
    .sort((a, b) => a.level - b.level);
}

function normalizeVipProgress(raw: unknown, staff: HomeData["staff"]): VipProgress {
  const fallback = getDefaultVipProgress(staff);
  if (!raw || typeof raw !== "object") return fallback;

  const data = raw as Record<string, unknown>;
  const thresholds = parseThresholds(data.thresholds);
  const currentLevel = toNumber(data.current_level ?? data.vip_level, fallback.current_level);
  const currentValid = toNumber(data.current_valid ?? data.total_valid, fallback.current_valid);
  const nextByThreshold = thresholds.find((item) => currentValid < item.threshold);
  const nextLevelRaw = data.next_level ?? nextByThreshold?.level ?? null;
  const nextLevel = nextLevelRaw === null ? null : toNumber(nextLevelRaw, fallback.next_level ?? currentLevel + 1);
  const nextThreshold = toNumber(data.next_threshold, nextByThreshold?.threshold ?? fallback.next_level_required);
  const nextRequired = toNumber(
    data.next_level_required ?? data.next_required_valid ?? data.target_valid ?? nextThreshold,
    nextThreshold
  );
  const remaining = toNumber(
    data.remaining_valid ?? data.needed,
    nextLevel === null ? 0 : Math.max(0, nextRequired - currentValid)
  );
  const progress = toNumber(
    data.progress_percent ?? data.progress,
    nextLevel === null || nextRequired <= 0 ? 100 : (currentValid / nextRequired) * 100
  );

  if (nextLevel === null || currentLevel >= VIP_LABELS.length - 1) {
    return {
      current_level: Math.min(currentLevel, VIP_LABELS.length - 1),
      current_valid: currentValid,
      next_level: null,
      next_level_required: currentValid,
      remaining_valid: 0,
      progress_percent: 100,
    };
  }

  return {
    current_level: currentLevel,
    current_valid: currentValid,
    next_level: nextLevel,
    next_level_required: Math.max(nextRequired, 1),
    remaining_valid: Math.max(remaining, 0),
    progress_percent: Math.max(0, Math.min(progress, 100)),
  };
}

export default function PromoterHomePage() {
  const router = useRouter();
  const [data, setData] = useState<HomeData | null>(null);
  const [vipProgress, setVipProgress] = useState<VipProgress | null>(null);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState<WorkAction | null>(null);
  const [workError, setWorkError] = useState("");
  const [showPauseModal, setShowPauseModal] = useState(false);
  const [pauseReason, setPauseReason] = useState("");
  const [bonusToday, setBonusToday] = useState<BonusTodaySummary | null>(null);
  const [recentClaims, setRecentClaims] = useState<RecentClaimItem[]>([]);

  useEffect(() => { loadHome(); }, []);

  useEffect(() => {
    if (!showPauseModal) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape" && !submitting) {
        setShowPauseModal(false);
        setPauseReason("");
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [showPauseModal, submitting]);

  const closePauseModal = () => {
    if (submitting) return;
    setShowPauseModal(false);
    setPauseReason("");
  };

  const openBonusSprint = () => {
    router.push("/sprint");
  };

  const loadHome = async () => {
    try {
      const [res, bonusRes, recentClaimsRes] = await Promise.all([
        api.get<HomeData>("/api/promoter/home"),
        api.get<BonusTodaySummary>("/api/promoter/bonus/today").catch(() => null),
        api.get<{ items: RecentClaimItem[] }>("/api/promoter/recent-claims?limit=10")
          .then((response) => response.data.items)
          .catch(() => []),
      ]);
      setData(res.data);
      setBonusToday(bonusRes?.data || null);
      setRecentClaims(recentClaimsRes);
      try {
        const vipRes = await api.get("/api/promoter/vip-progress");
        setVipProgress(normalizeVipProgress(vipRes.data, res.data.staff));
      } catch {
        setVipProgress(getDefaultVipProgress(res.data.staff));
      }
    } catch {
      router.push("/staff-login");
    } finally {
      setLoading(false);
    }
  };

  const handleWorkAction = async (action: WorkAction) => {
    const reason = pauseReason.trim();
    if (action === "pause" && !reason) return;
    setSubmitting(action);
    setWorkError("");
    try {
      if (action === "pause") {
        await api.post("/api/promoter/work/pause", { reason });
        setShowPauseModal(false);
        setPauseReason("");
      } else if (action === "start") {
        await api.post("/api/promoter/work/start", {});
      } else if (action === "stop") {
        await api.post("/api/promoter/work/stop", {});
      } else {
        await api.post("/api/promoter/work/resume", {});
      }
      await loadHome();
    } catch (error) {
      const detail = getApiDetail(error);
      if (detail === "invalid_transition") {
        setShowPauseModal(false);
        setPauseReason("");
        setWorkError("State changed; refreshing...");
        await loadHome();
      } else {
        setWorkError("Action failed. Please try again.");
      }
    } finally {
      setSubmitting(null);
    }
  };

  if (loading || !data) {
    return <div className="min-h-screen flex items-center justify-center bg-surface text-on-surface-variant font-semibold">Loading...</div>;
  }

  const s = data.staff;
  const vip = vipProgress ?? getDefaultVipProgress(s);
  const nextLabel = vip.next_level !== null ? VIP_LABELS[vip.next_level] : "Max";
  const workStatus = getWorkStatus(s.work_status);
  const staffStatus = s.status ?? "active";
  const isBlocked = staffStatus !== "active" || s.risk_frozen === true;

  return (
    <div className="min-h-screen bg-surface">
      <header className="fixed top-0 w-full z-50 bg-white/70 backdrop-blur-md shadow-sm">
        <div className="flex justify-between items-center px-6 h-16 max-w-7xl mx-auto">
          <div className="flex items-center gap-3">
            <Menu className="w-6 h-6 text-primary" />
            <h1 className="text-xl font-bold tracking-tighter text-primary font-[var(--font-headline)]">GroundRewards</h1>
          </div>
          <button onClick={async () => {
            try { await api.post("/api/auth/staff/logout", {}); } catch { /* tolerate */ }
            clearAuth("staff");
            router.push("/staff-login");
          }} className="p-2 rounded-full hover:bg-primary/5">
            <LogOut className="w-6 h-6 text-outline" />
          </button>
        </div>
      </header>

      <main className="pt-20 px-4 max-w-lg mx-auto space-y-6">
        <section className="mt-4">
          <p className="text-on-surface-variant font-semibold text-sm">Welcome back, {s.name}</p>
          <h2 className="text-3xl font-extrabold font-[var(--font-headline)] tracking-tight mt-1">My Performance</h2>
        </section>

        {isBlocked && (
          <div className="rounded-xl border-2 border-error bg-error-container/20 p-4">
            <p className="text-sm font-bold text-error">
              {s.risk_frozen
                ? "Your account has been frozen by risk control. Contact admin."
                : staffStatus === "disabled"
                  ? "Your account is disabled. Contact admin to re-enable."
                  : "Your account is pending review. You cannot promote yet."}
            </p>
          </div>
        )}

        <WorkStatusCard staff={s} workStatus={workStatus} submitting={submitting} workError={workError} disabled={isBlocked}
          onAction={handleWorkAction} onOpenPause={() => { setWorkError(""); setShowPauseModal(true); }} />

        <section className="bg-surface-container-lowest rounded-xl shadow-sm p-6 space-y-4">
          <div className="flex items-start justify-between gap-3">
            <div>
              <p className="text-xs font-bold uppercase tracking-wider text-on-surface-variant">VIP Progress</p>
              <h3 className="text-2xl font-extrabold font-[var(--font-headline)] mt-1 text-primary">
                {VIP_LABELS[vip.current_level] ?? `VIP ${vip.current_level}`}
              </h3>
            </div>
            <span className="rounded-full bg-primary/10 px-3 py-1 text-xs font-bold text-primary">
              Next: {nextLabel}
            </span>
          </div>
          <div className="space-y-2">
            <div className="h-2 w-full rounded-full bg-surface-variant overflow-hidden">
              <div className="h-full rounded-full bg-primary transition-all" style={{ width: `${vip.progress_percent}%` }} />
            </div>
            <p className="text-sm text-on-surface-variant">
              {vip.remaining_valid > 0
                ? `${vip.remaining_valid} more valid claims needed to reach ${nextLabel}.`
                : "You are currently at the highest VIP level."}
            </p>
          </div>
        </section>

        <BonusSprintCard bonus={bonusToday} onOpen={openBonusSprint} />

        <section className="bg-surface-container-lowest rounded-xl shadow-sm p-6 space-y-3">
          <h3 className="text-sm font-bold uppercase tracking-wider text-on-surface-variant">Recent Claims</h3>
          {recentClaims.length === 0 ? (
            <p className="text-sm text-on-surface-variant">No claims yet.</p>
          ) : (
            <ul className="divide-y divide-outline-variant/40">
              {recentClaims.map((r) => (
                <li key={r.id} className="flex items-center justify-between py-2">
                  <div>
                    <p className="text-sm font-semibold">{r.phone_masked}</p>
                    <p className="text-xs text-on-surface-variant">{r.prize_type}{r.reward_code ? ` - ${r.reward_code}` : ""}</p>
                  </div>
                  <span className="text-xs text-on-surface-variant">{new Date(r.created_at).toLocaleString()}</span>
                </li>
              ))}
            </ul>
          )}
        </section>

        {/* Commission Card */}
        <section className="grid grid-cols-2 gap-4">
          <div className="col-span-2 bg-surface-container-lowest p-6 rounded-xl flex flex-col justify-between h-40">
            <div className="flex justify-between items-start">
              <span className="text-on-surface-variant font-bold text-xs uppercase tracking-widest">Commission Earned</span>
              <div className="bg-secondary-container p-2 rounded-full">
                <Wallet className="w-6 h-6 text-on-secondary-container" />
              </div>
            </div>
            <div>
              <div className="text-4xl font-extrabold font-[var(--font-headline)] text-primary">
                {toPoints(s.stats.total_commission)}
              </div>
              <div className="text-xs font-bold text-on-surface-variant mt-1">
                {VIP_LABELS[s.vip_level]} Level
              </div>
            </div>
          </div>

          <div className="bg-surface-container-low p-5 rounded-xl space-y-2">
            <span className="text-on-surface-variant font-bold text-[10px] uppercase tracking-wider">Total Referrals</span>
            <div className="text-2xl font-bold font-[var(--font-headline)]">{s.stats.total_valid}</div>
            <div className="h-1 w-full bg-surface-variant rounded-full overflow-hidden">
              <div className="h-full bg-primary rounded-full" style={{ width: `${Math.min(100, s.stats.total_valid)}%` }} />
            </div>
          </div>

          <div className="bg-surface-container-low p-5 rounded-xl space-y-2">
            <span className="text-on-surface-variant font-bold text-[10px] uppercase tracking-wider">Today Rewards</span>
            <div className="text-2xl font-bold font-[var(--font-headline)]">{data.today.valid_claims}</div>
            <div className="flex -space-x-2">
              <div className="w-6 h-6 rounded-full border-2 border-surface-container-low bg-surface-dim" />
              <div className="w-6 h-6 rounded-full border-2 border-surface-container-low bg-primary-container" />
              <div className="w-6 h-6 rounded-full border-2 border-surface-container-low bg-secondary-container" />
            </div>
          </div>
        </section>

        {/* QR Code Card */}
        <section>
          <div className="bg-primary p-6 rounded-xl text-on-primary shadow-lg shadow-primary/20 flex items-center justify-between overflow-hidden relative">
            <div className="absolute -right-10 -bottom-10 w-40 h-40 bg-white/10 rounded-full blur-3xl" />
            <div className="space-y-4 relative z-10">
              <div>
                <h3 className="text-xl font-bold font-[var(--font-headline)]">My QR Code</h3>
                <p className="text-sm opacity-80 mt-1">Scan to register a new lead</p>
              </div>
              <button onClick={() => router.push("/qrcode")}
                className="bg-on-primary text-primary px-6 py-2 rounded-full font-bold text-sm hover:bg-white active:scale-95 transition-all">
                Open QR Code
              </button>
            </div>
            <div className="bg-white p-3 rounded-2xl relative z-10">
              <div className="w-20 h-20 flex items-center justify-center">
                <QrCode className="w-16 h-16 text-primary" />
              </div>
            </div>
          </div>
        </section>

        {/* Team Stats */}
        <section className="grid grid-cols-3 gap-3">
          <div className="bg-surface-container-lowest p-4 rounded-xl text-center">
            <p className="text-2xl font-bold font-[var(--font-headline)] text-primary">{s.stats.level1_count}</p>
            <p className="text-[10px] font-bold text-on-surface-variant uppercase tracking-wider mt-1">Level 1</p>
          </div>
          <div className="bg-surface-container-lowest p-4 rounded-xl text-center">
            <p className="text-2xl font-bold font-[var(--font-headline)] text-primary">{s.stats.level2_count}</p>
            <p className="text-[10px] font-bold text-on-surface-variant uppercase tracking-wider mt-1">Level 2</p>
          </div>
          <div className="bg-surface-container-lowest p-4 rounded-xl text-center">
            <p className="text-2xl font-bold font-[var(--font-headline)] text-primary">{s.stats.level3_count}</p>
            <p className="text-[10px] font-bold text-on-surface-variant uppercase tracking-wider mt-1">Level 3</p>
          </div>
        </section>
      </main>

      {showPauseModal && (
        <PauseModal reason={pauseReason} submitting={submitting} error={workError}
          onReasonChange={setPauseReason} onClose={closePauseModal} onSubmit={() => handleWorkAction("pause")} />
      )}
    </div>
  );
}
