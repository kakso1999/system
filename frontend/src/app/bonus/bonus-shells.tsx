"use client";

import { usePathname, useRouter } from "next/navigation";
import { useEffect, useState, type ReactNode } from "react";
import {
  ChevronLeft,
  ChevronRight,
  Coins,
  Home,
  LayoutDashboard,
  LogOut,
  Megaphone,
  QrCode,
  Receipt,
  Settings,
  Shield,
  ShieldCheck,
  Users,
  Users2,
  Wallet,
  Zap,
} from "lucide-react";
import api from "@/lib/api";
import { clearAuth, getAdminToken, getStaffToken } from "@/lib/auth";

const adminNavItems = [
  { label: "Dashboard", icon: LayoutDashboard, href: "/dashboard" },
  { label: "地推员管理", icon: Users, href: "/staff" },
  { label: "管理员管理", icon: Users2, href: "/admins" },
  { label: "活动管理", icon: Megaphone, href: "/campaigns" },
  { label: "领取记录", icon: Receipt, href: "/claims" },
  { label: "冲单奖励", icon: Zap, href: "/bonus" },
  { label: "财务结算", icon: Wallet, href: "/finance" },
  { label: "风控设置", icon: Shield, href: "/risk-control" },
  { label: "系统设置", icon: Settings, href: "/settings" },
];

const promoterNavItems = [
  { label: "Home", href: "/home", icon: Home },
  { label: "QR Code", href: "/qrcode", icon: QrCode, elevated: true },
  { label: "Team", href: "/team", icon: Users },
  { label: "Earnings", href: "/commission", icon: Coins },
  { label: "Wallet", href: "/wallet", icon: Wallet },
];

function isPromoterActive(pathname: string, href: string) {
  if (pathname === href) return true;
  return href !== "/home" && pathname.startsWith(href);
}

function markBonusRole(role: "admin" | "staff") {
  try {
    window.sessionStorage.setItem("bonus_role", role);
  } catch {
    return;
  }
}

function readBonusRoleIntent() {
  try {
    const value = window.sessionStorage.getItem("bonus_role");
    return value === "admin" || value === "staff" ? value : null;
  } catch {
    return null;
  }
}

function inferBonusRole() {
  const adminToken = getAdminToken();
  const staffToken = getStaffToken();
  if (!adminToken && !staffToken) return null;
  const intent = readBonusRoleIntent();
  if (intent === "admin" && adminToken) return "admin";
  if (intent === "staff" && staffToken) return "staff";
  const referrerPath = typeof document !== "undefined" ? new URL(document.referrer || window.location.href).pathname : "";
  const promoterPaths = ["/home", "/qrcode", "/team", "/commission", "/wallet"];
  const adminPaths = ["/dashboard", "/staff", "/admins", "/campaigns", "/claims", "/finance", "/risk-control", "/settings"];
  if (staffToken && promoterPaths.some((path) => referrerPath.startsWith(path))) return "staff";
  if (adminToken && adminPaths.some((path) => referrerPath.startsWith(path))) return "admin";
  return adminToken ? "admin" : "staff";
}

