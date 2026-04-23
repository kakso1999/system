"use client";

import type { KeyboardEvent } from "react";
import { useEffect, useEffectEvent, useRef, useState } from "react";
import { useParams, useRouter, useSearchParams } from "next/navigation";
import { AlertCircle, LockKeyhole } from "lucide-react";
import api from "@/lib/api";
import { getPublicSettings, type PublicSettings } from "@/lib/public-settings";
import { writeSessionToken } from "@/lib/session-token";

type PinError = "invalid_pin" | "expired" | "locked" | "not_found" | "rate_limited" | "staff_inactive" | "device_fingerprint_required" | "invalid_signature";
type LiveStatusState = "idle" | "checking" | "ready" | "invalid" | "paused" | "rotated" | "unavailable";
type LiveStatusSource = "initial" | "retry" | "poll";
type BannerTone = "info" | "warning";

interface VerifyResponse { success: boolean; session_token?: string; error?: PinError; attempts_remaining?: number; }
interface LiveStatusResponse { valid: boolean; staff_active: boolean; qr_version: number; pin_version: number; reason: string | null; }
interface BannerState { message: string; tone: BannerTone; actionLabel?: string; }

const CHECKING_BANNER: BannerState = { message: "Checking QR status...", tone: "info" };
const UNAVAILABLE_BANNER: BannerState = { message: "We could not check QR status. Please retry.", tone: "warning", actionLabel: "Retry check" };
const INVALID_BANNER: BannerState = { message: "QR code expired / rotated, please rescan the promoter's latest QR.", tone: "warning", actionLabel: "Retry check" };
const ROTATED_BANNER: BannerState = { message: "QR rotated — please rescan", tone: "warning" };
const PAUSED_BANNER: BannerState = { message: "Promotion is paused. Please ask the promoter to resume.", tone: "warning" };

function parseVerifyFailure(error: unknown) {
  const axiosErr = error as { response?: { data?: { error?: PinError; attempts_remaining?: number } } };
  return { error: axiosErr.response?.data?.error, attemptsRemaining: axiosErr.response?.data?.attempts_remaining };
}

function generateDeviceFingerprint(): string {
  const nav = window.navigator;
  const screen = window.screen;
  const raw = [nav.userAgent, nav.language, `${screen.width}x${screen.height}`, screen.colorDepth, new Date().getTimezoneOffset(), nav.hardwareConcurrency || "", (nav as unknown as Record<string, unknown>).deviceMemory || "", nav.maxTouchPoints || 0].join("|");
  let hash = 0;
  for (let i = 0; i < raw.length; i++) {
    const chr = raw.charCodeAt(i);
    hash = ((hash << 5) - hash) + chr;
    hash |= 0;
  }
  return `fp_${Math.abs(hash).toString(36)}`;
}

async function fetchLiveStatus(code: string, lt: string) {
  const response = await api.get<LiveStatusResponse>("/api/claim/live-status", { params: { staff_code: code.toUpperCase(), lt } });
  return response.data;
}

function resolveLiveStatusOutcome(source: LiveStatusSource, response: LiveStatusResponse, wasValid: boolean): { state: LiveStatusState; banner: BannerState | null; isValid: boolean } {
  if (!response.valid) return source === "poll" && wasValid ? { state: "rotated", banner: ROTATED_BANNER, isValid: false } : { state: "invalid", banner: INVALID_BANNER, isValid: false };
  if (!response.staff_active) return { state: "paused", banner: PAUSED_BANNER, isValid: false };
  return { state: "ready", banner: null, isValid: true };
}

function getErrorMessage(error?: PinError, attemptsRemaining?: number) {
  if (error === "invalid_pin") return `Wrong PIN. Attempts remaining: ${attemptsRemaining ?? 0}`;
  if (error === "expired") return "QR code expired. Ask the promoter to refresh.";
  if (error === "locked") return "Too many wrong attempts. Ask the promoter for a new code.";
  if (error === "staff_inactive") return "The promoter is not currently active. Please try again later.";
  if (error === "device_fingerprint_required") return "Your browser blocked a required check. Please disable strict privacy mode and reload.";
  if (error === "invalid_signature") return "This QR code is invalid. Please scan the latest QR from the promoter.";
  if (error === "not_found" || error === "rate_limited") return "Invalid code.";
  return "We could not verify that PIN. Please try again.";
}

function isTerminalError(error?: PinError) {
  return error === "locked" || error === "expired" || error === "not_found" || error === "staff_inactive" || error === "invalid_signature";
}

function PinBox({ index, value, disabled, onDigit, onBack }: { index: number; value: string; disabled: boolean; onDigit: (index: number, value: string) => void; onBack: (index: number) => void }) {
  const handleKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    if (event.key === "Backspace") {
      event.preventDefault();
      onBack(index);
      return;
    }
    if (/^\d$/.test(event.key)) {
      event.preventDefault();
      onDigit(index, event.key);
    }
  };
  return <input id={`pin-${index}`} type="text" inputMode="numeric" maxLength={1} value={value} disabled={disabled} onChange={(event) => onDigit(index, event.target.value.replace(/\D/g, "").slice(-1))} onKeyDown={handleKeyDown} className="h-20 rounded-2xl bg-surface-container-lowest text-center text-4xl font-extrabold text-primary shadow-sm ring-1 ring-outline-variant/30 focus:outline-none focus:ring-4 focus:ring-primary/25 disabled:opacity-50" />;
}

