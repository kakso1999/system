"use client";

import { useEffect, useState, useRef } from "react";
import { useParams, useRouter, useSearchParams } from "next/navigation";
import { AlertCircle, ChevronRight, Gift, Star, Sparkles } from "lucide-react";
import confetti from "canvas-confetti";
import api, { resolveApiUrl } from "@/lib/api";
import { getPublicSettings, type PublicSettings } from "@/lib/public-settings";
import { readSessionToken, writeSessionToken } from "@/lib/session-token";

interface WheelItemData {
  id: string;
  display_name: string;
  type: "onsite" | "website";
  weight: number;
  image_url: string;
}

interface WelcomeData {
  staff_name: string;
  campaign: {
    id: string;
    name: string;
    description: string;
    rules_text: string;
    prize_url: string;
    no_prize_weight?: number | null;
  };
  wheel_items: WheelItemData[];
}

type Step = "welcome" | "prizes" | "wheel";

export default function WelcomePage() {
  const params = useParams();
  const router = useRouter();
  const searchParams = useSearchParams();
  const code = params.code as string;
  const [sessionToken, setSessionToken] = useState<string | null>(null);
  const token = sessionToken ?? readSessionToken(code) ?? searchParams.get("session_token");
  const [data, setData] = useState<WelcomeData | null>(null);
  const [publicSettings, setPublicSettings] = useState<PublicSettings | null>(null);
  const [error, setError] = useState("");
  const [step, setStep] = useState<Step>("welcome");
  const [activeSlide, setActiveSlide] = useState(0);
  const confettiFired = useRef(false);

  useEffect(() => {
    if (!code) return;
    const fromUrl = searchParams.get("session_token");
    if (fromUrl) {
      writeSessionToken(code, fromUrl);
      router.replace(`/welcome/${code}`);
      setSessionToken(fromUrl);
    } else {
      setSessionToken(readSessionToken(code));
    }
  }, [code, searchParams, router]);

  useEffect(() => {
    let active = true;
    getPublicSettings().then((settings) => {
      if (active) setPublicSettings(settings);
    });
    return () => { active = false; };
  }, []);

  useEffect(() => {
    if (!code) return;
    loadWelcome();
  }, [code, token]);

  // Fire confetti on welcome step
  useEffect(() => {
    if (step === "welcome" && data && !confettiFired.current) {
      confettiFired.current = true;
      setTimeout(() => {
        confetti({ particleCount: 100, spread: 70, origin: { y: 0.6 }, colors: ["#0253cd", "#ffc69a", "#789dff", "#f395ee", "#ffb375"] });
        setTimeout(() => confetti({ particleCount: 60, spread: 120, origin: { y: 0.5 } }), 300);
      }, 400);
    }
  }, [step, data]);

  const loadWelcome = async () => {
    try {
      const res = await api.get(`/api/claim/welcome/${code}`, {
        headers: token ? { "X-Session-Token": token } : {},
      });
      setData(res.data);
    } catch {
      setError("Activity not found or has ended");
    }
  };

  if (error) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-surface p-6">
        <div className="text-center">
          <AlertCircle className="w-16 h-16 text-error mb-4 mx-auto" />
          <h2 className="text-2xl font-bold font-[var(--font-headline)] text-on-surface mb-2">Oops!</h2>
          <p className="text-on-surface-variant">{error}</p>
        </div>
      </div>
    );
  }

  if (!data) {
    return <div className="min-h-screen flex items-center justify-center bg-surface text-on-surface-variant font-semibold">Loading...</div>;
  }

  // Step 1: Welcome with confetti
  if (step === "welcome") {
    return (
      <div className="min-h-screen bg-surface flex flex-col">
        <header className="fixed top-0 w-full z-50 bg-white/70 backdrop-blur-md shadow-sm">
          <div className="flex justify-center items-center h-16">
            <h1 className="text-xl font-bold tracking-tighter text-primary font-[var(--font-headline)]">{publicSettings?.project_name || "GroundRewards"}</h1>
          </div>
        </header>

        <main className="flex-1 flex flex-col items-center justify-center px-6 pt-20 pb-12">
          {/* Animated gift icon */}
          <div className="relative mb-8">
            <div className="w-32 h-32 bg-gradient-to-br from-primary to-primary-dim rounded-3xl flex items-center justify-center shadow-2xl shadow-primary/30 animate-bounce" style={{ animationDuration: "2s" }}>
              <Gift className="w-16 h-16 text-white" />
            </div>
            <div className="absolute -top-3 -right-3 w-10 h-10 bg-secondary-container rounded-full flex items-center justify-center animate-pulse">
              <Sparkles className="w-5 h-5 text-secondary" />
            </div>
          </div>

          <span className="inline-block px-5 py-2 rounded-full bg-secondary-container text-on-secondary-container text-xs font-extrabold uppercase tracking-[0.25em] mb-6">
            Exclusive Access
          </span>

          <h1 className="text-5xl font-[var(--font-headline)] font-extrabold tracking-tight text-on-surface mb-3 text-center">
            Welcome!
          </h1>

          <h2 className="text-3xl font-[var(--font-headline)] font-extrabold text-primary mb-4 text-center">
            {data.campaign.name}
          </h2>

          <p className="text-on-surface-variant text-center max-w-sm leading-relaxed mb-10">
            {data.campaign.description || publicSettings?.activity_desc || "You've been invited to an exclusive prize draw. Amazing rewards await!"}
          </p>

          <button
            onClick={() => setStep("prizes")}
            className="w-full max-w-sm bg-gradient-to-r from-primary to-primary-dim text-white rounded-full px-10 py-5 shadow-2xl shadow-primary/40 font-[var(--font-headline)] font-bold text-lg active:scale-95 transition-all flex items-center justify-center gap-2"
          >
            View Prizes <ChevronRight className="w-5 h-5" />
          </button>

          <p className="text-center text-[11px] text-outline mt-6">
            By proceeding, you agree to our Terms & Conditions
          </p>
        </main>
      </div>
    );
  }

  // Step 2: Prize showcase with fan/carousel
  if (step === "prizes") {
    const items = data.wheel_items;
    const noPrizeWeight = data.campaign.no_prize_weight ?? 10;
    const totalWeight = items.reduce((s, i) => s + (i.weight || 0), 0) + noPrizeWeight;
    return (
      <div className="min-h-screen bg-surface flex flex-col">
        <header className="fixed top-0 w-full z-50 bg-white/70 backdrop-blur-md shadow-sm">
          <div className="flex justify-center items-center h-16">
            <h1 className="text-xl font-bold tracking-tighter text-primary font-[var(--font-headline)]">{publicSettings?.project_name || "GroundRewards"}</h1>
          </div>
        </header>

        <main className="flex-1 flex flex-col items-center px-6 pt-24 pb-12">
          <h2 className="text-2xl font-[var(--font-headline)] font-extrabold tracking-tight text-on-surface mb-2">
            Amazing Prizes
          </h2>
          <p className="text-on-surface-variant text-sm mb-8">Swipe to see what you could win</p>

          {/* Fan card carousel */}
          <div className="relative w-full max-w-sm h-80 mb-8">
            {items.map((item, i) => {
              const offset = i - activeSlide;
              const isActive = offset === 0;
              const pct = totalWeight > 0 ? (((item.weight || 0) / totalWeight) * 100).toFixed(1) : "0";
              return (
                <div
                  key={item.id}
                  onClick={() => setActiveSlide(i)}
                  className="absolute inset-0 transition-all duration-500 ease-out cursor-pointer"
                  style={{
                    transform: `translateX(${offset * 40}px) scale(${isActive ? 1 : 0.85}) rotateY(${offset * -8}deg)`,
                    opacity: Math.abs(offset) > 2 ? 0 : 1 - Math.abs(offset) * 0.25,
                    zIndex: 10 - Math.abs(offset),
                  }}
                >
                  <div className={`w-full h-full rounded-3xl overflow-hidden shadow-2xl ${isActive ? "shadow-primary/30" : "shadow-black/10"} border-2 ${isActive ? "border-primary/20" : "border-white/50"}`}>
                    {/* Prize image or gradient */}
                    {item.image_url ? (
                      <div className="w-full h-3/5 bg-surface-container-low">
                        <img src={resolveApiUrl(item.image_url)} alt={item.display_name}
                          className="w-full h-full object-cover" />
                      </div>
                    ) : (
                      <div className={`w-full h-3/5 flex items-center justify-center ${
                        item.type === "website"
                          ? "bg-gradient-to-br from-primary to-primary-dim"
                          : "bg-gradient-to-br from-secondary to-secondary-dim"
                      }`}>
                        {item.type === "website"
                          ? <Star className="w-20 h-20 text-white/80" />
                          : <Gift className="w-20 h-20 text-white/80" />}
                      </div>
                    )}
                    {/* Prize info */}
                    <div className="p-5 bg-white h-2/5 flex flex-col justify-center">
                      <span className={`text-[10px] font-bold uppercase tracking-wider mb-1 ${
                        item.type === "website" ? "text-primary" : "text-secondary"
                      }`}>
                        {item.type === "website" ? "Grand Prize" : "Instant Win"}
                      </span>
                      <h3 className="text-xl font-[var(--font-headline)] font-extrabold text-on-surface">
                        {item.display_name}
                      </h3>
                      <p className="text-xs text-on-surface-variant mt-1">{pct}% chance</p>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>

          {/* Dots indicator */}
          <div className="flex gap-2 mb-8">
            {items.map((_, i) => (
              <button key={i} onClick={() => setActiveSlide(i)}
                className={`w-2.5 h-2.5 rounded-full transition-all ${i === activeSlide ? "bg-primary w-6" : "bg-outline-variant"}`} />
            ))}
          </div>

          <button
            onClick={() => router.push(`/wheel/${code}`)}
            className="w-full max-w-sm bg-gradient-to-r from-primary to-primary-dim text-white rounded-full px-10 py-5 shadow-2xl shadow-primary/40 font-[var(--font-headline)] font-bold text-lg active:scale-95 transition-all flex items-center justify-center gap-2"
          >
            SPIN THE WHEEL <ChevronRight className="w-5 h-5" />
          </button>
        </main>
      </div>
    );
  }

  return null;
}
