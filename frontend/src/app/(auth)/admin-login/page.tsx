"use client";

import { useEffect, useState, type FormEvent } from "react";
import { ShieldCheck, User, Lock, LogIn } from "lucide-react";
import api from "@/lib/api";
import { clearAuth, setAuth } from "@/lib/auth";

type PendingAuth = { accessToken: string; refreshToken?: string; oldPassword: string };
type PasswordModalProps = {
  submitting: boolean;
  newPassword: string;
  confirmPassword: string;
  error: string;
  onNewPasswordChange: (value: string) => void;
  onConfirmPasswordChange: (value: string) => void;
  onSubmit: (event: FormEvent) => void;
};
type LoginState = ReturnType<typeof useLoginState>;

function getErrorDetail(error: unknown, fallback: string) {
  const axiosErr = error as { response?: { data?: { detail?: string } }; message?: string };
  return axiosErr.response?.data?.detail || axiosErr.message || fallback;
}

function PasswordInput({
  id,
  label,
  value,
  placeholder,
  onChange,
}: {
  id: string;
  label: string;
  value: string;
  placeholder: string;
  onChange: (value: string) => void;
}) {
  return (
    <div className="space-y-2">
      <label className="px-1 text-sm font-bold text-on-surface-variant" htmlFor={id}>{label}</label>
      <div className="group relative">
        <div className="pointer-events-none absolute inset-y-0 left-0 flex items-center pl-4 text-outline transition-colors group-focus-within:text-primary">
          <Lock className="h-5 w-5" />
        </div>
        <input id={id} type="password" value={value} onChange={(event) => onChange(event.target.value)} placeholder={placeholder} className="w-full rounded-xl border-none bg-surface-container-low py-4 pl-12 pr-4 text-on-surface placeholder:text-outline/60 transition-all focus:bg-surface-container focus:ring-2 focus:ring-primary/40" required />
      </div>
    </div>
  );
}

function UsernameInput({ value, onChange }: { value: string; onChange: (value: string) => void }) {
  return (
    <div className="space-y-2">
      <label className="px-1 text-sm font-bold text-on-surface-variant" htmlFor="username">用户名</label>
      <div className="group relative">
        <div className="pointer-events-none absolute inset-y-0 left-0 flex items-center pl-4 text-outline transition-colors group-focus-within:text-primary">
          <User className="h-5 w-5" />
        </div>
        <input id="username" type="text" value={value} onChange={(event) => onChange(event.target.value)} placeholder="请输入管理员账号" className="w-full rounded-xl border-none bg-surface-container-low py-4 pl-12 pr-4 text-on-surface placeholder:text-outline/60 transition-all focus:bg-surface-container focus:ring-2 focus:ring-primary/40" required />
      </div>
    </div>
  );
}

function LoginCard(props: {
  username: string;
  password: string;
  error: string;
  loading: boolean;
  pendingAuth: PendingAuth | null;
  onUsernameChange: (value: string) => void;
  onPasswordChange: (value: string) => void;
  onSubmit: (event: FormEvent) => void;
}) {
  const { username, password, error, loading, pendingAuth, onUsernameChange, onPasswordChange, onSubmit } = props;
  return (
    <div className="rounded-xl border border-outline-variant/10 bg-surface-container-lowest p-8 shadow-[0_20px_40px_rgba(39,44,81,0.06)] md:p-10">
      <form onSubmit={onSubmit} className="space-y-6">
        {error && <div className="rounded-lg bg-error-container/10 p-3 text-sm font-semibold text-error">{error}</div>}
        <UsernameInput value={username} onChange={onUsernameChange} />
        <PasswordInput id="password" label="密码" value={password} placeholder="请输入密码" onChange={onPasswordChange} />
        <button type="submit" disabled={loading} className="flex w-full items-center justify-center gap-2 rounded-full bg-gradient-to-r from-primary to-primary-dim py-4 font-[var(--font-headline)] font-bold text-on-primary shadow-lg shadow-primary/20 transition-all hover:shadow-xl hover:shadow-primary/30 active:scale-[0.98] disabled:opacity-60">
          <span>{loading && !pendingAuth ? "登录中..." : "登录后台"}</span>
          {!loading && <LogIn className="h-5 w-5" />}
        </button>
      </form>
      <div className="mt-8 flex flex-col items-center border-t border-surface-container-high pt-8">
        <p className="text-center text-xs font-medium text-on-surface-variant/70">此系统为受控后台，仅限授权管理员使用。</p>
      </div>
    </div>
  );
}