export function BonusAdminShell({ children }: { children: ReactNode }) {
  const router = useRouter();
  const pathname = usePathname();
  const [collapsed, setCollapsed] = useState(false);

  const handleLogout = () => {
    clearAuth("admin");
    router.push("/admin-login");
  };

  return (
    <div className="flex h-screen bg-surface">
      <aside className={`${collapsed ? "w-20" : "w-64"} flex flex-col border-r border-outline-variant/20 bg-surface-container-lowest transition-all duration-300`}>
        <div className="flex items-center gap-3 p-6">
          <ShieldCheck className="h-7 w-7 flex-shrink-0 text-primary" />
          {!collapsed && <h1 className="font-[var(--font-headline)] text-xl font-extrabold tracking-tighter text-primary">GroundRewards</h1>}
        </div>
        <nav className="flex-1 space-y-1 px-3">
          {adminNavItems.map((item) => {
            const Icon = item.icon;
            const isActive = pathname === item.href;
            return (
              <a key={item.href} href={item.href} onClick={() => { if (item.href === "/bonus") markBonusRole("admin"); }} className={`flex items-center gap-3 rounded-xl px-4 py-3 text-sm font-semibold transition-all ${isActive ? "bg-primary text-on-primary shadow-md shadow-primary/20" : "text-on-surface-variant hover:bg-surface-container-low hover:text-on-surface"}`}>
                <Icon className="h-5 w-5 flex-shrink-0" />
                {!collapsed && <span>{item.label}</span>}
              </a>
            );
          })}
        </nav>
        <div className="border-t border-outline-variant/20 p-3">
          <button onClick={() => setCollapsed((value) => !value)} className="flex w-full items-center gap-3 rounded-xl px-4 py-3 text-sm font-semibold text-on-surface-variant transition-all hover:bg-surface-container-low">
            {collapsed ? <ChevronRight className="h-5 w-5" /> : <ChevronLeft className="h-5 w-5" />}
            {!collapsed && <span>收起</span>}
          </button>
          <button onClick={handleLogout} className="mt-1 flex w-full items-center gap-3 rounded-xl px-4 py-3 text-sm font-semibold text-error transition-all hover:bg-error-container/10">
            <LogOut className="h-5 w-5" />
            {!collapsed && <span>退出登录</span>}
          </button>
        </div>
      </aside>
      <main className="flex-1 overflow-auto">
        <div className="p-8">{children}</div>
      </main>
    </div>
  );
}

export function BonusPromoterShell({ children }: { children: ReactNode }) {
  const pathname = usePathname();

  useEffect(() => {
    const sendHeartbeat = () => {
      if (!getStaffToken()) return;
      api.post("/api/promoter/heartbeat", {}).catch(() => {});
    };
    const intervalId = window.setInterval(sendHeartbeat, 60_000);
    sendHeartbeat();
    return () => window.clearInterval(intervalId);
  }, []);

  return (
    <div className="min-h-screen bg-surface pb-24">
      {children}
      <nav className="fixed bottom-0 left-0 right-0 z-50 px-4 pb-4">
        <div className="mx-auto flex max-w-lg items-end justify-between rounded-t-[2rem] bg-white/80 px-6 py-3 shadow-[0_-10px_30px_rgba(0,0,0,0.08)] backdrop-blur-xl">
          {promoterNavItems.map((item) => {
            const Icon = item.icon;
            const active = isPromoterActive(pathname, item.href);
            if (item.elevated) {
              return (
                <a key={item.href} href={item.href} className={`-mt-7 flex h-16 w-16 flex-col items-center justify-center rounded-full shadow-lg shadow-primary/20 transition-all ${active ? "bg-primary text-on-primary" : "bg-primary/90 text-on-primary hover:bg-primary"}`}>
                  <Icon className="h-6 w-6" />
                  <span className="mt-1 text-[9px] font-bold uppercase tracking-wider">QR</span>
                </a>
              );
            }
            return (
              <a key={item.href} href={item.href} className={`flex flex-col items-center justify-center py-2 transition-colors ${active ? "text-primary" : "text-slate-400"}`}>
                <Icon className="h-6 w-6" />
                <span className="mt-1 text-[11px] font-bold uppercase tracking-wider">{item.label}</span>
              </a>
            );
          })}
        </div>
      </nav>
    </div>
  );
}

export function BonusRoleGate({ admin, promoter }: { admin: ReactNode; promoter: ReactNode }) {
  const router = useRouter();
  const [role, setRole] = useState<"admin" | "staff" | null>(null);

  useEffect(() => {
    const nextRole = inferBonusRole();
    if (nextRole) {
      setRole(nextRole);
      return;
    }
    router.replace("/admin-login");
  }, [router]);

  if (!role) {
    return <div className="flex min-h-screen items-center justify-center bg-surface text-on-surface-variant">Loading...</div>;
  }
  return role === "admin" ? <BonusAdminShell>{admin}</BonusAdminShell> : <BonusPromoterShell>{promoter}</BonusPromoterShell>;
}
