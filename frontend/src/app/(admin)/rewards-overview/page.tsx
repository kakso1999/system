"use client";

import { useEffect, useState } from "react";
import { BadgeCheck, Gift, Percent, Wallet } from "lucide-react";
import api from "@/lib/api";
import type { Campaign, PageResponse } from "@/types";

interface RewardMetrics {
  claims_total: number;
  claims_today: number;
  claims_onsite: number;
  claims_website: number;
  claims_settled: number;
  claims_pending: number;
  reward_codes_total: number;
  reward_codes_unused: number;
  reward_codes_assigned: number;
  reward_codes_redeemed: number;
  redeem_rate: number;
  commission_paid_cents: number;
  commission_approved_cents: number;
}

interface RewardCampaignOverview extends RewardMetrics {
  id: string;
  name: string;
  status: Campaign["status"] | string;
}

interface RewardOverviewResponse {
  campaigns: RewardCampaignOverview[];
  totals: RewardMetrics;
}

function createEmptyMetrics(): RewardMetrics {
  return {
    claims_total: 0,
    claims_today: 0,
    claims_onsite: 0,
    claims_website: 0,
    claims_settled: 0,
    claims_pending: 0,
    reward_codes_total: 0,
    reward_codes_unused: 0,
    reward_codes_assigned: 0,
    reward_codes_redeemed: 0,
    redeem_rate: 0,
    commission_paid_cents: 0,
    commission_approved_cents: 0,
  };
}

function createEmptyData(): RewardOverviewResponse {
  return { campaigns: [], totals: createEmptyMetrics() };
}

function formatCount(value: number) {
  return value.toLocaleString("zh-CN");
}

function formatPercent(value: number) {
  return `${(value * 100).toFixed(2)}%`;
}

function formatMoney(cents: number) {
  return `${(cents / 100).toFixed(2)} PHP`;
}

function statusBadge(status: string) {
  const styles: Record<string, [string, string]> = {
    active: ["bg-green-100 text-green-700", "进行中"],
    paused: ["bg-yellow-100 text-yellow-700", "暂停"],
    draft: ["bg-gray-100 text-gray-600", "草稿"],
    ended: ["bg-red-100 text-red-700", "已结束"],
  };
  const [tone, label] = styles[status] || ["bg-gray-100 text-gray-600", status];
  return <span className={`inline-flex rounded-full px-2 py-1 text-xs font-bold ${tone}`}>{label}</span>;
}

function StatCard(props: {
  label: string;
  value: string;
  icon: typeof BadgeCheck;
  color: string;
}) {
  const Icon = props.icon;
  return (
    <div className="bg-surface-container-lowest p-6 rounded-xl shadow-sm">
      <div className="mb-3 flex items-center justify-between">
        <span className="text-xs font-bold uppercase tracking-wider text-on-surface-variant">{props.label}</span>
        <Icon className={`h-5 w-5 ${props.color}`} />
      </div>
      <div className="text-2xl font-extrabold font-[var(--font-headline)]">{props.value}</div>
    </div>
  );
}

function useCampaignOptions() {
  const [campaigns, setCampaigns] = useState<Campaign[]>([]);
  const [campaignsLoading, setCampaignsLoading] = useState(true);

  useEffect(() => {
    let active = true;
    async function loadCampaignOptions() {
      setCampaignsLoading(true);
      try {
        const res = await api.get<PageResponse<Campaign>>("/api/admin/campaigns/", { params: { page: 1, page_size: 100 } });
        if (active) {
          setCampaigns(res.data.items || []);
        }
      } catch {
        if (active) {
          setCampaigns([]);
        }
      } finally {
        if (active) {
          setCampaignsLoading(false);
        }
      }
    }
    void loadCampaignOptions();
    return () => { active = false; };
  }, []);

  return { campaigns, campaignsLoading };
}

function useRewardOverview(selectedCampaignId: string) {
  const [data, setData] = useState<RewardOverviewResponse>(createEmptyData());
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let active = true;
    async function loadOverview() {
      setLoading(true);
      try {
        const params = selectedCampaignId ? { campaign_id: selectedCampaignId } : {};
        const res = await api.get<RewardOverviewResponse>("/api/admin/dashboard/reward-overview", { params });
        if (active) {
          setData({
            campaigns: res.data.campaigns || [],
            totals: { ...createEmptyMetrics(), ...(res.data.totals || {}) },
          });
        }
      } catch {
        if (active) {
          setData(createEmptyData());
        }
      } finally {
        if (active) {
          setLoading(false);
        }
      }
    }
    void loadOverview();
    return () => { active = false; };
  }, [selectedCampaignId]);

  return { data, loading };
}

function FilterBar(props: {
  campaigns: Campaign[];
  campaignsLoading: boolean;
  selectedCampaignId: string;
  onCampaignChange: (value: string) => void;
}) {
  const { campaigns, campaignsLoading, selectedCampaignId, onCampaignChange } = props;
  return (
    <div className="w-full max-w-sm">
      <label className="mb-2 block text-sm font-bold text-on-surface-variant">
        {campaignsLoading ? "活动列表加载中..." : "活动筛选"}
      </label>
      <select
        value={selectedCampaignId}
        disabled={campaignsLoading}
        onChange={(event) => onCampaignChange(event.target.value)}
        className="w-full rounded-xl border-none bg-surface-container-lowest px-4 py-3 text-sm shadow-sm focus:ring-2 focus:ring-primary/40 disabled:opacity-60"
      >
        <option value="">全部活动</option>
        {campaigns.map((campaign) => (
          <option key={campaign.id} value={campaign.id}>{campaign.name}</option>
        ))}
      </select>
    </div>
  );
}

