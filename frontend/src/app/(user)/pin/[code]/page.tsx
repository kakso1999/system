"use client";

import type { KeyboardEvent } from "react";
import { useEffect, useRef, useState } from "react";
import { useParams, useRouter, useSearchParams } from "next/navigation";
import { AlertCircle, LockKeyhole } from "lucide-react";
import api from "@/lib/api";
import { getPublicSettings, type PublicSettings } from "@/lib/public-settings";

type PinError = "invalid_pin" | "expired" | "locked" | "not_found" | "rate_limited";

interface VerifyResponse {
  success: boolean;
  session_token?: string;
  error?: PinError;
  attempts_remaining?: number;
}

function parseVerifyFailure(error: unknown) {
  const axiosErr = error as { response?: { data?: { error?: PinError; attempts_remaining?: number } } };
  return {
    error: axiosErr.response?.data?.error,
    attemptsRemaining: axiosErr.response?.data?.attempts_remaining,
  };
}

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

function getErrorMessage(error?: PinError, attemptsRemaining?: number) {
  if (error === "invalid_pin") return `Wrong PIN. Attempts remaining: ${attemptsRemaining ?? 0}`;
  if (error === "expired") return "QR code expired. Ask the promoter to refresh.";
  if (error === "locked") return "Too many wrong attempts. Ask the promoter for a new code.";
  if (error === "not_found" || error === "rate_limited") return "Invalid code.";
  return "We could not verify that PIN. Please try again.";
}

function isTerminalError(error?: PinError) {
  return error === "locked" || error === "expired" || error === "not_found";
}

function PinBox({
  index,
  value,
  disabled,
  onDigit,
  onBack,
}: {
  index: number;
  value: string;
  disabled: boolean;
  onDigit: (index: number, value: string) => void;
  onBack: (index: number) => void;
}) {
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

  return (
    <input
      id={`pin-${index}`}
      type="text"
      inputMode="numeric"
      maxLength={1}
      value={value}
      disabled={disabled}
      onChange={(event) => onDigit(index, event.target.value.replace(/\D/g, "").slice(-1))}
      onKeyDown={handleKeyDown}
      className="h-20 rounded-2xl bg-surface-container-lowest text-center text-4xl font-extrabold text-primary shadow-sm ring-1 ring-outline-variant/30 focus:outline-none focus:ring-4 focus:ring-primary/25 disabled:opacity-50"
    />
  );
}

function PinHeader({ projectName }: { projectName?: string | null }) {
  return (
    <header className="fixed top-0 w-full z-50 bg-white/70 backdrop-blur-md shadow-sm">
      <div className="flex justify-center items-center h-16">
        <h1 className="text-xl font-bold tracking-tighter text-primary font-[var(--font-headline)]">{projectName || "GroundRewards"}</h1>
      </div>
    </header>
  );
}

function PinHero({ qrVersion }: { qrVersion: string }) {
  return (
    <>
      <div className="mb-8 flex h-24 w-24 items-center justify-center rounded-3xl bg-primary/10 text-primary">
        <LockKeyhole className="h-12 w-12" />
      </div>
      <span className="inline-block px-5 py-2 rounded-full bg-secondary-container text-on-secondary-container text-xs font-extrabold uppercase tracking-[0.25em] mb-5">
        Secure Access
      </span>
      {qrVersion ? <p className="mb-3 text-xs font-bold uppercase tracking-[0.2em] text-outline">QR v{qrVersion}</p> : null}
      <h1 className="text-center text-4xl font-[var(--font-headline)] font-extrabold tracking-tight text-on-surface mb-3">
        Enter the PIN
      </h1>
      <p className="text-center text-on-surface-variant max-w-sm leading-relaxed mb-8">
        Ask the promoter for the 3-digit PIN shown beside this live QR code.
      </p>
    </>
  );
}

