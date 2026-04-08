"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import api from "@/lib/api";

interface ClaimResult {
  id: string;
  prize_type: string;
  reward_code: string | null;
  status: string;
  created_at: string;
  wheel_item_name?: string;
  redirect_url?: string;
}

export default function ResultPage() {
  const params = useParams();
  const claimId = params.id as string;
  const [data, setData] = useState<ClaimResult | null>(null);
  const [error, setError] = useState("");

  useEffect(() => {
    if (claimId) loadResult();
  }, [claimId]);

  const loadResult = async () => {
    try {
      const res = await api.get(`/api/claim/result/${claimId}`);
      setData(res.data);
    } catch {
      setError("Result not found");
    }
  };

  if (error) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-surface p-6">
        <div className="text-center">
          <span className="material-symbols-outlined text-error text-6xl mb-4 block">error</span>
          <p className="text-on-surface-variant">{error}</p>
        </div>
      </div>
    );
  }

  if (!data) {
    return <div className="min-h-screen flex items-center justify-center bg-surface">Loading...</div>;
  }

  const isSuccess = data.status === "success";

  return (
    <div className="min-h-screen bg-surface">
      <header className="fixed top-0 w-full z-50 bg-white/70 backdrop-blur-md shadow-sm">
        <div className="flex justify-center items-center h-16">
          <h1 className="text-xl font-bold tracking-tighter text-primary font-[var(--font-headline)]">GroundRewards</h1>
        </div>
      </header>

      <main className="pt-24 pb-12 px-6 max-w-md mx-auto">
        <div className="text-center mb-8">
          <div className={`inline-flex items-center justify-center w-20 h-20 rounded-full mb-6 ${isSuccess ? "bg-green-100" : "bg-red-100"}`}>
            <span className={`material-symbols-outlined text-5xl ${isSuccess ? "text-green-600" : "text-error"}`}
              style={{ fontVariationSettings: "'FILL' 1" }}>
              {isSuccess ? "check_circle" : "cancel"}
            </span>
          </div>
          <h2 className="text-3xl font-[var(--font-headline)] font-extrabold tracking-tight">
            {isSuccess ? "Congratulations!" : "Oops!"}
          </h2>
          <p className="text-on-surface-variant mt-2">
            {isSuccess ? "Your prize has been claimed successfully" : "Something went wrong"}
          </p>
        </div>

        {isSuccess && (
          <div className="space-y-4">
            {data.prize_type === "onsite" && (
              <div className="bg-surface-container-lowest rounded-xl p-6 shadow-sm text-center">
                <span className="material-symbols-outlined text-secondary text-4xl mb-3 block" style={{ fontVariationSettings: "'FILL' 1" }}>redeem</span>
                <h3 className="font-bold text-lg mb-2">On-Site Prize</h3>
                <p className="text-on-surface-variant text-sm">Please show this screen to the promoter to collect your prize.</p>
                <div className="mt-4 bg-green-50 p-4 rounded-xl">
                  <p className="font-bold text-green-700 text-lg">CONFIRMED</p>
                </div>
              </div>
            )}

            {data.prize_type === "website" && (
              <div className="bg-surface-container-lowest rounded-xl p-6 shadow-sm text-center">
                <span className="material-symbols-outlined text-primary text-4xl mb-3 block" style={{ fontVariationSettings: "'FILL' 1" }}>stars</span>
                <h3 className="font-bold text-lg mb-2">Grand Prize</h3>
                <p className="text-on-surface-variant text-sm mb-4">Complete your claim at the partner website.</p>

                {data.reward_code && (
                  <div className="bg-primary/5 p-4 rounded-xl mb-4">
                    <p className="text-xs font-bold text-outline uppercase tracking-wider mb-1">Reward Code</p>
                    <p className="font-mono text-xl font-bold text-primary">{data.reward_code}</p>
                    <button
                      onClick={() => navigator.clipboard.writeText(data.reward_code!)}
                      className="mt-2 text-xs text-primary font-bold hover:underline"
                    >
                      Copy Code
                    </button>
                  </div>
                )}

                {data.redirect_url && (
                  <a href={data.redirect_url} target="_blank" rel="noopener noreferrer"
                    className="inline-block w-full bg-gradient-to-r from-primary to-primary-dim text-white py-4 rounded-full font-bold shadow-lg shadow-primary/20 hover:shadow-xl transition-all"
                  >
                    Go to Prize Website
                  </a>
                )}
              </div>
            )}
          </div>
        )}
      </main>
    </div>
  );
}