function PinHeader({ projectName }: { projectName?: string | null }) {
  return <header className="fixed top-0 z-50 w-full bg-white/70 shadow-sm backdrop-blur-md"><div className="flex h-16 items-center justify-center"><h1 className="font-[var(--font-headline)] text-xl font-bold tracking-tighter text-primary">{projectName || "GroundRewards"}</h1></div></header>;
}

function PinHero({ qrVersion }: { qrVersion: string }) {
  return (
    <>
      <div className="mb-8 flex h-24 w-24 items-center justify-center rounded-3xl bg-primary/10 text-primary"><LockKeyhole className="h-12 w-12" /></div>
      <span className="mb-5 inline-block rounded-full bg-secondary-container px-5 py-2 text-xs font-extrabold uppercase tracking-[0.25em] text-on-secondary-container">Secure Access</span>
      {qrVersion ? <p className="mb-3 text-xs font-bold uppercase tracking-[0.2em] text-outline">QR v{qrVersion}</p> : null}
      <h1 className="mb-3 text-center font-[var(--font-headline)] text-4xl font-extrabold tracking-tight text-on-surface">Enter the PIN</h1>
      <p className="mb-8 max-w-sm text-center leading-relaxed text-on-surface-variant">Ask the promoter for the 3-digit PIN shown beside this live QR code.</p>
    </>
  );
}

function StatusBanner({ banner, busy, onAction }: { banner: BannerState | null; busy: boolean; onAction: () => void }) {
  if (!banner) return null;
  const toneClass = banner.tone === "info" ? "bg-primary/10 text-primary ring-primary/15" : "bg-amber-500/10 text-amber-950 ring-amber-500/20";
  return (
    <div className={`mb-4 flex w-full max-w-sm items-start justify-between gap-3 rounded-xl px-4 py-3 text-sm font-semibold ring-1 ${toneClass}`}>
      <div className="flex items-start gap-2"><AlertCircle className="mt-0.5 h-4 w-4 shrink-0" /><p>{banner.message}</p></div>
      {banner.actionLabel ? <button type="button" onClick={onAction} disabled={busy} className="shrink-0 rounded-full bg-white/80 px-3 py-1 text-[11px] font-bold uppercase tracking-[0.15em] text-current disabled:opacity-60">{busy ? "Checking..." : banner.actionLabel}</button> : null}
    </div>
  );
}

function PinGrid({ pin, disabled, onDigit, onBack }: { pin: string[]; disabled: boolean; onDigit: (index: number, value: string) => void; onBack: (index: number) => void }) {
  return <div className="mb-6 grid w-full max-w-xs grid-cols-3 gap-3">{pin.map((digit, index) => <PinBox key={index} index={index} value={digit} disabled={disabled} onDigit={onDigit} onBack={onBack} />)}</div>;
}

function PinFeedback({ message }: { message: string }) {
  if (!message) return null;
  return <div className="mb-6 flex w-full max-w-sm items-start gap-2 rounded-xl bg-error/5 px-4 py-3 text-sm font-semibold text-error"><AlertCircle className="mt-0.5 h-4 w-4 shrink-0" /><p>{message}</p></div>;
}

function ContinueButton({ disabled, submitting, onSubmit }: { disabled: boolean; submitting: boolean; onSubmit: () => void }) {
  return <button onClick={onSubmit} disabled={disabled} className="w-full max-w-sm rounded-full bg-gradient-to-r from-primary to-primary-dim px-10 py-5 font-[var(--font-headline)] text-lg font-bold text-white shadow-2xl shadow-primary/40 transition-all active:scale-95 disabled:opacity-60">{submitting ? "VERIFYING..." : "CONTINUE"}</button>;
}

