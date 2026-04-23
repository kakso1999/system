"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { ArrowLeft, Copy, Expand, RefreshCw, X } from "lucide-react";
import { QRCodeSVG } from "qrcode.react";
import api from "@/lib/api";
import { copyToClipboard } from "@/lib/clipboard";

interface LiveQrState {
  qr_data: string;
  pin: string;
  expires_at: string;
  qr_version: number;
  status?: string;
  needs_rotate?: boolean;
  currentTokenId: string;
  loading: boolean;
  error: string;
}

interface LiveQrPayload {
  qr_data?: string;
  pin?: string;
  expires_at?: string;
  qr_version?: number;
  status?: string;
  needs_rotate?: boolean;
  live_token_id?: string;
}

interface ApiErrorDetail {
  code?: string;
  reason?: string;
}

interface ApiErrorShape {
  response?: {
    status?: number;
    data?: {
      detail?: string | ApiErrorDetail;
    };
  };
}

const initialState: LiveQrState = {
  qr_data: "",
  pin: "",
  expires_at: "",
  qr_version: 0,
  status: "",
  needs_rotate: false,
  currentTokenId: "",
  loading: true,
  error: "",
};

function formatTime(seconds: number) {
  const safe = Math.max(0, seconds);
  return `${Math.floor(safe / 60)}:${String(safe % 60).padStart(2, "0")}`;
}

function getResponseStatus(error: unknown) {
  return (error as ApiErrorShape).response?.status;
}

function getErrorDetail(error: unknown) {
  return (error as ApiErrorShape).response?.data?.detail;
}

function getErrorCode(error: unknown) {
  const detail = getErrorDetail(error);
  return typeof detail === "string" ? detail : detail?.code;
}

function isTooManyRefresh(error: unknown) {
  return getResponseStatus(error) === 429 && getErrorCode(error) === "too_many_refresh";
}

function shouldDropStalePoll(prev: LiveQrState, payload: LiveQrPayload) {
  const nextTokenId = payload.live_token_id ?? prev.currentTokenId;
  const nextVersion = payload.qr_version ?? prev.qr_version;
  return nextTokenId !== prev.currentTokenId && nextVersion <= prev.qr_version;
}

function mergeLiveQrState(prev: LiveQrState, payload: LiveQrPayload, source: "generate" | "poll"): LiveQrState {
  const fallbackStatus = prev.status || "active";
  const nextStatus = source === "generate" ? payload.status ?? "active" : payload.status ?? fallbackStatus;
  const nextNeedsRotate = source === "generate" ? payload.needs_rotate ?? false : payload.needs_rotate ?? prev.needs_rotate ?? false;
  return {
    ...prev,
    qr_data: payload.qr_data ?? prev.qr_data,
    pin: payload.pin ?? prev.pin,
    expires_at: payload.expires_at ?? prev.expires_at,
    qr_version: payload.qr_version ?? prev.qr_version,
    status: nextStatus,
    needs_rotate: nextNeedsRotate,
    currentTokenId: payload.live_token_id ?? prev.currentTokenId,
    loading: false,
    error: "",
  };
}

function QrDisplay({ qrUrl, sizeClass }: { qrUrl: string; sizeClass: string }) {
  return (
    <div className="bg-white p-5 rounded-3xl inline-block shadow-inner">
      <QRCodeSVG
        value={qrUrl || " "}
        size={288}
        bgColor="#ffffff"
        fgColor="#0d47a1"
        level="M"
        includeMargin
        className={sizeClass}
      />
    </div>
  );
}

function PinChip({ pin, large = false }: { pin: string; large?: boolean }) {
  return (
    <div className="rounded-3xl bg-primary px-8 py-5 text-on-primary shadow-xl shadow-primary/20">
      <p className="text-xs font-extrabold uppercase tracking-[0.25em] opacity-80">Customer PIN</p>
      <p className={`${large ? "text-7xl" : "text-6xl"} font-[var(--font-headline)] font-black tracking-[0.35em]`}>
        {pin || "---"}
      </p>
    </div>
  );
}

