"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { BadgeCheck, User, Lock, LogIn } from "lucide-react";
import api from "@/lib/api";
import { setAuth } from "@/lib/auth";

export default function StaffLoginPage() {
  const router = useRouter();
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setLoading(true);
    try {
      const res = await api.post("/api/auth/staff/login", { username, password });
      setAuth(res.data.access_token, "staff", res.data.refresh_token);
      window.location.href = "/home";
    } catch (err: unknown) {
      const axiosErr = err as { response?: { data?: { detail?: string } } };
      setError(axiosErr.response?.data?.detail || "Login failed");
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
          <p className="font-medium text-on-surface-variant tracking-wide">Promoter Portal</p>
        </div>

        <div className="bg-surface-container-lowest p-8 md:p-10 rounded-xl shadow-[0_20px_40px_rgba(39,44,81,0.06)] border border-outline-variant/10">
          <form onSubmit={handleSubmit} className="space-y-6">
            {error && (
              <div className="bg-error-container/10 text-error text-sm p-3 rounded-lg font-semibold">{error}</div>
            )}
            <div className="space-y-2">
              <label className="text-sm font-bold text-on-surface-variant px-1" htmlFor="username">Username</label>
              <div className="relative group">
                <div className="absolute inset-y-0 left-0 pl-4 flex items-center pointer-events-none text-outline group-focus-within:text-primary transition-colors">
                  <User className="w-5 h-5" />
                </div>
                <input id="username" type="text" value={username} onChange={(e) => setUsername(e.target.value)}
                  placeholder="Enter your username"
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
                  placeholder="Enter password"
                  className="w-full bg-surface-container-low border-none rounded-xl py-4 pl-12 pr-4 text-on-surface placeholder:text-outline/60 focus:ring-2 focus:ring-primary/40 transition-all" required />
              </div>
            </div>
            <button type="submit" disabled={loading}
              className="w-full bg-gradient-to-r from-primary to-primary-dim text-on-primary font-[var(--font-headline)] font-bold py-4 rounded-full shadow-lg shadow-primary/20 hover:shadow-xl active:scale-[0.98] transition-all flex items-center justify-center gap-2 disabled:opacity-60">
              <span>{loading ? "Logging in..." : "Login"}</span>
              {!loading && <LogIn className="w-5 h-5" />}
            </button>
          </form>
          <div className="mt-6 text-center">
            <p className="text-sm text-on-surface-variant">
              Don&apos;t have an account?{" "}
              <a href="/staff-register" className="text-primary font-bold hover:underline">Register here</a>
            </p>
          </div>
        </div>
      </div>
    </main>
  );
}
