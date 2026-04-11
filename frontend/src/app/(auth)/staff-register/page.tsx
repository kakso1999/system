"use client";

import { Suspense, useEffect, useState } from "react";
import { BadgeCheck, User, Phone, Lock, Ticket, UserPlus } from "lucide-react";
import { useSearchParams } from "next/navigation";
import api from "@/lib/api";

function StaffRegisterForm() {
  const searchParams = useSearchParams();
  const inviteFromUrl = searchParams.get("invite") || "";
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [inviteCode, setInviteCode] = useState("");
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (inviteFromUrl) {
      setInviteCode(inviteFromUrl);
    }
  }, [inviteFromUrl]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setSuccess("");
    setLoading(true);
    try {
      await api.post("/api/auth/staff/register", {
        name,
        phone,
        username,
        password,
        invite_code: inviteCode || null,
      });
      setSuccess("Registration submitted! Please wait for admin approval.");
      setName("");
      setPhone("");
      setUsername("");
      setPassword("");
    } catch (err: unknown) {
      const axiosErr = err as { response?: { data?: { detail?: string } } };
      setError(axiosErr.response?.data?.detail || "Registration failed");
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

            <button type="submit" disabled={loading}
              className="w-full bg-gradient-to-r from-primary to-primary-dim text-on-primary font-[var(--font-headline)] font-bold py-4 rounded-full shadow-lg shadow-primary/20 hover:shadow-xl active:scale-[0.98] transition-all flex items-center justify-center gap-2 disabled:opacity-60">
              <span>{loading ? "Submitting..." : "Register"}</span>
              {!loading && <UserPlus className="w-5 h-5" />}
            </button>
          </form>

          <div className="mt-6 text-center">
            <a href="/staff-login" className="text-sm text-primary font-bold hover:underline">
              Back to Login
            </a>
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