function PinGrid({
  pin,
  disabled,
  onDigit,
  onBack,
}: {
  pin: string[];
  disabled: boolean;
  onDigit: (index: number, value: string) => void;
  onBack: (index: number) => void;
}) {
  return (
    <div className="grid w-full max-w-xs grid-cols-3 gap-3 mb-6">
      {pin.map((digit, index) => (
        <PinBox key={index} index={index} value={digit} disabled={disabled} onDigit={onDigit} onBack={onBack} />
      ))}
    </div>
  );
}

function PinFeedback({ message }: { message: string }) {
  if (!message) return null;
  return (
    <div className="mb-6 flex w-full max-w-sm items-start gap-2 rounded-xl bg-error/5 px-4 py-3 text-sm font-semibold text-error">
      <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
      <p>{message}</p>
    </div>
  );
}

function ContinueButton({
  disabled,
  submitting,
  onSubmit,
}: {
  disabled: boolean;
  submitting: boolean;
  onSubmit: () => void;
}) {
  return (
    <button
      onClick={onSubmit}
      disabled={disabled}
      className="w-full max-w-sm bg-gradient-to-r from-primary to-primary-dim text-white rounded-full px-10 py-5 shadow-2xl shadow-primary/40 font-[var(--font-headline)] font-bold text-lg active:scale-95 transition-all disabled:opacity-60"
    >
      {submitting ? "VERIFYING..." : "CONTINUE"}
    </button>
  );
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
  const firstInputFocused = useRef(false);

  useEffect(() => {
    let active = true;
    getPublicSettings().then((settings) => {
      if (active) setPublicSettings(settings);
    });
    return () => { active = false; };
  }, []);

  useEffect(() => {
    setDeviceFp(generateDeviceFingerprint());
  }, []);

  useEffect(() => {
    if (!firstInputFocused.current) {
      document.getElementById("pin-0")?.focus();
      firstInputFocused.current = true;
    }
  }, []);

  const friendlyError = !code ? "This QR code is missing a promotion code." : !lt ? "This QR code is missing its secure token. Ask the promoter to refresh." : error;

  const setDigit = (index: number, value: string) => {
    if (locked) return;
    const next = [...pin];
    next[index] = value;
    setPin(next);
    setError("");
    if (value && index < 2) document.getElementById(`pin-${index + 1}`)?.focus();
  };

  const clearOrMoveBack = (index: number) => {
    if (locked) return;
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
    if (!code || !lt || pinCode.length !== 3 || submitting || locked) return;
    setSubmitting(true);
    try {
      const res = await api.post<VerifyResponse>("/api/claim/pin/verify", {
        staff_code: code.toUpperCase(),
        pin: pinCode,
        device_fingerprint: deviceFp,
        token_signature: lt,
      });
      if (res.data.success && res.data.session_token) {
        router.replace(`/welcome/${code}?session_token=${encodeURIComponent(res.data.session_token)}`);
        return;
      }
      setError(getErrorMessage(res.data.error, res.data.attempts_remaining));
      setLocked(isTerminalError(res.data.error));
    } catch (err: unknown) {
      const failure = parseVerifyFailure(err);
      setError(getErrorMessage(failure.error, failure.attemptsRemaining));
      setLocked(isTerminalError(failure.error));
    } finally {
      setSubmitting(false);
    }
  };

  const disabled = locked || submitting || !code || !lt;

  return (
    <div className="min-h-screen bg-surface flex flex-col">
      <PinHeader projectName={publicSettings?.project_name} />
      <main className="flex-1 flex flex-col items-center justify-center px-6 pt-24 pb-12">
        <PinHero qrVersion={qrVersion} />
        <PinGrid pin={pin} disabled={disabled} onDigit={setDigit} onBack={clearOrMoveBack} />
        <PinFeedback message={friendlyError} />
        <ContinueButton disabled={disabled || pin.join("").length !== 3} submitting={submitting} onSubmit={handleSubmit} />
      </main>
    </div>
  );
}