function Header({ onBack }: { onBack: () => void }) {
  return (
    <header className="fixed top-0 w-full z-50 bg-white/70 backdrop-blur-md shadow-sm">
      <div className="flex justify-between items-center px-6 h-16 max-w-7xl mx-auto">
        <button onClick={onBack} className="p-2 rounded-full hover:bg-primary/5">
          <ArrowLeft className="w-5 h-5 text-primary" />
        </button>
        <h1 className="text-xl font-bold tracking-tighter text-primary font-[var(--font-headline)]">My QR Code</h1>
        <div className="w-10" />
      </div>
    </header>
  );
}

function InlineNote({ note, error }: { note: string; error: string }) {
  if (!note && !error) return null;
  return (
    <div className={`rounded-xl px-4 py-3 text-sm font-semibold ${error ? "bg-error/5 text-error" : "bg-primary/5 text-primary"}`}>
      {error || note}
    </div>
  );
}

function FullscreenView({
  qrUrl,
  state,
  seconds,
  onExit,
}: {
  qrUrl: string;
  state: LiveQrState;
  seconds: number;
  onExit: () => void;
}) {
  return (
    <div className="fixed inset-0 z-[80] flex flex-col items-center justify-center gap-8 bg-surface px-6 text-center">
      <button onClick={onExit} className="absolute right-6 top-6 rounded-full bg-surface-container-highest p-4 text-primary shadow-lg">
        <X className="h-6 w-6" />
      </button>
      <div>
        <p className="mb-2 text-sm font-extrabold uppercase tracking-[0.3em] text-on-surface-variant">Scan to play</p>
        <h2 className="font-[var(--font-headline)] text-5xl font-black tracking-tight text-on-surface">GroundRewards</h2>
      </div>
      <QrDisplay qrUrl={qrUrl} sizeClass="h-[min(80vh,80vw)] w-[min(80vh,80vw)] max-h-[680px] max-w-[680px]" />
      <div className="flex flex-col items-center gap-4 sm:flex-row">
        <PinChip pin={state.pin} large />
        <div className="rounded-3xl bg-surface-container-lowest px-8 py-5 shadow-sm">
          <p className="text-xs font-extrabold uppercase tracking-[0.25em] text-on-surface-variant">Refreshes in</p>
          <p className="font-[var(--font-headline)] text-5xl font-black text-primary">{formatTime(seconds)}</p>
        </div>
      </div>
    </div>
  );
}

function PageIntro() {
  return (
    <div className="text-center mb-8">
      <h2 className="text-2xl font-extrabold font-[var(--font-headline)] tracking-tight">Live QR Workstation</h2>
      <p className="text-on-surface-variant mt-2 text-sm">Keep this screen open. Customers scan the live QR and enter the PIN.</p>
    </div>
  );
}

function MetaGrid({ seconds, version }: { seconds: number; version: number }) {
  return (
    <div className="grid grid-cols-2 gap-3 text-left">
      <div className="rounded-xl bg-surface-container-low p-4">
        <p className="text-xs font-bold uppercase tracking-wider text-on-surface-variant">Expires in</p>
        <p className="text-2xl font-extrabold text-primary">{formatTime(seconds)}</p>
      </div>
      <div className="rounded-xl bg-surface-container-low p-4">
        <p className="text-xs font-bold uppercase tracking-wider text-on-surface-variant">Version</p>
        <p className="text-2xl font-extrabold text-primary">v{version || "-"}</p>
      </div>
    </div>
  );
}

