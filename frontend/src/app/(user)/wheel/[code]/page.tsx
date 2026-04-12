"use client";

import { useEffect, useState, useRef, useCallback } from "react";
import { useParams, useRouter } from "next/navigation";
import { ArrowLeft, ChevronDown, PartyPopper, LockOpen, CheckCircle, AlertCircle } from "lucide-react";
import api from "@/lib/api";
import { copyToClipboard } from "@/lib/clipboard";

interface WheelItemData {
  id: string;
  display_name: string;
  type: "onsite" | "website";
  weight: number;
}

interface SpinResult {
  result_index: number;
  wheel_item: { id: string; display_name: string; type: string; display_text: string; redirect_url?: string };
}

const COLORS = [
  "#0253cd", "#ffc69a", "#0048b5", "#8c4a00", "#789dff", "#ffb375",
  "#5c8bff", "#f395ee", "#618eff", "#e488df", "#0253cd", "#ffc69a",
];

function generateDeviceFingerprint(): string {
  const nav = window.navigator;
  const screen = window.screen;
  const raw = [
    nav.userAgent,
    nav.language,
    screen.width + "x" + screen.height,
    screen.colorDepth,
    new Date().getTimezoneOffset(),
    nav.hardwareConcurrency || "",
    (nav as unknown as Record<string, unknown>).deviceMemory || "",
    nav.maxTouchPoints || 0,
  ].join("|");
  // Simple hash
  let hash = 0;
  for (let i = 0; i < raw.length; i++) {
    const chr = raw.charCodeAt(i);
    hash = ((hash << 5) - hash) + chr;
    hash |= 0;
  }
  return "fp_" + Math.abs(hash).toString(36);
}

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
  const [deviceFp, setDeviceFp] = useState("");

  // Phone verification state
  const [phone, setPhone] = useState("");
  const [otp, setOtp] = useState(["", "", "", "", "", ""]);
  const [smsEnabled, setSmsEnabled] = useState(false);
  const [phoneVerified, setPhoneVerified] = useState(false);
  const [otpSent, setOtpSent] = useState(false);
  const [verifying, setVerifying] = useState(false);
  const [claiming, setClaiming] = useState(false);
  const [demoCode, setDemoCode] = useState<string | null>(null);
  const [otpCooldown, setOtpCooldown] = useState(0);
  const [claimResult, setClaimResult] = useState<{
    success: boolean; claim_id?: string; prize_type?: string;
    reward_code?: string; redirect_url?: string; message: string;
  } | null>(null);
  const [redirectCountdown, setRedirectCountdown] = useState<number | null>(null);

  useEffect(() => {
    setDeviceFp(generateDeviceFingerprint());
  }, []);

  useEffect(() => {
    if (code) loadWheel();
  }, [code]);

  // OTP cooldown timer
  useEffect(() => {
    if (otpCooldown <= 0) return;
    const timer = setInterval(() => setOtpCooldown(c => c - 1), 1000);
    return () => clearInterval(timer);
  }, [otpCooldown]);

  useEffect(() => {
    if (!claimResult?.success || !claimResult.claim_id || redirectCountdown === null) return;
    if (redirectCountdown <= 0) {
      router.push(`/result/${claimResult.claim_id}`);
      return;
    }
    const timer = setTimeout(() => setRedirectCountdown(prev => (prev === null ? null : prev - 1)), 1000);
    return () => clearTimeout(timer);
  }, [claimResult, redirectCountdown, router]);

  const loadWheel = async () => {
    try {
      const res = await api.get(`/api/claim/welcome/${code}`);
      setItems(res.data.wheel_items);
      setCampaignId(res.data.campaign.id);
      setSmsEnabled(res.data.sms_enabled || false);
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

    const totalPct = items.reduce((s, i) => s + (i.weight || 10), 0);
    const noPrizePct = Math.max(0, 100 - totalPct);
    const segments: { name: string; pct: number; color: string }[] = items.map((item, i) => ({
      name: item.display_name,
      pct: item.weight || 10,
      color: COLORS[i % COLORS.length],
    }));
    if (noPrizePct > 0) {
      segments.push({ name: "No Prize", pct: noPrizePct, color: "#c8c8d0" });
    }

    ctx.clearRect(0, 0, size, size);
    ctx.save();
    ctx.translate(center, center);
    ctx.rotate((rotation * Math.PI) / 180);
    ctx.translate(-center, -center);

    let currentAngle = -Math.PI / 2;
    segments.forEach((seg) => {
      const segAngle = (seg.pct / 100) * 2 * Math.PI;
      const endAngle = currentAngle + segAngle;

      ctx.beginPath();
      ctx.moveTo(center, center);
      ctx.arc(center, center, radius, currentAngle, endAngle);
      ctx.closePath();
      ctx.fillStyle = seg.color;
      ctx.fill();
      ctx.strokeStyle = "rgba(255,255,255,0.4)";
      ctx.lineWidth = 2;
      ctx.stroke();

      if (seg.pct >= 5) {
        ctx.save();
        ctx.translate(center, center);
        ctx.rotate(currentAngle + segAngle / 2);
        ctx.textAlign = "center";
        ctx.fillStyle = "#fff";
        ctx.font = "bold 12px 'Plus Jakarta Sans', sans-serif";
        const label = seg.name.length > 8 ? seg.name.slice(0, 8) + ".." : seg.name;
        ctx.fillText(label, radius * 0.6, 4);
        ctx.restore();
      }

      currentAngle = endAngle;
    });

    ctx.restore();

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
    setClaimResult(null);
    setRedirectCountdown(null);

    try {
      const res = await api.post<SpinResult>("/api/claim/spin", {
        campaign_id: campaignId,
        staff_code: code,
      });
      setResult(res.data);

      const totalPct = items.reduce((s, i) => s + (i.weight || 10), 0);
      const noPrizePct = Math.max(0, 100 - totalPct);
      const targetIndex = res.data.result_index;

      let targetAngleDeg: number;
      if (targetIndex === -1) {
        const noPrizeStart = (totalPct / 100) * 360;
        targetAngleDeg = 360 - (noPrizeStart + (noPrizePct / 100) * 360 / 2);
      } else {
        let angleBefore = 0;
        for (let i = 0; i < targetIndex; i++) {
          angleBefore += (items[i].weight || 10);
        }
        const itemPct = items[targetIndex].weight || 10;
        targetAngleDeg = 360 - ((angleBefore + itemPct / 2) / 100) * 360;
      }

      const totalRotation = 360 * 8 + targetAngleDeg;
      let start: number | null = null;
      const duration = 5000;
      const startRotation = rotation % 360;

      const animate = (timestamp: number) => {
        if (!start) start = timestamp;
        const elapsed = timestamp - start;
        const progress = Math.min(elapsed / duration, 1);
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
      } else if (res.data.otp_sent) {
        setOtpSent(true);
        setOtpCooldown(60);
        if (res.data.demo_code) {
          setDemoCode(res.data.demo_code);
        }
      } else {
        alert(res.data.message);
      }
    } catch {
      alert("Verification failed");
    } finally {
      setVerifying(false);
    }
  };

  const handleVerifyOtp = async () => {
    const otpCode = otp.join("");
    if (otpCode.length !== 6) return;
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
        device_fingerprint: deviceFp,
      });
      setClaimResult(res.data);
      if (res.data.success && res.data.claim_id) {
        setRedirectCountdown(res.data.reward_code ? 5 : 2);
      }
    } catch (err: unknown) {
      const axiosErr = err as { response?: { data?: { detail?: string } } };
      setClaimResult({ success: false, message: axiosErr.response?.data?.detail || "Claim failed" });
      setRedirectCountdown(null);
    } finally {
      setClaiming(false);
    }
  };

  const handleOtpChange = (index: number, value: string) => {
    if (value.length > 1) return;
    const newOtp = [...otp];
    newOtp[index] = value;
    setOtp(newOtp);
    if (value && index < 5) {
      const next = document.getElementById(`otp-${index + 1}`);
      next?.focus();
    }
  };

  const handleOtpKeyDown = (index: number, e: React.KeyboardEvent) => {
    if (e.key === "Backspace" && !otp[index] && index > 0) {
      const prev = document.getElementById(`otp-${index - 1}`);
      prev?.focus();
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
                          disabled={phoneVerified || otpSent}
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
                        {verifying ? "SENDING..." : (smsEnabled ? "SEND VERIFICATION CODE" : "VERIFY PHONE")}
                      </button>
                    )}

                    {otpSent && !phoneVerified && (
                      <>
                        <div>
                          <label className="block text-xs font-bold text-outline uppercase tracking-widest mb-2 ml-1">Verification Code (6 digits)</label>
                          <div className="grid grid-cols-6 gap-2">
                            {otp.map((digit, i) => (
                              <input
                                key={i} id={`otp-${i}`} type="text" inputMode="numeric" maxLength={1}
                                value={digit}
                                onChange={(e) => handleOtpChange(i, e.target.value)}
                                onKeyDown={(e) => handleOtpKeyDown(i, e)}
                                className="w-full bg-surface-container-low border-none rounded-xl py-4 text-center font-bold text-xl text-primary focus:ring-2 focus:ring-primary/40"
                              />
                            ))}
                          </div>
                        </div>
                        <button
                          onClick={handleVerifyOtp}
                          disabled={verifying || otp.join("").length !== 6}
                          className="w-full bg-surface-container-highest text-primary font-[var(--font-headline)] font-extrabold py-4 rounded-xl hover:bg-primary hover:text-white transition-all disabled:opacity-60"
                        >
                          {verifying ? "VERIFYING..." : "VERIFY CODE"}
                        </button>
                        <button
                          onClick={handleVerifyPhone}
                          disabled={otpCooldown > 0 || verifying}
                          className="w-full text-sm text-on-surface-variant font-semibold py-2 hover:text-primary transition-colors disabled:opacity-40"
                        >
                          {otpCooldown > 0 ? `Resend in ${otpCooldown}s` : "Resend Code"}
                        </button>
                      </>
                    )}

                    {phoneVerified && (
                      <button
                        onClick={handleClaim}
                        disabled={claiming}
                        className="w-full bg-gradient-to-r from-secondary to-secondary-dim text-white font-[var(--font-headline)] font-extrabold py-5 rounded-full shadow-lg shadow-secondary/20 active:scale-[0.97] transition-all disabled:opacity-60"
                      >
                        {claiming ? "CLAIMING..." : "CLAIM REWARD"}
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
                  <div className="mt-4 rounded-xl border-2 border-primary bg-white p-4">
                    <p className="text-xs font-bold text-outline uppercase tracking-wider mb-1">Your Reward Code</p>
                    <p className="font-mono text-2xl font-extrabold text-primary tracking-wider">{claimResult.reward_code}</p>
                    <button
                      onClick={() => copyToClipboard(claimResult.reward_code!)}
                      className="mt-2 text-xs text-primary font-bold hover:underline"
                    >
                      Copy Code
                    </button>
                  </div>
                )}
                {claimResult.success && redirectCountdown !== null && (
                  <p className="mt-3 text-xs font-semibold text-on-surface-variant">
                    Redirecting to result page in {redirectCountdown}s...
                  </p>
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

      {demoCode && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/50 backdrop-blur-sm">
          <div className="mx-6 w-full max-w-sm rounded-2xl bg-surface-container-lowest p-8 text-center shadow-2xl">
            <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-primary/10">
              <LockOpen className="h-8 w-8 text-primary" />
            </div>
            <h3 className="mb-2 font-[var(--font-headline)] text-xl font-extrabold text-on-surface">
              Test Verification Code
            </h3>
            <p className="mb-6 text-sm text-on-surface-variant">
              Enter this code below to continue
            </p>
            <div className="mb-6 rounded-xl bg-primary/5 px-6 py-4">
              <p className="font-mono text-4xl font-extrabold tracking-[0.3em] text-primary">
                {demoCode}
              </p>
            </div>
            <button
              onClick={() => setDemoCode(null)}
              className="w-full rounded-xl bg-primary py-4 font-[var(--font-headline)] font-bold text-white transition-all hover:bg-primary-dim active:scale-[0.98]"
            >
              Got it
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
