"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Menu, LogOut, Wallet, QrCode } from "lucide-react";
import api from "@/lib/api";
import { clearAuth } from "@/lib/auth";

interface HomeData {
  staff: {
    id: string; name: string; staff_no: string; vip_level: number;
    invite_code: string; stats: { total_scans: number; total_valid: number; total_commission: number; team_size: number; level1_count: number; level2_count: number; level3_count: number };
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

function toPoints(value: number) {
  return `${value.toFixed(2)}P`;
}

function toNumber(value: unknown, fallback = 0) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
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

function normalizeVipProgress(raw: unknown, staff: HomeData["staff"]): VipProgress {
  const fallback = getDefaultVipProgress(staff);
  if (!raw || typeof raw !== "object") return fallback;

  const data = raw as Record<string, unknown>;
  const currentLevel = toNumber(data.current_level ?? data.vip_level, fallback.current_level);
  const currentValid = toNumber(data.current_valid ?? data.total_valid, fallback.current_valid);
  const nextLevelRaw = data.next_level;
  const nextLevel = nextLevelRaw === null ? null : toNumber(nextLevelRaw, fallback.next_level ?? currentLevel + 1);
  const nextRequired = toNumber(
    data.next_level_required ?? data.next_required_valid ?? data.target_valid,
    fallback.next_level_required
  );
  const remaining = toNumber(
    data.remaining_valid,
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

  useEffect(() => { loadHome(); }, []);

  const loadHome = async () => {
    try {
      const res = await api.get("/api/promoter/home");
      setData(res.data);
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

  if (loading || !data) {
    return <div className="min-h-screen flex items-center justify-center bg-surface text-on-surface-variant font-semibold">Loading...</div>;
  }

  const s = data.staff;
  const vip = vipProgress ?? getDefaultVipProgress(s);
  const nextLabel = vip.next_level !== null ? VIP_LABELS[vip.next_level] : "Max";

  return (
    <div className="min-h-screen bg-surface">
      <header className="fixed top-0 w-full z-50 bg-white/70 backdrop-blur-md shadow-sm">
        <div className="flex justify-between items-center px-6 h-16 max-w-7xl mx-auto">
          <div className="flex items-center gap-3">
            <Menu className="w-6 h-6 text-primary" />
            <h1 className="text-xl font-bold tracking-tighter text-primary font-[var(--font-headline)]">GroundRewards</h1>
          </div>
          <button onClick={() => { clearAuth(); router.push("/staff-login"); }} className="p-2 rounded-full hover:bg-primary/5">
            <LogOut className="w-6 h-6 text-outline" />
          </button>
        </div>
      </header>

      <main className="pt-20 px-4 max-w-lg mx-auto space-y-6">
        <section className="mt-4">
          <p className="text-on-surface-variant font-semibold text-sm">Welcome back, {s.name}</p>
          <h2 className="text-3xl font-extrabold font-[var(--font-headline)] tracking-tight mt-1">My Performance</h2>
        </section>

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
    </div>
  );
}