function ActionButtons({
  qrUrl,
  loading,
  onCopy,
  onRefresh,
  onFullscreen,
}: {
  qrUrl: string;
  loading: boolean;
  onCopy: () => void;
  onRefresh: () => void;
  onFullscreen: () => void;
}) {
  return (
    <div className="space-y-3">
      <button
        onClick={onCopy}
        disabled={!qrUrl}
        className="w-full bg-primary text-on-primary py-3 rounded-full font-bold text-sm flex items-center justify-center gap-2 shadow-md shadow-primary/20 hover:shadow-lg active:scale-[0.98] transition-all disabled:opacity-60"
      >
        <Copy className="w-[18px] h-[18px]" />
        Copy Link
      </button>
      <div className="grid grid-cols-2 gap-3">
        <button onClick={onRefresh} disabled={loading} className="rounded-full bg-surface-container-highest py-3 text-sm font-extrabold text-primary transition-all active:scale-[0.98] disabled:opacity-60">
          <RefreshCw className="mr-2 inline h-4 w-4" />
          Refresh
        </button>
        <button onClick={onFullscreen} disabled={!qrUrl} className="rounded-full bg-surface-container-highest py-3 text-sm font-extrabold text-primary transition-all active:scale-[0.98] disabled:opacity-60">
          <Expand className="mr-2 inline h-4 w-4" />
          Fullscreen
        </button>
      </div>
    </div>
  );
}

function WorkstationCard({
  state,
  qrUrl,
  seconds,
  banner,
  note,
  onCopy,
  onRefresh,
  onFullscreen,
}: {
  state: LiveQrState;
  qrUrl: string;
  seconds: number;
  banner: string;
  note: string;
  onCopy: () => void;
  onRefresh: () => void;
  onFullscreen: () => void;
}) {
  return (
    <div className="bg-surface-container-lowest rounded-2xl p-6 shadow-sm text-center space-y-6">
      {banner && <div className="rounded-xl border border-primary/15 bg-primary/5 px-4 py-3 text-sm font-semibold text-primary">{banner}</div>}
      <InlineNote note={note} error={state.error} />
      <div>
        <QrDisplay qrUrl={qrUrl} sizeClass="h-56 w-56" />
        {state.loading && <p className="mt-3 text-sm font-semibold text-on-surface-variant">Refreshing live QR...</p>}
      </div>
      <PinChip pin={state.pin} />
      <MetaGrid seconds={seconds} version={state.qr_version} />
      <ActionButtons qrUrl={qrUrl} loading={state.loading} onCopy={onCopy} onRefresh={onRefresh} onFullscreen={onFullscreen} />
      <div className="p-3 bg-surface-container-low rounded-xl">
        <p className="text-xs text-on-surface-variant break-all">{qrUrl || "Generating live QR link..."}</p>
      </div>
    </div>
  );
}