function ForcePasswordModal(props: PasswordModalProps) {
  const { submitting, newPassword, confirmPassword, error, onNewPasswordChange, onConfirmPasswordChange, onSubmit } = props;
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-inverse-surface/50 px-4 backdrop-blur-sm">
      <div className="w-full max-w-md rounded-2xl border border-outline-variant/10 bg-surface-container-lowest p-8 shadow-2xl">
        <h2 className="text-2xl font-extrabold font-[var(--font-headline)] text-on-surface">首次登录请修改密码</h2>
        <p className="mt-2 text-sm text-on-surface-variant">为了账号安全，当前账号必须先完成密码修改后才能进入后台。</p>
        <form onSubmit={onSubmit} className="mt-6 space-y-4">
          {error && <div className="rounded-lg bg-error-container/10 p-3 text-sm font-semibold text-error">{error}</div>}
          <PasswordInput id="new-password" label="新密码" value={newPassword} placeholder="请输入新密码" onChange={onNewPasswordChange} />
          <PasswordInput id="confirm-password" label="确认新密码" value={confirmPassword} placeholder="请再次输入新密码" onChange={onConfirmPasswordChange} />
          <button type="submit" disabled={submitting} className="w-full rounded-full bg-primary py-4 text-sm font-bold text-on-primary disabled:opacity-60">
            {submitting ? "提交中..." : "确认修改并进入后台"}
          </button>
        </form>
      </div>
    </div>
  );
}

function LoginHero() {
  return (
    <div className="mb-10 text-center">
      <div className="mb-6 inline-flex h-16 w-16 items-center justify-center rounded-2xl bg-primary-container/30 backdrop-blur-sm">
        <ShieldCheck className="h-8 w-8 text-primary" />
      </div>
      <h1 className="mb-2 font-[var(--font-headline)] text-4xl font-extrabold tracking-tighter text-primary">GroundRewards</h1>
      <p className="font-medium tracking-wide text-on-surface-variant">管理员后台登录</p>
    </div>
  );
}

function useLoginState() {
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [pendingAuth, setPendingAuth] = useState<PendingAuth | null>(null);
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [passwordError, setPasswordError] = useState("");

  useEffect(() => { clearAuth(); }, []);

  const finishLogin = (mustChangePassword: boolean) => {
    setAuth("admin", mustChangePassword);
    window.location.href = "/dashboard";
  };

  const clearPasswordState = () => {
    setPendingAuth(null);
    setNewPassword("");
    setConfirmPassword("");
    setPasswordError("");
  };

  return { username, password, error, loading, pendingAuth, newPassword, confirmPassword, passwordError, setUsername, setPassword, setError, setLoading, setPendingAuth, setNewPassword, setConfirmPassword, setPasswordError, finishLogin, clearPasswordState };
}

async function submitLogin(event: FormEvent, state: LoginState) {
  event.preventDefault();
  state.setError("");
  state.setLoading(true);
  try {
    const res = await api.post("/api/auth/admin/login", { username: state.username, password: state.password });
    if (res.data.must_change_password) {
      state.setPendingAuth({ accessToken: res.data.access_token, refreshToken: res.data.refresh_token, oldPassword: state.password });
      return;
    }
    state.finishLogin(false);
  } catch (err) {
    console.error("Login error:", err);
    state.setError(getErrorDetail(err, "登录失败"));
  } finally {
    state.setLoading(false);
  }
}

function validateNewPassword(state: LoginState) {
  if (!state.newPassword.trim() || !state.confirmPassword.trim()) return "请输入完整的新密码";
  if (state.newPassword !== state.confirmPassword) return "两次输入的密码不一致";
  return "";
}

async function submitForcedPassword(event: FormEvent, state: LoginState) {
  event.preventDefault();
  if (!state.pendingAuth) return;
  const validationError = validateNewPassword(state);
  if (validationError) return state.setPasswordError(validationError);

  state.setPasswordError("");
  state.setLoading(true);
  try {
    await api.post("/api/auth/admin/password", { old_password: state.pendingAuth.oldPassword, new_password: state.newPassword });
    state.clearPasswordState();
    state.finishLogin(true);
  } catch (err) {
    state.setPasswordError(getErrorDetail(err, "修改密码失败"));
  } finally {
    state.setLoading(false);
  }
}

export default function AdminLoginPage() {
  const state = useLoginState();
  return (
    <main className="relative flex flex-grow items-center justify-center overflow-hidden p-6" style={{ backgroundImage: "radial-gradient(circle at 2px 2px, rgba(2,83,205,0.03) 1px, transparent 0)", backgroundSize: "40px 40px" }}>
      <div className="absolute -left-24 -top-24 h-96 w-96 rounded-full bg-primary/5 blur-3xl" />
      <div className="absolute -bottom-24 -right-24 h-96 w-96 rounded-full bg-secondary/5 blur-3xl" />
      <div className="relative z-10 w-full max-w-md">
        <LoginHero />
        <LoginCard username={state.username} password={state.password} error={state.error} loading={state.loading} pendingAuth={state.pendingAuth} onUsernameChange={state.setUsername} onPasswordChange={state.setPassword} onSubmit={(event) => submitLogin(event, state)} />
      </div>
      <footer className="absolute bottom-6 left-0 right-0 text-center">
        <p className="text-xs font-bold uppercase tracking-widest text-outline">GroundRewards Global</p>
      </footer>
      {state.pendingAuth && <ForcePasswordModal submitting={state.loading} newPassword={state.newPassword} confirmPassword={state.confirmPassword} error={state.passwordError} onNewPasswordChange={state.setNewPassword} onConfirmPasswordChange={state.setConfirmPassword} onSubmit={(event) => submitForcedPassword(event, state)} />}
    </main>
  );
}