function TotalsGrid({ totals }: { totals: RewardMetrics }) {
  const stats = [
    { label: "总领取", value: formatCount(totals.claims_total), icon: BadgeCheck, color: "text-primary" },
    { label: "码池总量", value: formatCount(totals.reward_codes_total), icon: Gift, color: "text-secondary" },
    { label: "总核销率", value: formatPercent(totals.redeem_rate), icon: Percent, color: "text-tertiary" },
    { label: "已付佣金", value: formatMoney(totals.commission_paid_cents), icon: Wallet, color: "text-secondary" },
  ];
  return (
    <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-4">
      {stats.map((stat) => (
        <StatCard key={stat.label} label={stat.label} value={stat.value} icon={stat.icon} color={stat.color} />
      ))}
    </div>
  );
}

function CampaignRow({ campaign }: { campaign: RewardCampaignOverview }) {
  return (
    <tr className="transition-colors hover:bg-surface-container-low/40">
      <td className="px-6 py-4">
        <div className="font-semibold text-on-surface">{campaign.name}</div>
        <div className="mt-1 font-mono text-xs text-on-surface-variant">{campaign.id}</div>
      </td>
      <td className="px-6 py-4">{statusBadge(campaign.status)}</td>
      <td className="px-6 py-4 font-semibold">{formatCount(campaign.claims_total)}</td>
      <td className="px-6 py-4 text-xs text-on-surface-variant">
        <div>现场 <span className="font-semibold text-on-surface">{formatCount(campaign.claims_onsite)}</span></div>
        <div className="mt-1">网站 <span className="font-semibold text-on-surface">{formatCount(campaign.claims_website)}</span></div>
      </td>
      <td className="px-6 py-4 font-semibold text-green-700">{formatCount(campaign.claims_settled)}</td>
      <td className="px-6 py-4 font-semibold text-amber-700">{formatCount(campaign.claims_pending)}</td>
      <td className="px-6 py-4 text-xs text-on-surface-variant">
        <div>未用 <span className="font-semibold text-on-surface">{formatCount(campaign.reward_codes_unused)}</span></div>
        <div className="mt-1">已分配 <span className="font-semibold text-on-surface">{formatCount(campaign.reward_codes_assigned)}</span></div>
        <div className="mt-1">已核销 <span className="font-semibold text-on-surface">{formatCount(campaign.reward_codes_redeemed)}</span></div>
      </td>
      <td className="px-6 py-4 font-semibold">{formatPercent(campaign.redeem_rate)}</td>
      <td className="px-6 py-4 font-semibold">{formatMoney(campaign.commission_paid_cents)}</td>
    </tr>
  );
}

function OverviewTable(props: { campaigns: RewardCampaignOverview[]; loading: boolean }) {
  const { campaigns, loading } = props;
  return (
    <div className="overflow-x-auto rounded-xl bg-surface-container-lowest shadow-sm">
      <table className="w-full min-w-[1100px] text-sm">
        <thead>
          <tr className="border-b border-surface-container-high">
            {["活动", "状态", "总领取", "现场/网站", "已结算", "待结算", "码池未用/已分配/已核销", "核销率", "已付佣金"].map((header) => (
              <th key={header} className="px-6 py-4 text-left text-xs font-bold uppercase tracking-wider text-on-surface-variant">
                {header}
              </th>
            ))}
          </tr>
        </thead>
        <tbody className="divide-y divide-outline-variant/40">
          {loading ? (
            <tr>
              <td colSpan={9} className="px-6 py-10 text-center text-on-surface-variant">加载中...</td>
            </tr>
          ) : campaigns.length === 0 ? (
            <tr>
              <td colSpan={9} className="px-6 py-10 text-center text-on-surface-variant">暂无活动数据</td>
            </tr>
          ) : campaigns.map((campaign) => <CampaignRow key={campaign.id} campaign={campaign} />)}
        </tbody>
      </table>
    </div>
  );
}

export default function RewardsOverviewPage() {
  const [selectedCampaignId, setSelectedCampaignId] = useState("");
  const { campaigns, campaignsLoading } = useCampaignOptions();
  const { data, loading } = useRewardOverview(selectedCampaignId);

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 xl:flex-row xl:items-end xl:justify-between">
        <div>
          <h1 className="text-3xl font-extrabold font-[var(--font-headline)] tracking-tight">奖励管理视角</h1>
          <p className="mt-1 text-on-surface-variant">按活动聚合查看领取、码池、核销和佣金状态</p>
        </div>
        <FilterBar campaigns={campaigns} campaignsLoading={campaignsLoading} selectedCampaignId={selectedCampaignId} onCampaignChange={setSelectedCampaignId} />
      </div>
      <TotalsGrid totals={data.totals} />
      <OverviewTable campaigns={data.campaigns} loading={loading} />
    </div>
  );
}