export default function QRCodePage() {
  const router = useRouter();
  const [state, setState] = useState<LiveQrState>(initialState);
  const [origin, setOrigin] = useState("");
  const [secondsRemaining, setSecondsRemaining] = useState(0);
  const [pausedBanner, setPausedBanner] = useState("");
  const [note, setNote] = useState("");
  const [fullscreen, setFullscreen] = useState(false);
  const lastGenerateAt = useRef(0);
  const lastAutoRotateAt = useRef(0);
  const isGeneratingRef = useRef(false);
  const inactiveCooldownUntil = useRef(0);
  const statusPollingAvailable = useRef(true);

  const qrUrl = state.qr_data ? `${origin}${state.qr_data}` : "";

  const hasInactiveCooldown = () => Date.now() < inactiveCooldownUntil.current;

  const applyLiveQrPayload = (payload: LiveQrPayload, source: "generate" | "poll") => {
    setState((prev) => {
      if (source === "poll" && shouldDropStalePoll(prev, payload)) {
        console.debug("[live-qr] drop stale poll");
        return prev;
      }
      return mergeLiveQrState(prev, payload, source);
    });
  };

  const generateLiveQr = async (force = false) => {
    const now = Date.now();
    if (isGeneratingRef.current || hasInactiveCooldown()) return;
    if (!force && now - lastGenerateAt.current < 1000) return;
    isGeneratingRef.current = true;
    lastGenerateAt.current = now;
    setState((prev) => ({ ...prev, loading: true, error: "" }));
    setNote("");
    try {
      const res = await api.post<LiveQrPayload>("/api/promoter/live-qr/generate", {});
      setPausedBanner("");
      applyLiveQrPayload(res.data, "generate");
    } catch (err: unknown) {
      if (getResponseStatus(err) === 400 && getErrorCode(err) === "staff_inactive") {
        inactiveCooldownUntil.current = Date.now() + 30000;
        setPausedBanner("Promotion paused / stopped — resume work to rotate QR.");
        setState((prev) => ({ ...prev, loading: false, error: "" }));
        return;
      }
      if (isTooManyRefresh(err)) {
        setNote("Please wait a moment");
        setState((prev) => ({ ...prev, loading: false, error: "" }));
        return;
      }
      setState((prev) => ({ ...prev, loading: false, error: "Unable to refresh live QR. Please try again." }));
    } finally {
      isGeneratingRef.current = false;
    }
  };

  const refreshLiveQr = async () => {
    if (!statusPollingAvailable.current || isGeneratingRef.current) return;
    try {
      const res = await api.get<LiveQrPayload>("/api/promoter/live-qr");
      applyLiveQrPayload(res.data, "poll");
    } catch (err: unknown) {
      const status = getResponseStatus(err);
      if (status === 404 || status === 405) {
        statusPollingAvailable.current = false;
      }
    }
  };

  const copyLink = async () => {
    if (!qrUrl) return;
    await copyToClipboard(qrUrl);
    setNote("Link copied.");
  };

  useEffect(() => {
    setOrigin(window.location.origin);
    void generateLiveQr();
  }, []);

  useEffect(() => {
    if (!state.expires_at) return;
    const updateCountdown = () => {
      const next = Math.max(0, Math.ceil((new Date(state.expires_at).getTime() - Date.now()) / 1000));
      setSecondsRemaining(next);
      if (next <= 0 && !hasInactiveCooldown()) void generateLiveQr();
    };
    updateCountdown();
    const timer = setInterval(updateCountdown, 1000);
    return () => clearInterval(timer);
  }, [state.expires_at]);

  useEffect(() => {
    if (!state.qr_data || !statusPollingAvailable.current) return;
    const timer = setInterval(() => { void refreshLiveQr(); }, 3000);
    return () => clearInterval(timer);
  }, [state.qr_data]);

  useEffect(() => {
    if (!state.qr_data) return;
    if (state.status === "active" && state.needs_rotate !== true) return;
    if (isGeneratingRef.current || hasInactiveCooldown()) return;
    const now = Date.now();
    if (now - lastAutoRotateAt.current < 2000) return;
    lastAutoRotateAt.current = now;
    void generateLiveQr(true);
  }, [state.needs_rotate, state.qr_data, state.status]);

  useEffect(() => {
    const handleVisibilityChange = () => {
      if (document.visibilityState === "visible") void refreshLiveQr();
    };
    document.addEventListener("visibilitychange", handleVisibilityChange);
    return () => document.removeEventListener("visibilitychange", handleVisibilityChange);
  }, []);

  return (
    <div className="min-h-screen bg-surface pb-24">
      {!fullscreen && <Header onBack={() => router.back()} />}
      <main className="pt-24 px-6 max-w-md mx-auto">
        <PageIntro />
        <WorkstationCard
          state={state}
          qrUrl={qrUrl}
          seconds={secondsRemaining}
          banner={pausedBanner}
          note={note}
          onCopy={() => void copyLink()}
          onRefresh={() => void generateLiveQr()}
          onFullscreen={() => setFullscreen(true)}
        />
      </main>
      {fullscreen && <FullscreenView qrUrl={qrUrl} state={state} seconds={secondsRemaining} onExit={() => setFullscreen(false)} />}
    </div>
  );
}
