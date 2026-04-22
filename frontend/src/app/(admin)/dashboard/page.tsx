"use client";

import { useEffect, useState } from "react";
import { ScanLine, CheckCircle, UserPlus, BarChart3, BadgeCheck, UsersRound, Wallet } from "lucide-react";
import api from "@/lib/api";
import DashboardSections, {
  type RecentClaimItem,
  type RecentRiskItem,
  type TodayStaffRankItem,
  type TodayTeamRankItem,
} from "./dashboard-sections";

interface DashboardData {
  today_scans: number; today_valid: number; today_staff: number;
  total_scans: number; total_valid: number; total_staff: number; total_commission: number;
}

export default function DashboardPage() {
  const [data, setData] = useState<DashboardData | null>(null);
  const [pendingCount, setPendingCount] = useState(0);
  const [recentClaims, setRecentClaims] = useState<RecentClaimItem[]>([]);
  const [recentRisk, setRecentRisk] = useState<RecentRiskItem[]>([]);
  const [todayStaffRank, setTodayStaffRank] = useState<TodayStaffRankItem[]>([]);
  const [todayTeamRank, setTodayTeamRank] = useState<TodayTeamRankItem[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => { loadDashboard(); }, []);

  const loadDashboard = async () => {
    try {
      const [dashboardRes, pendingRes, recentClaimsRes, recentRiskRes, todayStaffRankRes, todayTeamRankRes] = await Promise.all([
        api.get("/api/admin/dashboard/"),
        api.get("/api/admin/staff/", { params: { status: "pending_review", page: 1, page_size: 1 } }),
        api.get<RecentClaimItem[]>("/api/admin/dashboard/recent-claims"),
        api.get<RecentRiskItem[]>("/api/admin/dashboard/recent-risk"),
        api.get<TodayStaffRankItem[]>("/api/admin/dashboard/today-staff-rank"),
        api.get<TodayTeamRankItem[]>("/api/admin/dashboard/today-team-rank"),
      ]);
      setData(dashboardRes.data);
      setPendingCount(pendingRes.data.total || 0);
      setRecentClaims(recentClaimsRes.data || []);
      setRecentRisk(recentRiskRes.data || []);
      setTodayStaffRank(todayStaffRankRes.data || []);
      setTodayTeamRank(todayTeamRankRes.data || []);
    } catch {
      setData({ today_scans: 0, today_valid: 0, today_staff: 0, total_scans: 0, total_valid: 0, total_staff: 0, total_commission: 0 });
      setPendingCount(0);
      setRecentClaims([]);
      setRecentRisk([]);
      setTodayStaffRank([]);
      setTodayTeamRank([]);
    } finally {
      setLoading(false);
    }
  };

  if (loading) return <div className="flex items-center justify-center h-64 text-on-surface-variant">Loading...</div>;

  const stats = [
    { label: "今日扫码", value: data?.today_scans ?? 0, icon: ScanLine, color: "text-primary" },
    { label: "今日有效领取", value: data?.today_valid ?? 0, icon: CheckCircle, color: "text-secondary" },
    { label: "今日新增地推员", value: data?.today_staff ?? 0, icon: UserPlus, color: "text-tertiary" },
    { label: "总扫码数", value: data?.total_scans ?? 0, icon: BarChart3, color: "text-primary" },
    { label: "总有效领取", value: data?.total_valid ?? 0, icon: BadgeCheck, color: "text-secondary" },
    { label: "总地推员", value: data?.total_staff ?? 0, icon: UsersRound, color: "text-primary" },
    { label: "总佣金(PHP)", value: data?.total_commission?.toFixed(2) ?? "0.00", icon: Wallet, color: "text-secondary" },
  ];

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-3xl font-extrabold font-[var(--font-headline)] tracking-tight">Dashboard</h1>
        <p className="text-on-surface-variant mt-1">系统概览</p>
      </div>
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {stats.map((stat) => {
          const Icon = stat.icon;
          return (
            <div key={stat.label} className="bg-surface-container-lowest p-6 rounded-xl shadow-sm">
              <div className="flex items-center justify-between mb-3">
                <span className="text-xs font-bold text-on-surface-variant uppercase tracking-wider">{stat.label}</span>
                <Icon className={`w-5 h-5 ${stat.color}`} />
              </div>
              <div className="text-2xl font-extrabold font-[var(--font-headline)]">{stat.value}</div>
            </div>
          );
        })}
      </div>
      <a
        href="/staff?status=pending_review"
        className="block bg-yellow-50 border border-yellow-200 rounded-xl p-5 hover:bg-yellow-100/80 transition-colors"
      >
        <p className="text-xs font-bold text-yellow-700 uppercase tracking-wider mb-2">Pending Approvals</p>
        <p className="text-2xl font-extrabold font-[var(--font-headline)] text-yellow-800">{pendingCount}</p>
        <p className="text-sm text-yellow-700 mt-1">{pendingCount} pending registrations</p>
      </a>
      <DashboardSections
        recentClaims={recentClaims}
        recentRisk={recentRisk}
        todayStaffRank={todayStaffRank}
        todayTeamRank={todayTeamRank}
      />
    </div>
  );
}
