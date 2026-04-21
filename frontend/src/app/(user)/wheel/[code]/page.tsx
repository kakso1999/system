"use client";

import type { KeyboardEvent } from "react";
import { useEffect, useRef, useState } from "react";
import { useParams, useRouter, useSearchParams } from "next/navigation";
import { AlertCircle, ArrowLeft, ChevronDown, PartyPopper } from "lucide-react";
import api from "@/lib/api";
import { readSessionToken, writeSessionToken } from "@/lib/session-token";
import SponsorsCarousel from "@/components/sponsors-carousel";
import { ClaimResultCard } from "./claim-result";
import { OtpClaimCard } from "./otp-claim-card";
import { DemoCodeModal } from "./wheel-overlays";
import { drawWheelCanvas, getTargetAngleDeg, type ClaimResultData, type SpinResult, type WheelItemData } from "./wheel-support";

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

const SESSION_MESSAGE = "Session expired or invalid. Please scan the QR again.";

function welcomeUrl(code: string) {
  return `/api/claim/welcome/${code}`;
}

function sessionErrorCode(error: unknown) {
  const axiosErr = error as { response?: { status?: number; data?: { detail?: string | { code?: string } } } };
  const detail = axiosErr.response?.data?.detail;
  const code = typeof detail === "object" ? detail.code : undefined;
  return axiosErr.response?.status === 403 && (code === "session_required" || code === "session_device_mismatch");
}

function claimMessage(error: unknown) {
  const axiosErr = error as { response?: { data?: { detail?: string | { code?: string } } } };
  const detail = axiosErr.response?.data?.detail;
  return typeof detail === "string" ? detail : "Claim failed";
}

type ClaimResponse = ClaimResultData & { result_token: string };

