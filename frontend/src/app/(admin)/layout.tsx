"use client";

import { useRouter, usePathname } from "next/navigation";
import { clearAuth, getAdminToken } from "@/lib/auth";
import { useEffect, useState } from "react";
import { LayoutDashboard, Users, Users2, Megaphone, Receipt, Wallet, Shield, Settings, ChevronLeft, ChevronRight, LogOut, ShieldCheck, Zap } from "lucide-react";

const navItems = [
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

function markBonusRoleIntent(href: string) {
  if (href !== "/bonus") return;
  try {
    window.sessionStorage.setItem("bonus_role", "admin");
  } catch {
    return;
  }
}

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const pathname = usePathname();
  const [collapsed, setCollapsed] = useState(false);
  const [checkingAuth, setCheckingAuth] = useState(true);

  useEffect(() => {
    const token = getAdminToken();
    if (!token) {
      clearAuth("admin");
      router.replace("/admin-login");
      return;
    }
    setCheckingAuth(false);
  }, [router]);

  const handleLogout = () => {
    clearAuth("admin");
    router.push("/admin-login");
  };

  if (checkingAuth) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-surface text-on-surface-variant">
        Loading...
      </div>
    );
  }

  return (
    <div className="flex h-screen bg-surface">
      <aside className={`${collapsed ? "w-20" : "w-64"} bg-surface-container-lowest border-r border-outline-variant/20 flex flex-col transition-all duration-300`}>
        <div className="p-6 flex items-center gap-3">
          <ShieldCheck className="w-7 h-7 text-primary flex-shrink-0" />
          {!collapsed && (
            <h1 className="font-[var(--font-headline)] font-extrabold text-xl tracking-tighter text-primary">
              GroundRewards
            </h1>
          )}
        </div>

        <nav className="flex-1 px-3 space-y-1">
          {navItems.map((item) => {
            const isActive = pathname === item.href;
            const Icon = item.icon;
            return (
              <a key={item.href} href={item.href}
                onClick={() => markBonusRoleIntent(item.href)}
                className={`flex items-center gap-3 px-4 py-3 rounded-xl text-sm font-semibold transition-all ${
                  isActive
                    ? "bg-primary text-on-primary shadow-md shadow-primary/20"
                    : "text-on-surface-variant hover:bg-surface-container-low hover:text-on-surface"
                }`}
              >
                <Icon className="w-5 h-5 flex-shrink-0" />
                {!collapsed && <span>{item.label}</span>}
              </a>
            );
          })}
        </nav>

        <div className="p-3 border-t border-outline-variant/20">
          <button onClick={() => setCollapsed(!collapsed)}
            className="flex items-center gap-3 px-4 py-3 rounded-xl text-sm font-semibold text-on-surface-variant hover:bg-surface-container-low w-full transition-all">
            {collapsed ? <ChevronRight className="w-5 h-5" /> : <ChevronLeft className="w-5 h-5" />}
            {!collapsed && <span>收起</span>}
          </button>
          <button onClick={handleLogout}
            className="flex items-center gap-3 px-4 py-3 rounded-xl text-sm font-semibold text-error hover:bg-error-container/10 w-full transition-all mt-1">
            <LogOut className="w-5 h-5" />
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
