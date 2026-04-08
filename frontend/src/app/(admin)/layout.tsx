"use client";

import { useRouter, usePathname } from "next/navigation";
import { clearAuth } from "@/lib/auth";
import { useState } from "react";

const navItems = [
  { label: "Dashboard", icon: "dashboard", href: "/dashboard" },
  { label: "地推员管理", icon: "group", href: "/staff" },
  { label: "活动管理", icon: "campaign", href: "/campaigns" },
  { label: "领取记录", icon: "receipt_long", href: "/claims" },
  { label: "财务结算", icon: "payments", href: "/finance" },
  { label: "风控设置", icon: "shield", href: "/risk-control" },
  { label: "系统设置", icon: "settings", href: "/settings" },
];

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const pathname = usePathname();
  const [collapsed, setCollapsed] = useState(false);

  const handleLogout = () => {
    clearAuth();
    router.push("/admin-login");
  };

  return (
    <div className="flex h-screen bg-surface">
      {/* Sidebar */}
      <aside className={`${collapsed ? "w-20" : "w-64"} bg-surface-container-lowest border-r border-outline-variant/20 flex flex-col transition-all duration-300`}>
        <div className="p-6 flex items-center gap-3">
          <span className="material-symbols-outlined text-primary text-3xl">admin_panel_settings</span>
          {!collapsed && (
            <h1 className="font-[var(--font-headline)] font-extrabold text-xl tracking-tighter text-primary">
              GroundRewards
            </h1>
          )}
        </div>

        <nav className="flex-1 px-3 space-y-1">
          {navItems.map((item) => {
            const isActive = pathname === item.href;
            return (
              <a
                key={item.href}
                href={item.href}
                className={`flex items-center gap-3 px-4 py-3 rounded-xl text-sm font-semibold transition-all ${
                  isActive
                    ? "bg-primary text-on-primary shadow-md shadow-primary/20"
                    : "text-on-surface-variant hover:bg-surface-container-low hover:text-on-surface"
                }`}
              >
                <span className="material-symbols-outlined text-[20px]">{item.icon}</span>
                {!collapsed && <span>{item.label}</span>}
              </a>
            );
          })}
        </nav>

        <div className="p-3 border-t border-outline-variant/20">
          <button
            onClick={() => setCollapsed(!collapsed)}
            className="flex items-center gap-3 px-4 py-3 rounded-xl text-sm font-semibold text-on-surface-variant hover:bg-surface-container-low w-full transition-all"
          >
            <span className="material-symbols-outlined text-[20px]">
              {collapsed ? "chevron_right" : "chevron_left"}
            </span>
            {!collapsed && <span>收起</span>}
          </button>
          <button
            onClick={handleLogout}
            className="flex items-center gap-3 px-4 py-3 rounded-xl text-sm font-semibold text-error hover:bg-error-container/10 w-full transition-all mt-1"
          >
            <span className="material-symbols-outlined text-[20px]">logout</span>
            {!collapsed && <span>退出登录</span>}
          </button>
        </div>
      </aside>

      {/* Main Content */}
      <main className="flex-1 overflow-auto">
        <div className="p-8">{children}</div>
      </main>
    </div>
  );
}
