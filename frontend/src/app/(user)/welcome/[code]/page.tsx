"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import api from "@/lib/api";
import type { WheelItem } from "@/types";

interface WelcomeData {
  staff_name: string;
  campaign: {
    id: string;
    name: string;
    description: string;
    rules_text: string;
    prize_url: string;
  };
  wheel_items: WheelItem[];
}

export default function WelcomePage() {
  const params = useParams();
  const router = useRouter();
  const code = params.code as string;
  const [data, setData] = useState<WelcomeData | null>(null);
  const [error, setError] = useState("");

  useEffect(() => {
    if (code) loadWelcome();
  }, [code]);

  const loadWelcome = async () => {
    try {
      const res = await api.get(`/api/claim/welcome/${code}`);
      setData(res.data);
    } catch {
      setError("Activity not found or has ended");
    }
  };

  if (error) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-surface p-6">
        <div className="text-center">
          <span className="material-symbols-outlined text-error text-6xl mb-4 block">error</span>
          <h2 className="text-2xl font-bold font-[var(--font-headline)] text-on-surface mb-2">Oops!</h2>
          <p className="text-on-surface-variant">{error}</p>
        </div>
      </div>
    );
  }

  if (!data) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-surface">
        <div className="text-on-surface-variant font-semibold">Loading...</div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-surface">
      <header className="fixed top-0 w-full z-50 bg-white/70 backdrop-blur-md shadow-sm">
        <div className="flex justify-center items-center h-16">
          <h1 className="text-xl font-bold tracking-tighter text-primary font-[var(--font-headline)]">GroundRewards</h1>
        </div>
      </header>

      <main className="pt-24 pb-12 px-6 max-w-md mx-auto">
        <div className="text-center mb-8">
          <span className="inline-block px-4 py-1.5 rounded-full bg-secondary-container text-on-secondary-container text-xs font-extrabold uppercase tracking-[0.2em] mb-4">
            Exclusive Access
          </span>
          <h2 className="text-3xl font-[var(--font-headline)] font-extrabold leading-tight tracking-tight text-on-surface">
            Welcome! <span className="text-primary block">{data.campaign.name}</span>
          </h2>
          <p className="text-on-surface-variant mt-3 text-sm leading-relaxed">
            {data.campaign.description}
          </p>
        </div>

        {/* Prize Preview */}
        <div className="bg-surface-container-lowest rounded-xl p-6 shadow-sm mb-8">
          <h3 className="font-bold text-sm text-on-surface-variant uppercase tracking-wider mb-4">Available Prizes</h3>
          <div className="space-y-3">
            {data.wheel_items.map((item) => (
              <div key={item.id} className="flex items-center gap-3 p-3 bg-surface-container-low rounded-xl">
                <div className={`w-10 h-10 rounded-full flex items-center justify-center ${
                  item.type === "website" ? "bg-secondary-container/30" : "bg-primary-container/30"
                }`}>
                  <span className={`material-symbols-outlined ${
                    item.type === "website" ? "text-secondary" : "text-primary"
                  }`}>
                    {item.type === "website" ? "stars" : "redeem"}
                  </span>
                </div>
                <span className="font-bold text-sm">{item.display_name}</span>
              </div>
            ))}
          </div>
        </div>

        {/* Rules */}
        {data.campaign.rules_text && (
          <div className="text-xs text-on-surface-variant bg-surface-container-low rounded-xl p-4 mb-8">
            <p className="font-bold uppercase tracking-wider mb-2">Rules</p>
            <p className="leading-relaxed">{data.campaign.rules_text}</p>
          </div>
        )}

        {/* Start Button */}
        <button
          onClick={() => router.push(`/wheel/${code}`)}
          className="w-full bg-gradient-to-r from-primary to-primary-dim text-white rounded-full px-10 py-5 shadow-2xl shadow-primary/40 font-[var(--font-headline)] font-bold text-lg active:scale-90 transition-all"
        >
          SPIN THE WHEEL
        </button>

        <p className="text-center text-[11px] text-outline mt-4">
          By proceeding, you agree to our Terms &amp; Conditions
        </p>
      </main>
    </div>
  );
}
