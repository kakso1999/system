"use client";

import { Suspense, useEffect, useState } from "react";
import { BadgeCheck, User, Phone, Lock, Ticket, UserPlus, RefreshCw } from "lucide-react";
import { useSearchParams } from "next/navigation";
import api from "@/lib/api";
import { getPublicSettings } from "@/lib/public-settings";

type StaffRegisterSettings = {
  staff_register_enabled?: boolean;
};

type StaffRegisterPublicSettings = StaffRegisterSettings & {
  customer_service_whatsapp?: string;
  staff_register_captcha_enabled?: boolean;
};

type CaptchaResponse = {
  token: string;
  question: string;
};

function getErrorMessage(error: unknown, fallback: string) {
  const axiosErr = error as { response?: { data?: { detail?: string | { message?: string } } } };
  const detail = axiosErr.response?.data?.detail;
  if (typeof detail === "string") return detail;
  if (detail && typeof detail === "object" && typeof detail.message === "string") {
    return detail.message;
  }
  return fallback;
}

function isCaptchaInvalid(error: unknown) {
  const axiosErr = error as { response?: { status?: number; data?: { detail?: string | { code?: string } } } };
  const detail = axiosErr.response?.data?.detail;
  return axiosErr.response?.status === 400 && typeof detail === "object" && detail?.code === "captcha_invalid";
}