export default function PinPage() {
  const params = useParams();
  const searchParams = useSearchParams();
  const router = useRouter();
  const rawCode = params.code;
  const code = typeof rawCode === "string" ? rawCode : "";
  const lt = searchParams.get("lt") || "";
  const qrVersion = searchParams.get("v") || "";
  const [pin, setPin] = useState(["", "", ""]);
  const [deviceFp, setDeviceFp] = useState("");
  const [publicSettings, setPublicSettings] = useState<PublicSettings | null>(null);
  const [error, setError] = useState("");
  const [locked, setLocked] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [statusState, setStatusState] = useState<LiveStatusState>(code && lt ? "checking" : "idle");
  const [statusBanner, setStatusBanner] = useState<BannerState | null>(code && lt ? CHECKING_BANNER : null);
  const [hasUserInput, setHasUserInput] = useState(false);
  const firstInputFocused = useRef(false);
  const liveStatusValidRef = useRef(false);
  const liveStatusRequestRef = useRef(0);

  useEffect(() => {
    let active = true;
    getPublicSettings().then((settings) => active && setPublicSettings(settings));
    return () => { active = false; };
  }, []);

  useEffect(() => { setDeviceFp(generateDeviceFingerprint()); }, []);

  useEffect(() => {
    liveStatusRequestRef.current += 1;
    liveStatusValidRef.current = false;
    firstInputFocused.current = false;
    setPin(["", "", ""]);
    setError("");
    setLocked(false);
    setSubmitting(false);
    setHasUserInput(false);
    setStatusState(code && lt ? "checking" : "idle");
    setStatusBanner(code && lt ? CHECKING_BANNER : null);
  }, [code, lt]);

  const applyLiveStatus = useEffectEvent((source: LiveStatusSource, response: LiveStatusResponse) => {
    const outcome = resolveLiveStatusOutcome(source, response, liveStatusValidRef.current);
    if (outcome.state !== "ready") setError("");
    setStatusState(outcome.state);
    setStatusBanner(outcome.banner);
    liveStatusValidRef.current = outcome.isValid;
  });

  const applyUnavailableStatus = useEffectEvent(() => {
    setError("");
    setStatusState("unavailable");
    setStatusBanner(UNAVAILABLE_BANNER);
    liveStatusValidRef.current = false;
  });

  const runLiveStatusCheck = useEffectEvent(async (source: LiveStatusSource) => {
    if (!code || !lt) return;
    const requestId = liveStatusRequestRef.current + 1;
    liveStatusRequestRef.current = requestId;
    if (source !== "poll") {
      setStatusState("checking");
      setStatusBanner(CHECKING_BANNER);
    }
    try {
      const response = await fetchLiveStatus(code, lt);
      if (requestId !== liveStatusRequestRef.current) return;
      applyLiveStatus(source, response);
    } catch {
      if (requestId === liveStatusRequestRef.current) applyUnavailableStatus();
    }
  });

  useEffect(() => { if (code && lt) void runLiveStatusCheck("initial"); }, [code, lt]);

  useEffect(() => {
    if (!code || !lt || hasUserInput || statusState !== "ready") return;
    const intervalId = window.setInterval(() => void runLiveStatusCheck("poll"), 5000);
    return () => window.clearInterval(intervalId);
  }, [code, lt, hasUserInput, statusState]);

  useEffect(() => {
    if (statusState !== "ready" || firstInputFocused.current) return;
    document.getElementById("pin-0")?.focus();
    firstInputFocused.current = true;
  }, [statusState]);

  const friendlyError = !code ? "This QR code is missing a promotion code." : !lt ? "This QR code is missing its secure token. Ask the promoter to refresh." : error;

  const setDigit = (index: number, value: string) => {
    if (locked || statusState !== "ready") return;
    if (value) setHasUserInput(true);
    const next = [...pin];
    next[index] = value;
    setPin(next);
    setError("");
    if (value && index < 2) document.getElementById(`pin-${index + 1}`)?.focus();
  };

  const clearOrMoveBack = (index: number) => {
    if (locked || statusState !== "ready") return;
    const next = [...pin];
    if (next[index]) {
      next[index] = "";
      setPin(next);
    }
    if (index > 0) {
      next[index - 1] = "";
      setPin(next);
      document.getElementById(`pin-${index - 1}`)?.focus();
    }
  };

  const handleSubmit = async () => {
    const pinCode = pin.join("");
    if (!code || !lt || pinCode.length !== 3 || submitting || locked || statusState !== "ready") return;
    setSubmitting(true);
    try {
      const res = await api.post<VerifyResponse>("/api/claim/pin/verify", { staff_code: code.toUpperCase(), pin: pinCode, device_fingerprint: deviceFp, token_signature: lt });
      if (res.data.success && res.data.session_token) {
        writeSessionToken(code, res.data.session_token);
        router.replace(`/welcome/${code}`);
        return;
      }
      setError(getErrorMessage(res.data.error, res.data.attempts_remaining));
      setLocked(isTerminalError(res.data.error));
    } catch (err: unknown) {
      if (process.env.NODE_ENV === "development") console.warn("[pin-verify] raw:", (err as { response?: { data?: unknown } }).response?.data);
      const failure = parseVerifyFailure(err);
      setError(getErrorMessage(failure.error, failure.attemptsRemaining));
      setLocked(isTerminalError(failure.error));
    } finally {
      setSubmitting(false);
    }
  };

  const disabled = locked || submitting || !code || !lt || statusState !== "ready";

  return (
    <div className="min-h-screen bg-surface flex flex-col">
      <PinHeader projectName={publicSettings?.project_name} />
      <main className="flex-1 flex flex-col items-center justify-center px-6 pt-24 pb-12">
        <PinHero qrVersion={qrVersion} />
        <StatusBanner banner={statusBanner} busy={statusState === "checking"} onAction={() => void runLiveStatusCheck("retry")} />
        <PinGrid pin={pin} disabled={disabled} onDigit={setDigit} onBack={clearOrMoveBack} />
        <PinFeedback message={friendlyError} />
        <ContinueButton disabled={disabled || pin.join("").length !== 3} submitting={submitting} onSubmit={handleSubmit} />
      </main>
    </div>
  );
}
