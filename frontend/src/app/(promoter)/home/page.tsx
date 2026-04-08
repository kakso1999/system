"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Menu, LogOut, Wallet, QrCode, Home, Users } from "lucide-react";
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

export default function PromoterHomePage() {
  const router = useRouter();
  const [data, setData] = useState<HomeData | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => { loadHome(); }, []);

  const loadHome = async () => {
    try {
      const res = await api.get("/api/promoter/home");
      setData(res.data);
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

  return (
    <div className="min-h-screen bg-surface pb-24">
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
                ${s.stats.total_commission.toFixed(2)}
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

      {/* Bottom Nav */}
      <nav className="fixed bottom-0 left-0 w-full flex justify-around items-end pb-4 px-4 bg-white/80 backdrop-blur-xl z-50 rounded-t-[2rem] shadow-[0_-10px_30px_rgba(0,0,0,0.05)]">
        <a href="/home" className="flex flex-col items-center justify-center text-primary py-3">
          <Home className="w-6 h-6" />
          <span className="text-[11px] font-bold uppercase tracking-widest mt-1">Home</span>
        </a>
        <a href="/qrcode" className="flex flex-col items-center justify-center bg-primary text-white rounded-full w-14 h-14 -mt-6 shadow-lg shadow-primary/20">
          <QrCode className="w-6 h-6" />
        </a>
        <a href="/team" className="flex flex-col items-center justify-center text-slate-400 py-3 hover:text-primary">
          <Users className="w-6 h-6" />
          <span className="text-[11px] font-bold uppercase tracking-widest mt-1">Team</span>
        </a>
      </nav>
    </div>
  );
}