export default function WheelPage() {
  const params = useParams();
  const router = useRouter();
  const searchParams = useSearchParams();
  const code = params.code as string;
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [sessionToken, setSessionToken] = useState<string | null>(null);
  const token = sessionToken ?? readSessionToken(code) ?? searchParams.get("session_token");
  const [items, setItems] = useState<WheelItemData[]>([]);
  const [campaignId, setCampaignId] = useState("");
  const [noPrizeWeight, setNoPrizeWeight] = useState(10);
  const [spinning, setSpinning] = useState(false);
  const [result, setResult] = useState<SpinResult | null>(null);
  const [spinToken, setSpinToken] = useState<string | null>(null);
  const [rotation, setRotation] = useState(0);
  const [showResult, setShowResult] = useState(false);
  const [deviceFp, setDeviceFp] = useState("");
  const [sessionError, setSessionError] = useState("");
  const [phone, setPhone] = useState("");
  const [otp, setOtp] = useState(["", "", "", "", "", ""]);
  const [smsEnabled, setSmsEnabled] = useState(false);
  const [phoneVerified, setPhoneVerified] = useState(false);
  const [otpSent, setOtpSent] = useState(false);
  const [verifying, setVerifying] = useState(false);
  const [claiming, setClaiming] = useState(false);
  const [demoCode, setDemoCode] = useState<string | null>(null);
  const [otpCooldown, setOtpCooldown] = useState(0);
  const [claimResult, setClaimResult] = useState<ClaimResultData | null>(null);
  const [redirectCountdown, setRedirectCountdown] = useState<number | null>(null);

  useEffect(() => {
    if (!code) return;
    const fromUrl = searchParams.get("session_token");
    if (fromUrl) {
      writeSessionToken(code, fromUrl);
      router.replace(`/wheel/${code}`);
      setSessionToken(fromUrl);
    } else {
      setSessionToken(readSessionToken(code));
    }
  }, [code, searchParams, router]);
  useEffect(() => { setDeviceFp(generateDeviceFingerprint()); }, []);
  useEffect(() => {
    if (!code) return;
    loadWheel();
  }, [code, token]);

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

  useEffect(() => {
    const canvas = canvasRef.current;
    if (canvas) drawWheelCanvas(canvas, items, noPrizeWeight, rotation);
  }, [items, noPrizeWeight, rotation]);

  const loadWheel = async () => {
    try {
      const res = await api.get(welcomeUrl(code), {
        headers: token ? { "X-Session-Token": token } : {},
      });
      setItems(res.data.wheel_items);
      setCampaignId(res.data.campaign.id);
      setNoPrizeWeight(res.data.campaign.no_prize_weight ?? 10);
      setSmsEnabled(res.data.sms_enabled || false);
    } catch {
      router.push(`/welcome/${code}`);
    }
  };

  const handleSpin = async () => {
    if (spinning || items.length === 0 || sessionError) return;
    setSpinning(true);
    setShowResult(false);
    setClaimResult(null);
    setSpinToken(null);
    setRedirectCountdown(null);
    try {
      const payload = { campaign_id: campaignId, staff_code: code };
      const res = sessionToken
        ? await api.post<SpinResult>("/api/claim/spin", payload, { headers: { "X-Session-Token": sessionToken } })
        : await api.post<SpinResult>("/api/claim/spin", payload);
      setResult(res.data);
      setSpinToken(res.data.spin_token);
      spinTo(getTargetAngleDeg(items, noPrizeWeight, res.data.result_index));
    } catch (err: unknown) {
      setSpinning(false);
      if (sessionErrorCode(err)) {
        setSessionError(SESSION_MESSAGE);
        return;
      }
      alert("Failed to spin. Please try again.");
    }
  };

  const spinTo = (targetAngleDeg: number) => {
    const totalRotation = 360 * 8 + targetAngleDeg;
    let start: number | null = null;
    const duration = 5000;
    const startRotation = rotation % 360;
    const animate = (timestamp: number) => {
      if (!start) start = timestamp;
      const progress = Math.min((timestamp - start) / duration, 1);
      setRotation(startRotation + totalRotation * (1 - Math.pow(1 - progress, 3)));
      if (progress < 1) requestAnimationFrame(animate);
      else {
        setSpinning(false);
        setShowResult(true);
      }
    };
    requestAnimationFrame(animate);
  };

  const handleVerifyPhone = async () => {
    if (!phone) return;
    setVerifying(true);
    try {
      const res = await api.post("/api/claim/verify-phone", { phone, campaign_id: campaignId });
      if (res.data.verified) setPhoneVerified(true);
      else if (res.data.otp_sent) {
        setOtpSent(true);
        setOtpCooldown(60);
        if (res.data.demo_code) setDemoCode(res.data.demo_code);
      } else alert(res.data.message);
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
      const res = await api.post("/api/claim/verify-otp", { phone, code: otpCode, campaign_id: campaignId });
      if (res.data.verified) setPhoneVerified(true);
      else alert(res.data.message);
    } catch {
      alert("OTP verification failed");
    } finally {
      setVerifying(false);
    }
  };

  const handleClaim = async () => {
    if (!result || !phoneVerified || !spinToken) return;
    setClaiming(true);
    try {
      const payload = { campaign_id: campaignId, staff_code: code, phone, device_fingerprint: deviceFp, spin_token: spinToken };
      const res = sessionToken
        ? await api.post<ClaimResponse>("/api/claim/complete", payload, { headers: { "X-Session-Token": sessionToken } })
        : await api.post<ClaimResponse>("/api/claim/complete", payload);
      setClaimResult(res.data);
      if (res.data.success && res.data.claim_id) {
        sessionStorage.setItem("result_token:" + res.data.claim_id, res.data.result_token);
        setRedirectCountdown(res.data.reward_code ? 5 : 2);
      }
    } catch (err: unknown) {
      if (sessionErrorCode(err)) {
        setSessionError(SESSION_MESSAGE);
        setRedirectCountdown(null);
        return;
      }
      setClaimResult({ success: false, message: claimMessage(err) });
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
    if (value && index < 5) document.getElementById(`otp-${index + 1}`)?.focus();
  };

  const handleOtpKeyDown = (index: number, event: KeyboardEvent<HTMLInputElement>) => {
    if (event.key === "Backspace" && !otp[index] && index > 0) document.getElementById(`otp-${index - 1}`)?.focus();
  };

  return (
    <div className="min-h-screen bg-surface">
      <header className="fixed top-0 w-full z-50 bg-white/70 backdrop-blur-md shadow-sm">
        <div className="flex justify-between items-center px-6 h-16 max-w-7xl mx-auto">
          <button onClick={() => router.back()} className="p-2 rounded-full hover:bg-primary/5"><ArrowLeft className="w-5 h-5 text-primary" /></button>
          <h1 className="text-xl font-bold tracking-tighter text-primary font-[var(--font-headline)]">GroundRewards</h1>
          <div className="w-10" />
        </div>
      </header>

      <main className="pt-20 pb-32 px-6 max-w-md mx-auto min-h-screen">
        <div className="text-center mb-8">
          <span className="inline-block px-4 py-1.5 rounded-full bg-secondary-container text-on-secondary-container text-xs font-extrabold uppercase tracking-[0.2em] mb-4">Exclusive Access</span>
          <h2 className="text-4xl font-[var(--font-headline)] font-extrabold leading-tight tracking-tight text-on-surface">
            Congratulations! <span className="text-primary block">Spin to get your reward</span>
          </h2>
        </div>
        {sessionError && <div className="mb-6 rounded-xl border border-error/10 bg-error/5 px-4 py-3 text-sm font-semibold text-error">{sessionError}</div>}
        <div className="relative w-full aspect-square mb-12 flex items-center justify-center">
          <div className="absolute inset-0 bg-primary/10 rounded-full blur-3xl" />
          <div className="relative z-10 w-full h-full max-w-[320px] max-h-[320px] rounded-full p-2 bg-surface-container-lowest shadow-[0px_20px_40px_rgba(39,44,81,0.06)] border-[12px] border-surface-container">
            <canvas ref={canvasRef} width={280} height={280} className="w-full h-full rounded-full" />
            <div className="absolute -top-4 left-1/2 -translate-x-1/2 z-30"><ChevronDown className="w-12 h-12 text-error drop-shadow-md" /></div>
          </div>
          {!showResult && (
            <button onClick={handleSpin} disabled={spinning || Boolean(sessionError)} className="absolute -bottom-6 left-1/2 -translate-x-1/2 bg-gradient-to-r from-primary to-primary-dim text-white rounded-full px-10 py-5 shadow-2xl shadow-primary/40 font-[var(--font-headline)] font-bold text-lg active:scale-90 transition-all z-40 whitespace-nowrap disabled:opacity-60">
              {spinning ? "SPINNING..." : "SPIN NOW"}
            </button>
          )}
        </div>
        {showResult && result && <ResultPanel result={result} claimResult={claimResult} redirectCountdown={redirectCountdown} sessionError={sessionError} phone={phone} otp={otp} smsEnabled={smsEnabled} phoneVerified={phoneVerified} otpSent={otpSent} verifying={verifying} claiming={claiming} otpCooldown={otpCooldown} onPhoneChange={setPhone} onOtpChange={handleOtpChange} onOtpKeyDown={handleOtpKeyDown} onVerifyPhone={handleVerifyPhone} onVerifyOtp={handleVerifyOtp} onClaim={handleClaim} />}
        <SponsorsCarousel variant="wheel" />
      </main>

      <DemoCodeModal demoCode={demoCode} onClose={() => setDemoCode(null)} />
    </div>
  );
}

function ResultPanel(props: {
  result: SpinResult;
  claimResult: ClaimResultData | null;
  redirectCountdown: number | null;
  sessionError: string;
  phone: string;
  otp: string[];
  smsEnabled: boolean;
  phoneVerified: boolean;
  otpSent: boolean;
  verifying: boolean;
  claiming: boolean;
  otpCooldown: number;
  onPhoneChange: (value: string) => void;
  onOtpChange: (index: number, value: string) => void;
  onOtpKeyDown: (index: number, event: KeyboardEvent<HTMLInputElement>) => void;
  onVerifyPhone: () => void;
  onVerifyOtp: () => void;
  onClaim: () => void;
}) {
  if (props.result.wheel_item.type === "none") {
    return (
      <div className="bg-surface-container-lowest rounded-xl p-6 shadow-sm text-center">
        <AlertCircle className="w-12 h-12 text-outline mb-3 mx-auto block" />
        <h3 className="font-[var(--font-headline)] font-extrabold text-2xl text-on-surface mb-2">No Prize This Time</h3>
        <p className="text-on-surface-variant text-sm">{props.result.wheel_item.display_text}</p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="bg-surface-container-lowest rounded-xl p-6 shadow-sm text-center">
        <PartyPopper className="w-12 h-12 text-secondary mb-3 mx-auto block" />
        <h3 className="font-[var(--font-headline)] font-extrabold text-2xl text-on-surface mb-2">You won: {props.result.wheel_item.display_name}!</h3>
        <p className="text-on-surface-variant text-sm">{props.result.wheel_item.display_text || "Complete verification to claim your prize"}</p>
      </div>
      {!props.claimResult ? <OtpClaimCard {...props} /> : <ClaimResultCard claimResult={props.claimResult} redirectCountdown={props.redirectCountdown} />}
    </div>
  );
}