function StaffRegisterForm() {
  const searchParams = useSearchParams();
  const inviteFromUrl = searchParams.get("invite") || "";
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [inviteCode, setInviteCode] = useState("");
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [loading, setLoading] = useState(false);
  const [staffRegisterEnabled, setStaffRegisterEnabled] = useState<boolean | null>(null);
  const [staffRegisterCaptchaEnabled, setStaffRegisterCaptchaEnabled] = useState(false);
  const [customerServiceWhatsapp, setCustomerServiceWhatsapp] = useState("");
  const [captchaToken, setCaptchaToken] = useState("");
  const [captchaQuestion, setCaptchaQuestion] = useState("");
  const [captchaAnswer, setCaptchaAnswer] = useState("");
  const [captchaLoading, setCaptchaLoading] = useState(false);

  useEffect(() => {
    if (inviteFromUrl) {
      setInviteCode(inviteFromUrl);
    }
  }, [inviteFromUrl]);

  const refreshCaptcha = async () => {
    setCaptchaLoading(true);
    setCaptchaToken("");
    setCaptchaQuestion("");
    setCaptchaAnswer("");
    try {
      const { data } = await api.get<CaptchaResponse>("/api/auth/staff/captcha");
      setCaptchaToken(data.token);
      setCaptchaQuestion(data.question);
    } catch {
      setCaptchaQuestion("Unable to load captcha");
    } finally {
      setCaptchaLoading(false);
    }
  };

  useEffect(() => {
    let active = true;
    getPublicSettings().then((settings) => {
      if (active) {
        const publicSettings = settings as StaffRegisterPublicSettings;
        setStaffRegisterEnabled(publicSettings.staff_register_enabled ?? true);
        setStaffRegisterCaptchaEnabled(publicSettings.staff_register_captcha_enabled === true);
        setCustomerServiceWhatsapp(publicSettings.customer_service_whatsapp || "");
      }
    });
    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
    if (!staffRegisterCaptchaEnabled) {
      setCaptchaToken("");
      setCaptchaQuestion("");
      setCaptchaAnswer("");
      return;
    }
    void refreshCaptcha();
  }, [staffRegisterCaptchaEnabled]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (staffRegisterEnabled === false) {
      setError("Registration currently closed — contact admin.");
      return;
    }
    setError("");
    setSuccess("");
    if (password !== confirmPassword) {
      setError("Passwords do not match");
      return;
    }
    setLoading(true);
    try {
      await api.post("/api/auth/staff/register", {
        name,
        phone,
        username,
        password,
        invite_code: inviteCode || null,
        captcha_token: captchaToken,
        captcha_answer: captchaAnswer,
      });
      setSuccess("Registration submitted! Please wait for admin approval.");
      setName("");
      setPhone("");
      setUsername("");
      setPassword("");
      setConfirmPassword("");
      setCaptchaAnswer("");
      if (staffRegisterCaptchaEnabled) {
        void refreshCaptcha();
      }
    } catch (err: unknown) {
      if (isCaptchaInvalid(err)) {
        setError("Captcha incorrect, try again");
        void refreshCaptcha();
      } else {
        setError(getErrorMessage(err, "Registration failed"));
      }
    } finally {
      setLoading(false);
    }
  };

  return (
    <main className="flex-grow flex items-center justify-center p-6 relative overflow-hidden bg-surface">
      <div className="absolute -top-24 -right-24 w-96 h-96 bg-primary/5 rounded-full blur-3xl" />
      <div className="absolute -bottom-24 -left-24 w-96 h-96 bg-secondary-container/20 rounded-full blur-3xl" />

      <div className="w-full max-w-md relative z-10">
        <div className="text-center mb-10">
          <div className="inline-flex items-center justify-center w-16 h-16 bg-secondary-container/30 rounded-2xl mb-6">
            <BadgeCheck className="w-8 h-8 text-secondary" />
          </div>
          <h1 className="font-[var(--font-headline)] font-extrabold text-4xl tracking-tighter text-primary mb-2">
            GroundRewards
          </h1>
          <p className="font-medium text-on-surface-variant tracking-wide">Join as Promoter</p>
        </div>

        <div className="bg-surface-container-lowest p-8 md:p-10 rounded-xl shadow-[0_20px_40px_rgba(39,44,81,0.06)] border border-outline-variant/10">
          {staffRegisterEnabled === null ? (
            <div className="py-10 text-center text-sm font-semibold text-on-surface-variant">Loading...</div>
          ) : staffRegisterEnabled === false ? (
            <div className="rounded-lg bg-surface-container-low p-4 text-sm font-semibold text-on-surface-variant">
              Registration currently closed — contact admin.
            </div>
          ) : (
            <form onSubmit={handleSubmit} className="space-y-6">
              {error && (
                <div className="bg-error-container/10 text-error text-sm p-3 rounded-lg font-semibold">{error}</div>
              )}
              {success && (
                <div className="bg-secondary-container/30 text-secondary text-sm p-3 rounded-lg font-semibold">{success}</div>
              )}

              <div className="space-y-2">
                <label className="text-sm font-bold text-on-surface-variant px-1" htmlFor="name">Name</label>
                <div className="relative group">
                  <div className="absolute inset-y-0 left-0 pl-4 flex items-center pointer-events-none text-outline group-focus-within:text-primary transition-colors">
                    <User className="w-5 h-5" />
                  </div>
                  <input id="name" type="text" value={name} onChange={(e) => setName(e.target.value)}
                    placeholder="Enter your full name"
                    className="w-full bg-surface-container-low border-none rounded-xl py-4 pl-12 pr-4 text-on-surface placeholder:text-outline/60 focus:ring-2 focus:ring-primary/40 transition-all" required />
                </div>
              </div>

              <div className="space-y-2">
                <label className="text-sm font-bold text-on-surface-variant px-1" htmlFor="phone">Phone</label>
                <div className="relative group">
                  <div className="absolute inset-y-0 left-0 pl-4 flex items-center pointer-events-none text-outline group-focus-within:text-primary transition-colors">
                    <Phone className="w-5 h-5" />
                  </div>
                  <input id="phone" type="text" value={phone} onChange={(e) => setPhone(e.target.value)}
                    placeholder="Enter your phone number"
                    className="w-full bg-surface-container-low border-none rounded-xl py-4 pl-12 pr-4 text-on-surface placeholder:text-outline/60 focus:ring-2 focus:ring-primary/40 transition-all" required />
                </div>
              </div>

              <div className="space-y-2">
                <label className="text-sm font-bold text-on-surface-variant px-1" htmlFor="username">Username</label>
                <div className="relative group">
                  <div className="absolute inset-y-0 left-0 pl-4 flex items-center pointer-events-none text-outline group-focus-within:text-primary transition-colors">
                    <User className="w-5 h-5" />
                  </div>
                  <input id="username" type="text" value={username} onChange={(e) => setUsername(e.target.value)}
                    placeholder="Choose a username"
                    className="w-full bg-surface-container-low border-none rounded-xl py-4 pl-12 pr-4 text-on-surface placeholder:text-outline/60 focus:ring-2 focus:ring-primary/40 transition-all" required />
                </div>
              </div>

              <div className="space-y-2">
                <label className="text-sm font-bold text-on-surface-variant px-1" htmlFor="password">Password</label>
                <div className="relative group">
                  <div className="absolute inset-y-0 left-0 pl-4 flex items-center pointer-events-none text-outline group-focus-within:text-primary transition-colors">
                    <Lock className="w-5 h-5" />
                  </div>
                  <input id="password" type="password" value={password} onChange={(e) => setPassword(e.target.value)}
                    placeholder="Create a password"
                    className="w-full bg-surface-container-low border-none rounded-xl py-4 pl-12 pr-4 text-on-surface placeholder:text-outline/60 focus:ring-2 focus:ring-primary/40 transition-all" required />
                </div>
              </div>

              <div className="space-y-2">
                <label className="text-sm font-bold text-on-surface-variant px-1" htmlFor="confirmPassword">Confirm Password</label>
                <div className="relative group">
                  <div className="absolute inset-y-0 left-0 pl-4 flex items-center pointer-events-none text-outline group-focus-within:text-primary transition-colors">
                    <Lock className="w-5 h-5" />
                  </div>
                  <input id="confirmPassword" type="password" value={confirmPassword} onChange={(e) => setConfirmPassword(e.target.value)}
                    placeholder="Confirm your password"
                    className="w-full bg-surface-container-low border-none rounded-xl py-4 pl-12 pr-4 text-on-surface placeholder:text-outline/60 focus:ring-2 focus:ring-primary/40 transition-all" required />
                </div>
              </div>

              <div className="space-y-2">
                <label className="text-sm font-bold text-on-surface-variant px-1" htmlFor="inviteCode">Invite Code</label>
                <div className="relative group">
                  <div className="absolute inset-y-0 left-0 pl-4 flex items-center pointer-events-none text-outline group-focus-within:text-primary transition-colors">
                    <Ticket className="w-5 h-5" />
                  </div>
                  <input id="inviteCode" type="text" value={inviteCode} onChange={(e) => setInviteCode(e.target.value)}
                    placeholder="Enter invite code (optional)"
                    className="w-full bg-surface-container-low border-none rounded-xl py-4 pl-12 pr-4 text-on-surface placeholder:text-outline/60 focus:ring-2 focus:ring-primary/40 transition-all" />
                </div>
                {inviteFromUrl && (
                  <p className="text-xs text-on-surface-variant px-1">Invited by {inviteFromUrl}</p>
                )}
              </div>

              {staffRegisterCaptchaEnabled && (
                <div className="space-y-2">
                  <div className="flex items-center justify-between gap-3 px-1">
                    <label className="text-sm font-bold text-on-surface-variant" htmlFor="captchaAnswer">
                      {captchaQuestion || "Loading captcha..."}
                    </label>
                    <button
                      type="button"
                      onClick={() => void refreshCaptcha()}
                      disabled={captchaLoading}
                      className="inline-flex h-9 w-9 items-center justify-center rounded-full bg-surface-container-low text-primary transition-all hover:bg-surface-container active:scale-[0.98] disabled:opacity-60"
                      aria-label="Refresh captcha"
                    >
                      <RefreshCw className={`h-4 w-4 ${captchaLoading ? "animate-spin" : ""}`} />
                    </button>
                  </div>
                  <input
                    id="captchaAnswer"
                    type="number"
                    value={captchaAnswer}
                    onChange={(e) => setCaptchaAnswer(e.target.value)}
                    placeholder="Enter the answer"
                    className="w-full bg-surface-container-low border-none rounded-xl py-4 px-4 text-on-surface placeholder:text-outline/60 focus:ring-2 focus:ring-primary/40 transition-all"
                    required
                  />
                </div>
              )}

              <button type="submit" disabled={loading || captchaLoading || (staffRegisterCaptchaEnabled && !captchaToken)}
                className="w-full bg-gradient-to-r from-primary to-primary-dim text-on-primary font-[var(--font-headline)] font-bold py-4 rounded-full shadow-lg shadow-primary/20 hover:shadow-xl active:scale-[0.98] transition-all flex items-center justify-center gap-2 disabled:opacity-60">
                <span>{loading ? "Submitting..." : "Register"}</span>
                {!loading && <UserPlus className="w-5 h-5" />}
              </button>
            </form>
          )}

          <div className="mt-6 text-center">
            <a href="/staff-login" className="text-sm text-primary font-bold hover:underline">
              Back to Login
            </a>
            {customerServiceWhatsapp.trim() && (
              <div className="mt-3">
                <a
                  href={customerServiceWhatsapp}
                  target="_blank"
                  rel="noreferrer"
                  className="text-sm text-primary font-bold hover:underline"
                >
                  Need help? Contact us on WhatsApp
                </a>
              </div>
            )}
          </div>
        </div>
      </div>
    </main>
  );
}

export default function StaffRegisterPage() {
  return (
    <Suspense fallback={<div className="min-h-screen flex items-center justify-center bg-surface text-on-surface-variant">Loading...</div>}>
      <StaffRegisterForm />
    </Suspense>
  );
}
