"use client";

import { useEffect, useState, useRef, useCallback } from "react";
import { useParams, useRouter } from "next/navigation";
import { ArrowLeft, ChevronDown, PartyPopper, LockOpen, CheckCircle, AlertCircle } from "lucide-react";
import api from "@/lib/api";

interface WheelItemData {
  id: string;
  display_name: string;
  type: "onsite" | "website";
}

interface SpinResult {
  result_index: number;
  wheel_item: { id: string; display_name: string; type: string; display_text: string; redirect_url?: string };
}

const COLORS = [
  "#0253cd", "#ffc69a", "#0048b5", "#8c4a00", "#789dff", "#ffb375",
  "#5c8bff", "#f395ee", "#618eff", "#e488df", "#0253cd", "#ffc69a",
];

export default function WheelPage() {
  const params = useParams();
  const router = useRouter();
  const code = params.code as string;
  const canvasRef = useRef<HTMLCanvasElement>(null);

  const [items, setItems] = useState<WheelItemData[]>([]);
  const [campaignId, setCampaignId] = useState("");
  const [spinning, setSpinning] = useState(false);
  const [result, setResult] = useState<SpinResult | null>(null);
  const [rotation, setRotation] = useState(0);
  const [showResult, setShowResult] = useState(false);

  // Phone verification state
  const [phone, setPhone] = useState("");
  const [otp, setOtp] = useState(["", "", "", ""]);
  const [smsEnabled, setSmsEnabled] = useState(false);
  const [phoneVerified, setPhoneVerified] = useState(false);
  const [otpSent, setOtpSent] = useState(false);
  const [verifying, setVerifying] = useState(false);
  const [claiming, setClaiming] = useState(false);
  const [claimResult, setClaimResult] = useState<{
    success: boolean; claim_id?: string; prize_type?: string;
    reward_code?: string; redirect_url?: string; message: string;
  } | null>(null);

  useEffect(() => {
    if (code) loadWheel();
  }, [code]);

  const loadWheel = async () => {
    try {
      const res = await api.get(`/api/claim/welcome/${code}`);
      setItems(res.data.wheel_items);
      setCampaignId(res.data.campaign.id);
    } catch {
      router.push(`/welcome/${code}`);
    }
  };

  const drawWheel = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas || items.length === 0) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const size = canvas.width;
    const center = size / 2;
    const radius = center - 10;
    const segAngle = (2 * Math.PI) / items.length;

    ctx.clearRect(0, 0, size, size);
    ctx.save();
    ctx.translate(center, center);
    ctx.rotate((rotation * Math.PI) / 180);
    ctx.translate(-center, -center);

    items.forEach((item, i) => {
      const startAngle = i * segAngle - Math.PI / 2;
      const endAngle = startAngle + segAngle;

      ctx.beginPath();
      ctx.moveTo(center, center);
      ctx.arc(center, center, radius, startAngle, endAngle);
      ctx.closePath();
      ctx.fillStyle = COLORS[i % COLORS.length];
      ctx.fill();
      ctx.strokeStyle = "rgba(255,255,255,0.3)";
      ctx.lineWidth = 2;
      ctx.stroke();

      // Text
      ctx.save();
      ctx.translate(center, center);
      ctx.rotate(startAngle + segAngle / 2);
      ctx.textAlign = "center";
      ctx.fillStyle = "#fff";
      ctx.font = "bold 13px 'Plus Jakarta Sans', sans-serif";
      ctx.fillText(item.display_name, radius * 0.6, 5);
      ctx.restore();
    });

    ctx.restore();

    // Center circle
    ctx.beginPath();
    ctx.arc(center, center, 30, 0, 2 * Math.PI);
    ctx.fillStyle = "#fff";
    ctx.fill();
    ctx.shadowColor = "rgba(0,0,0,0.2)";
    ctx.shadowBlur = 10;
    ctx.beginPath();
    ctx.arc(center, center, 24, 0, 2 * Math.PI);
    ctx.fillStyle = "#0253cd";
    ctx.fill();
    ctx.shadowBlur = 0;
  }, [items, rotation]);

  useEffect(() => { drawWheel(); }, [drawWheel]);

  const handleSpin = async () => {
    if (spinning || items.length === 0) return;
    setSpinning(true);
    setShowResult(false);

    try {
      const res = await api.post<SpinResult>("/api/claim/spin", {
        campaign_id: campaignId,
        staff_code: code,
      });
      setResult(res.data);

      const targetIndex = res.data.result_index;
      const segAngle = 360 / items.length;
      const targetAngle = 360 - (targetIndex * segAngle + segAngle / 2);
      const totalRotation = 360 * 8 + targetAngle; // 8 full spins + land on target

      let start: number | null = null;
      const duration = 5000;
      const startRotation = rotation;

      const animate = (timestamp: number) => {
        if (!start) start = timestamp;
        const elapsed = timestamp - start;
        const progress = Math.min(elapsed / duration, 1);
        // Ease out cubic
        const eased = 1 - Math.pow(1 - progress, 3);
        setRotation(startRotation + totalRotation * eased);

        if (progress < 1) {
          requestAnimationFrame(animate);
        } else {
          setSpinning(false);
          setShowResult(true);
        }
      };
      requestAnimationFrame(animate);
    } catch {
      setSpinning(false);
      alert("Failed to spin. Please try again.");
    }
  };

  const handleVerifyPhone = async () => {
    if (!phone) return;
    setVerifying(true);
    try {
      const res = await api.post("/api/claim/verify-phone", { phone, campaign_id: campaignId });
      if (res.data.verified) {
        setPhoneVerified(true);
      } else {
        setSmsEnabled(true);
        setOtpSent(true);
      }
    } catch {
      alert("Verification failed");
    } finally {
      setVerifying(false);
    }
  };

  const handleVerifyOtp = async () => {
    const otpCode = otp.join("");
    if (otpCode.length !== 4) return;
    setVerifying(true);
    try {
      const res = await api.post("/api/claim/verify-otp", { phone, code: otpCode });
      if (res.data.verified) {
        setPhoneVerified(true);
      } else {
        alert(res.data.message);
      }
    } catch {
      alert("OTP verification failed");
    } finally {
      setVerifying(false);
    }
  };

  const handleClaim = async () => {
    if (!result || !phoneVerified) return;
    setClaiming(true);
    try {
      const res = await api.post("/api/claim/complete", {
        campaign_id: campaignId,
        staff_code: code,
        wheel_item_id: result.wheel_item.id,
        phone,
        ip: "",
        device_fingerprint: "",
      });
      setClaimResult(res.data);
      if (res.data.success && res.data.claim_id) {
        setTimeout(() => router.push(`/result/${res.data.claim_id}`), 2000);
      }
    } catch (err: unknown) {
      const axiosErr = err as { response?: { data?: { detail?: string } } };
      setClaimResult({ success: false, message: axiosErr.response?.data?.detail || "Claim failed" });
    } finally {
      setClaiming(false);
    }
  };

  const handleOtpChange = (index: number, value: string) => {
    if (value.length > 1) return;
    const newOtp = [...otp];
    newOtp[index] = value;
    setOtp(newOtp);
    if (value && index < 3) {
      const next = document.getElementById(`otp-${index + 1}`);
      next?.focus();
    }
  };

  return (
    <div className="min-h-screen bg-surface">
      <header className="fixed top-0 w-full z-50 bg-white/70 backdrop-blur-md shadow-sm">
        <div className="flex justify-between items-center px-6 h-16 max-w-7xl mx-auto">
          <button onClick={() => router.back()} className="p-2 rounded-full hover:bg-primary/5">
            <ArrowLeft className="w-5 h-5 text-primary" />
          </button>
          <h1 className="text-xl font-bold tracking-tighter text-primary font-[var(--font-headline)]">GroundRewards</h1>
          <div className="w-10" />
        </div>
      </header>

      <main className="pt-20 pb-32 px-6 max-w-md mx-auto min-h-screen">
        {/* Headline */}
        <div className="text-center mb-8">
          <span className="inline-block px-4 py-1.5 rounded-full bg-secondary-container text-on-secondary-container text-xs font-extrabold uppercase tracking-[0.2em] mb-4">
            Exclusive Access
          </span>
          <h2 className="text-4xl font-[var(--font-headline)] font-extrabold leading-tight tracking-tight text-on-surface">
            Congratulations! <span className="text-primary block">Spin to get your reward</span>
          </h2>
        </div>

        {/* Wheel */}
        <div className="relative w-full aspect-square mb-12 flex items-center justify-center">
          <div className="absolute inset-0 bg-primary/10 rounded-full blur-3xl" />
          <div className="relative z-10 w-full h-full max-w-[320px] max-h-[320px] rounded-full p-2 bg-surface-container-lowest shadow-[0px_20px_40px_rgba(39,44,81,0.06)] border-[12px] border-surface-container">
            <canvas ref={canvasRef} width={280} height={280} className="w-full h-full rounded-full" />
            {/* Indicator */}
            <div className="absolute -top-4 left-1/2 -translate-x-1/2 z-30">
              <ChevronDown className="w-12 h-12 text-error drop-shadow-md" />
            </div>
          </div>

          {!showResult && (
            <button
              onClick={handleSpin}
              disabled={spinning}
              className="absolute -bottom-6 left-1/2 -translate-x-1/2 bg-gradient-to-r from-primary to-primary-dim text-white rounded-full px-10 py-5 shadow-2xl shadow-primary/40 font-[var(--font-headline)] font-bold text-lg active:scale-90 transition-all z-40 whitespace-nowrap disabled:opacity-60"
            >
              {spinning ? "SPINNING..." : "SPIN NOW"}
            </button>
          )}
        </div>

        {/* Result + Verification */}
        {showResult && result && (
          <div className="space-y-6">
            {/* Prize Result or No Prize */}
            {result.wheel_item.type === "none" ? (
              <div className="bg-surface-container-lowest rounded-xl p-6 shadow-sm text-center">
                <AlertCircle className="w-12 h-12 text-outline mb-3 mx-auto block" />
                <h3 className="font-[var(--font-headline)] font-extrabold text-2xl text-on-surface mb-2">
                  No Prize This Time
                </h3>
                <p className="text-on-surface-variant text-sm">{result.wheel_item.display_text}</p>
              </div>
            ) : (
              <>
                <div className="bg-surface-container-lowest rounded-xl p-6 shadow-sm text-center">
                  <PartyPopper className="w-12 h-12 text-secondary mb-3 mx-auto block" />
                  <h3 className="font-[var(--font-headline)] font-extrabold text-2xl text-on-surface mb-2">
                    You won: {result.wheel_item.display_name}!
                  </h3>
                  <p className="text-on-surface-variant text-sm">{result.wheel_item.display_text || "Complete verification to claim your prize"}</p>
                  {result.wheel_item.type === "website" && result.wheel_item.redirect_url && (
                    <a href={result.wheel_item.redirect_url} target="_blank" rel="noopener noreferrer"
                      className="inline-block mt-4 bg-primary text-white px-6 py-3 rounded-full font-bold text-sm shadow-md shadow-primary/20 hover:shadow-lg transition-all">
                      Go to Prize Website
                    </a>
                  )}
                </div>

            {/* Phone Verification */}
            {!claimResult && (
              <div className="bg-surface-container-lowest rounded-xl p-8 shadow-[0px_20px_40px_rgba(39,44,81,0.06)] relative overflow-hidden">
                <div className="absolute top-0 right-0 p-4 opacity-10">
                  <LockOpen className="w-16 h-16 text-on-surface" />
                </div>
                <div className="relative z-10">
                  <h3 className="font-[var(--font-headline)] font-bold text-xl mb-2 text-on-surface">Claim Your Prize</h3>
                  <p className="text-on-surface-variant text-sm mb-6 leading-relaxed">
                    Enter your mobile number to verify and securely link your reward to your profile.
                  </p>

                  <div className="space-y-4">
                    <div>
                      <label className="block text-xs font-bold text-outline uppercase tracking-widest mb-2 ml-1">Mobile Number</label>
                      <div className="relative">
                        <span className="absolute left-4 top-1/2 -translate-y-1/2 text-on-surface-variant font-bold">+</span>
                        <input
                          type="tel" value={phone}
                          onChange={(e) => setPhone(e.target.value)}
                          placeholder="639171234567"
                          disabled={phoneVerified}
                          className="w-full bg-surface-container-low border-none rounded-xl py-4 pl-10 pr-4 text-on-surface font-semibold focus:ring-2 focus:ring-primary/40 transition-all placeholder:text-outline/50 disabled:opacity-60"
                        />
                      </div>
                    </div>

                    {!phoneVerified && !otpSent && (
                      <button
                        onClick={handleVerifyPhone}
                        disabled={verifying || !phone}
                        className="w-full bg-surface-container-highest text-primary font-[var(--font-headline)] font-extrabold py-4 rounded-xl hover:bg-primary hover:text-white transition-all active:scale-[0.98] disabled:opacity-60"
                      >
                        {verifying ? "VERIFYING..." : "SEND VERIFICATION CODE"}
                      </button>
                    )}

                    {otpSent && smsEnabled && !phoneVerified && (
                      <>
                        <div>
                          <label className="block text-xs font-bold text-outline uppercase tracking-widest mb-2 ml-1">OTP Code</label>
                          <div className="grid grid-cols-4 gap-3">
                            {otp.map((digit, i) => (
                              <input
                                key={i} id={`otp-${i}`} type="text" maxLength={1}
                                value={digit} onChange={(e) => handleOtpChange(i, e.target.value)}
                                className="w-full bg-surface-container-low border-none rounded-xl py-4 text-center font-bold text-xl text-primary focus:ring-2 focus:ring-primary/40"
                              />
                            ))}
                          </div>
                        </div>
                        <button
                          onClick={handleVerifyOtp}
                          disabled={verifying}
                          className="w-full bg-surface-container-highest text-primary font-[var(--font-headline)] font-extrabold py-4 rounded-xl hover:bg-primary hover:text-white transition-all disabled:opacity-60"
                        >
                          VERIFY OTP
                        </button>
                      </>
                    )}

                    {phoneVerified && (
                      <button
                        onClick={handleClaim}
                        disabled={claiming}
                        className="w-full bg-gradient-to-r from-secondary to-secondary-dim text-white font-[var(--font-headline)] font-extrabold py-5 rounded-full shadow-lg shadow-secondary/20 active:scale-[0.97] transition-all disabled:opacity-60"
                      >
                        {claiming ? "CLAIMING..." : "VERIFY & CLAIM REWARD"}
                      </button>
                    )}
                  </div>
                </div>
              </div>
            )}

            {/* Claim Result */}
            {claimResult && (
              <div className={`rounded-xl p-6 text-center ${claimResult.success ? "bg-green-50" : "bg-red-50"}`}>
                {claimResult.success ? (
                  <CheckCircle className="w-12 h-12 text-green-600 mb-3 mx-auto block" />
                ) : (
                  <AlertCircle className="w-12 h-12 text-error mb-3 mx-auto block" />
                )}
                <h3 className={`font-bold text-xl mb-2 ${claimResult.success ? "text-green-700" : "text-error"}`}>
                  {claimResult.success ? "Prize Claimed!" : "Claim Failed"}
                </h3>
                <p className="text-sm text-on-surface-variant">{claimResult.message}</p>
                {claimResult.reward_code && (
                  <div className="mt-4 p-3 bg-white rounded-lg">
                    <p className="text-xs font-bold text-outline uppercase tracking-wider mb-1">Your Reward Code</p>
                    <p className="font-mono text-lg font-bold text-primary">{claimResult.reward_code}</p>
                  </div>
                )}
                {claimResult.redirect_url && (
                  <a href={claimResult.redirect_url} target="_blank" rel="noopener noreferrer"
                    className="inline-block mt-4 bg-primary text-white px-6 py-3 rounded-full font-bold text-sm">
                    Go to Prize Website
                  </a>
                )}
              </div>
            )}
              </>
            )}
          </div>
        )}
      </main>
    </div>
  );
}
