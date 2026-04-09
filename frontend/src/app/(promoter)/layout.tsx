"use client";

import { usePathname, useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { Home, QrCode, Users, Wallet } from "lucide-react";
import Cookies from "js-cookie";

type NavItem = {
  label: string;
  href: string;
  icon: typeof Home;
  elevated?: boolean;
};

const navItems: NavItem[] = [
  { label: "Home", href: "/home", icon: Home },
  { label: "QR Code", href: "/qrcode", icon: QrCode, elevated: true },
  { label: "Team", href: "/team", icon: Users },
  { label: "Wallet", href: "/wallet", icon: Wallet },
];

function isActivePath(pathname: string, href: string) {
  if (pathname === href) return true;
  if (href === "/wallet" && pathname.startsWith("/wallet")) return true;
  if (href === "/team" && pathname.startsWith("/team")) return true;
  return false;
}

export default function PromoterLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const [checkingAuth, setCheckingAuth] = useState(true);

  useEffect(() => {
    const token = Cookies.get("token");
    if (!token) {
      router.replace("/staff-login");
      return;
    }
    setCheckingAuth(false);
  }, [router]);

  if (checkingAuth) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-surface text-on-surface-variant">
        Loading...
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-surface pb-24">
      {children}

      <nav className="fixed bottom-0 left-0 right-0 z-50 px-4 pb-4">
        <div className="mx-auto flex max-w-lg items-end justify-between rounded-t-[2rem] bg-white/80 px-6 py-3 shadow-[0_-10px_30px_rgba(0,0,0,0.08)] backdrop-blur-xl">
          {navItems.map((item) => {
            const Icon = item.icon;
            const active = isActivePath(pathname, item.href);
            const baseColor = active ? "text-primary" : "text-slate-400";

            if (item.elevated) {
              return (
                <a
                  key={item.href}
                  href={item.href}
                  className={`-mt-7 flex h-16 w-16 flex-col items-center justify-center rounded-full shadow-lg shadow-primary/20 transition-all ${
                    active ? "bg-primary text-on-primary" : "bg-primary/90 text-on-primary hover:bg-primary"
                  }`}
                >
                  <Icon className="h-6 w-6" />
                  <span className="mt-1 text-[9px] font-bold uppercase tracking-wider">QR</span>
                </a>
              );
            }

            return (
              <a
                key={item.href}
                href={item.href}
                className={`flex flex-col items-center justify-center py-2 transition-colors ${baseColor}`}
              >
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
