"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import { AlertCircle, CheckCircle, XCircle, Gift, Star } from "lucide-react";
import api from "@/lib/api";
import { copyToClipboard } from "@/lib/clipboard";

interface ClaimResult {
  id: string;
  prize_type: string;
  reward_code: string | null;
  status: string;
  created_at: string;
  wheel_item_name?: string;
  redirect_url?: string;
}

const RESULT_UNAVAILABLE = "Result expired or not available from this device.";

export default function ResultPage() {
  const params = useParams();
  const claimId = params.id as string;
  const [data, setData] = useState<ClaimResult | null>(null);
  const [error, setError] = useState("");

  useEffect(() => {
    if (claimId) loadResult();
  }, [claimId]);

  const loadResult = async () => {
    const token = sessionStorage.getItem("result_token:" + claimId) || new URLSearchParams(window.location.search).get("result_token");
    if (!token) {
      setError(RESULT_UNAVAILABLE);
      return;
    }
    try {
      const res = await api.get(`/api/claim/result/${claimId}?result_token=${encodeURIComponent(token)}`);
      setData(res.data);
    } catch (err: unknown) {
      const axiosErr = err as { response?: { status?: number } };
      setError(axiosErr.response?.status === 403 ? RESULT_UNAVAILABLE : "Result not found");
    }
  };

  if (error) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-surface p-6">
        <div className="text-center">
          <AlertCircle className="w-16 h-16 text-error mb-4 mx-auto block" />
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
            {isSuccess ? (
              <CheckCircle className="w-12 h-12 text-green-600" />
            ) : (
              <XCircle className="w-12 h-12 text-error" />
            )}
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
            {data.reward_code && (
              <div className="rounded-2xl border-2 border-primary bg-primary/10 p-5 text-center">
                <p className="text-xs font-extrabold text-primary uppercase tracking-[0.2em] mb-2">Your Reward Code</p>
                <p className="font-mono text-3xl font-extrabold text-primary tracking-wider">{data.reward_code}</p>
                <button
                  onClick={() => copyToClipboard(data.reward_code!)}
                  className="mt-3 text-sm text-primary font-bold hover:underline"
                >
                  Copy Code
                </button>
              </div>
            )}

            {data.prize_type === "onsite" && (
              <div className="bg-surface-container-lowest rounded-xl p-6 shadow-sm text-center">
                <Gift className="w-10 h-10 text-secondary mb-3 mx-auto block" />
                <h3 className="font-bold text-lg mb-2">On-Site Prize</h3>
                <p className="text-on-surface-variant text-sm">Please show this screen to the promoter to collect your prize.</p>
                <div className="mt-4 bg-green-50 p-4 rounded-xl">
                  <p className="font-bold text-green-700 text-lg">CONFIRMED</p>
                </div>
              </div>
            )}

            {data.prize_type === "website" && (
              <div className="bg-surface-container-lowest rounded-xl p-6 shadow-sm text-center">
                <Star className="w-10 h-10 text-primary mb-3 mx-auto block" />
                <h3 className="font-bold text-lg mb-2">Grand Prize</h3>
                <p className="text-on-surface-variant text-sm mb-4">Complete your claim at the partner website.</p>

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
