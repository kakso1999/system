"use client";

import type { ReactNode } from "react";
import { Gift, type LucideIcon, ShieldAlert, Trophy, Users } from "lucide-react";

export interface RecentClaimItem {
  id: string;
  phone_masked: string;
  wheel_item_name: string;
  prize_type: string;
  status: string;
  staff_name: string;
  created_at: string;
}

export interface RecentRiskItem {
  id: string;
  type: string;
  phone_masked: string;
  ip: string;
  created_at: string;
  reason: string;
}

export interface TodayStaffRankItem {
  staff_id: string;
  staff_name: string;
  scan_count: number;
  valid_count: number;
  commission_cents: number;
}

export interface TodayTeamRankItem {
  staff_id: string;
  staff_name: string;
  team_total_today: number;
  team_commission_cents: number;
}

interface DashboardSectionsProps {
  recentClaims: RecentClaimItem[];
  recentRisk: RecentRiskItem[];
  todayStaffRank: TodayStaffRankItem[];
  todayTeamRank: TodayTeamRankItem[];
}

interface SectionCardProps {
  title: string;
  description: string;
  icon: LucideIcon;
  iconTone: string;
  children: ReactNode;
}

const currencyFormatter = new Intl.NumberFormat("en-PH", {
  style: "currency",
  currency: "PHP",
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

function formatDateTime(value: string) {
  if (!value) return "-";
  return new Date(value).toLocaleString("zh-CN");
}

function formatCurrency(cents: number) {
  return currencyFormatter.format((cents || 0) / 100);
}

function prizeTypeLabel(prizeType: string) {
  if (prizeType === "website") return "网站奖";
  if (prizeType === "onsite") return "现场奖";
  return prizeType || "-";
}

function statusTone(status: string) {
  if (status === "success") return "bg-green-100 text-green-700";
  if (status === "blocked") return "bg-yellow-100 text-yellow-700";
  if (status === "failed") return "bg-red-100 text-red-700";
  return "bg-surface-container-low text-on-surface-variant";
}

function SectionCard({ title, description, icon: Icon, iconTone, children }: SectionCardProps) {
  return (
    <section className="rounded-2xl bg-surface-container-lowest p-5 shadow-sm">
      <div className="mb-4 flex items-start justify-between gap-3">
        <div>
          <h2 className="text-lg font-extrabold font-[var(--font-headline)]">{title}</h2>
          <p className="mt-1 text-sm text-on-surface-variant">{description}</p>
        </div>
        <div className={`rounded-full p-2 ${iconTone}`}>
          <Icon className="h-5 w-5" />
        </div>
      </div>
      {children}
    </section>
  );
}

function EmptyTableRow({ colSpan }: { colSpan: number }) {
  return (
    <tr>
      <td colSpan={colSpan} className="px-4 py-8 text-center text-sm text-on-surface-variant">
        暂无数据
      </td>
    </tr>
  );
}

function RankBadge({ value }: { value: number }) {
  return (
    <span className="inline-flex h-7 w-7 items-center justify-center rounded-full bg-primary/10 text-xs font-extrabold text-primary">
      {value}
    </span>
  );
}

function RecentClaimsSection({ items }: { items: RecentClaimItem[] }) {
  return (
    <SectionCard title="最新有效领取" description="最近成功领取记录" icon={Gift} iconTone="bg-primary/10 text-primary">
      <div className="overflow-x-auto">
        <table className="min-w-[560px] w-full text-sm">
          <thead>
            <tr className="border-b border-surface-container-high">
              {["时间", "手机号", "奖项", "类型", "状态", "地推员"].map((label) => (
                <th key={label} className="px-4 py-3 text-left text-xs font-bold uppercase tracking-wider text-on-surface-variant">{label}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {items.length === 0 ? <EmptyTableRow colSpan={6} /> : items.map((item) => (
              <tr key={item.id} className="border-b border-surface-container-high/40 last:border-b-0">
                <td className="px-4 py-3 text-xs text-on-surface-variant">{formatDateTime(item.created_at)}</td>
                <td className="px-4 py-3 font-mono text-xs">{item.phone_masked || "-"}</td>
                <td className="px-4 py-3 font-medium">{item.wheel_item_name || "-"}</td>
                <td className="px-4 py-3 text-xs">{prizeTypeLabel(item.prize_type)}</td>
                <td className="px-4 py-3">
                  <span className={`rounded-full px-2 py-1 text-xs font-bold ${statusTone(item.status)}`}>{item.status || "-"}</span>
                </td>
                <td className="px-4 py-3">{item.staff_name || "-"}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </SectionCard>
  );
}

function RecentRiskSection({ items }: { items: RecentRiskItem[] }) {
  return (
    <SectionCard title="最新风控记录" description="最近触发或记录的风控事件" icon={ShieldAlert} iconTone="bg-error/10 text-error">
      <div className="overflow-x-auto">
        <table className="min-w-[560px] w-full text-sm">
          <thead>
            <tr className="border-b border-surface-container-high">
              {["时间", "类型", "手机号", "IP", "原因"].map((label) => (
                <th key={label} className="px-4 py-3 text-left text-xs font-bold uppercase tracking-wider text-on-surface-variant">{label}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {items.length === 0 ? <EmptyTableRow colSpan={5} /> : items.map((item) => (
              <tr key={item.id} className="border-b border-surface-container-high/40 last:border-b-0">
                <td className="px-4 py-3 text-xs text-on-surface-variant">{formatDateTime(item.created_at)}</td>
                <td className="px-4 py-3 font-medium">{item.type || "-"}</td>
                <td className="px-4 py-3 font-mono text-xs">{item.phone_masked || "-"}</td>
                <td className="px-4 py-3 font-mono text-xs">{item.ip || "-"}</td>
                <td className="px-4 py-3 text-xs text-on-surface-variant">{item.reason || "-"}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </SectionCard>
  );
}

function StaffRankSection({ items }: { items: TodayStaffRankItem[] }) {
  return (
    <SectionCard title="今日地推排行" description="按今日有效领取量排序" icon={Trophy} iconTone="bg-secondary/10 text-secondary">
      <div className="overflow-x-auto">
        <table className="min-w-[520px] w-full text-sm">
          <thead>
            <tr className="border-b border-surface-container-high">
              {["排名", "地推员", "扫码", "有效领取", "佣金"].map((label) => (
                <th key={label} className="px-4 py-3 text-left text-xs font-bold uppercase tracking-wider text-on-surface-variant">{label}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {items.length === 0 ? <EmptyTableRow colSpan={5} /> : items.map((item, index) => (
              <tr key={item.staff_id} className="border-b border-surface-container-high/40 last:border-b-0">
                <td className="px-4 py-3"><RankBadge value={index + 1} /></td>
                <td className="px-4 py-3 font-medium">{item.staff_name || item.staff_id}</td>
                <td className="px-4 py-3">{item.scan_count}</td>
                <td className="px-4 py-3 font-bold text-secondary">{item.valid_count}</td>
                <td className="px-4 py-3 font-semibold">{formatCurrency(item.commission_cents)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </SectionCard>
  );
}

function TeamRankSection({ items }: { items: TodayTeamRankItem[] }) {
  return (
    <SectionCard title="今日团队排行" description="按今日团队有效领取量排序" icon={Users} iconTone="bg-tertiary/10 text-tertiary">
      <div className="overflow-x-auto">
        <table className="min-w-[520px] w-full text-sm">
          <thead>
            <tr className="border-b border-surface-container-high">
              {["排名", "地推员", "团队有效领取", "团队佣金"].map((label) => (
                <th key={label} className="px-4 py-3 text-left text-xs font-bold uppercase tracking-wider text-on-surface-variant">{label}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {items.length === 0 ? <EmptyTableRow colSpan={4} /> : items.map((item, index) => (
              <tr key={item.staff_id} className="border-b border-surface-container-high/40 last:border-b-0">
                <td className="px-4 py-3"><RankBadge value={index + 1} /></td>
                <td className="px-4 py-3 font-medium">{item.staff_name || item.staff_id}</td>
                <td className="px-4 py-3 font-bold text-tertiary">{item.team_total_today}</td>
                <td className="px-4 py-3 font-semibold">{formatCurrency(item.team_commission_cents)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </SectionCard>
  );
}

export default function DashboardSections({
  recentClaims,
  recentRisk,
  todayStaffRank,
  todayTeamRank,
}: DashboardSectionsProps) {
  return (
    <div className="grid grid-cols-1 gap-6 xl:grid-cols-2">
      <RecentClaimsSection items={recentClaims} />
      <RecentRiskSection items={recentRisk} />
      <StaffRankSection items={todayStaffRank} />
      <TeamRankSection items={todayTeamRank} />
    </div>
  );
}
