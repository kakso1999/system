"use client";

import { useState } from "react";
import { ShieldCheck, User, Lock, LogIn } from "lucide-react";
import api from "@/lib/api";
import { setAuth } from "@/lib/auth";

export default function AdminLoginPage() {
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setLoading(true);
    try {
      const res = await api.post("/api/auth/admin/login", { username, password });
      setAuth(res.data.access_token, "admin", res.data.refresh_token);
      window.location.href = "/dashboard";
    } catch (err: unknown) {
      console.error("Login error:", err);
      const axiosErr = err as { response?: { data?: { detail?: string } }; message?: string };
      setError(axiosErr.response?.data?.detail || axiosErr.message || "Login failed");
    } finally {
      setLoading(false);
    }
  };

  return (
    <main className="flex-grow flex items-center justify-center p-6 relative overflow-hidden"
      style={{
        backgroundImage: "radial-gradient(circle at 2px 2px, rgba(2,83,205,0.03) 1px, transparent 0)",
        backgroundSize: "40px 40px",
      }}
    >
      <div className="absolute -top-24 -left-24 w-96 h-96 bg-primary/5 rounded-full blur-3xl" />
      <div className="absolute -bottom-24 -right-24 w-96 h-96 bg-secondary/5 rounded-full blur-3xl" />

      <div className="w-full max-w-md relative z-10">
        <div className="text-center mb-10">
          <div className="inline-flex items-center justify-center w-16 h-16 bg-primary-container/30 rounded-2xl mb-6 backdrop-blur-sm">
            <ShieldCheck className="w-8 h-8 text-primary" />
          </div>
          <h1 className="font-[var(--font-headline)] font-extrabold text-4xl tracking-tighter text-primary mb-2">
            GroundRewards
          </h1>
          <p className="font-medium text-on-surface-variant tracking-wide">Administrator Portal</p>
        </div>

        <div className="bg-surface-container-lowest p-8 md:p-10 rounded-xl shadow-[0_20px_40px_rgba(39,44,81,0.06)] border border-outline-variant/10">
          <form onSubmit={handleSubmit} className="space-y-6">
            {error && (
              <div className="bg-error-container/10 text-error text-sm p-3 rounded-lg font-semibold">
                {error}
              </div>
            )}

            <div className="space-y-2">
              <label className="font-[var(--font-label)] text-sm font-bold text-on-surface-variant px-1" htmlFor="username">
                Username
              </label>
              <div className="relative group">
                <div className="absolute inset-y-0 left-0 pl-4 flex items-center pointer-events-none text-outline group-focus-within:text-primary transition-colors">
                  <User className="w-5 h-5" />
                </div>
                <input
                  id="username" type="text" value={username}
                  onChange={(e) => setUsername(e.target.value)}
                  placeholder="Enter administrator ID"
                  className="w-full bg-surface-container-low border-none rounded-xl py-4 pl-12 pr-4 text-on-surface placeholder:text-outline/60 focus:ring-2 focus:ring-primary/40 focus:bg-surface-container transition-all"
                  required
                />
              </div>
            </div>

            <div className="space-y-2">
              <label className="font-[var(--font-label)] text-sm font-bold text-on-surface-variant px-1" htmlFor="password">
                Password
              </label>
              <div className="relative group">
                <div className="absolute inset-y-0 left-0 pl-4 flex items-center pointer-events-none text-outline group-focus-within:text-primary transition-colors">
                  <Lock className="w-5 h-5" />
                </div>
                <input
                  id="password" type="password" value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="Enter password"
                  className="w-full bg-surface-container-low border-none rounded-xl py-4 pl-12 pr-4 text-on-surface placeholder:text-outline/60 focus:ring-2 focus:ring-primary/40 focus:bg-surface-container transition-all"
                  required
                />
              </div>
            </div>

            <button
              type="submit" disabled={loading}
              className="w-full bg-gradient-to-r from-primary to-primary-dim text-on-primary font-[var(--font-headline)] font-bold py-4 rounded-full shadow-lg shadow-primary/20 hover:shadow-xl hover:shadow-primary/30 active:scale-[0.98] transition-all flex items-center justify-center gap-2 disabled:opacity-60"
            >
              <span>{loading ? "Logging in..." : "Login to Dashboard"}</span>
              {!loading && <LogIn className="w-5 h-5" />}
            </button>
          </form>

          <div className="mt-8 pt-8 border-t border-surface-container-high flex flex-col items-center">
            <p className="text-xs font-medium text-on-surface-variant/70 text-center">
              This is a secure system monitored for auditing purposes. Authorized access only.
            </p>
          </div>
        </div>
      </div>

      <footer className="absolute bottom-6 left-0 right-0 text-center">
        <p className="text-xs font-bold text-outline tracking-widest uppercase">
          GroundRewards Global
        </p>
      </footer>
    </main>
  );
}
