"use client";

import { useCallback, useEffect, useState } from "react";
import { Ban, Gift, RotateCcw } from "lucide-react";
import api from "@/lib/api";
import type { PageResponse } from "@/types";

type RewardStatus = "issued" | "voided";

interface TeamRewardItem {
  id: string;
  staff_id: string;
  staff_name: string;
  staff_no?: string;
  milestone: string;
  threshold: number;
  amount: number;
  amount_cents: number;
  team_total: number;
  status: RewardStatus;
  created_at: string;
  commission_log_id?: string | null;
}

interface SystemSetting {
  key: string;
  value: string | number | boolean;
}

interface MilestoneOption {
  value: string;
  label: string;
  threshold: number;
}

interface ReissueForm {
  staff_id: string;
  milestone: string;
  remark: string;
}

const baseMilestones = [
  { value: "team_reward_100", settingKey: "team_reward_100_threshold", fallback: 100 },
  { value: "team_reward_1000", settingKey: "team_reward_1000_threshold", fallback: 1000 },
  { value: "team_reward_10000", settingKey: "team_reward_10000_threshold", fallback: 10000 },
] as const;

const defaultMilestoneOptions: MilestoneOption[] = baseMilestones.map((item) => ({
  value: item.value,
  label: `${item.fallback} 人团队奖励`,
  threshold: item.fallback,
}));

const statusOptions: { value: RewardStatus | ""; label: string }[] = [
  { value: "", label: "全部状态" },
  { value: "issued", label: "已发放" },
  { value: "voided", label: "已作废" },
];

const statusLabels: Record<RewardStatus, string> = {
  issued: "已发放",
  voided: "已作废",
};

const statusStyles: Record<RewardStatus, string> = {
  issued: "bg-green-100 text-green-700",
  voided: "bg-gray-100 text-gray-700",
};

function formatMoney(amount: number) {
  return `PHP ${Number(amount || 0).toFixed(2)}`;
}

function formatCount(value: number) {
  return Number(value || 0).toLocaleString("en-US");
}

function formatDate(value: string) {
  return new Date(value).toLocaleString();
}

function errorDetail(error: unknown, fallback: string) {
  const axiosError = error as { response?: { data?: { detail?: string } } };
  return axiosError.response?.data?.detail || fallback;
}

function buildMilestoneOptions(settings: SystemSetting[]) {
  const thresholds = new Map(settings.map((item) => [item.key, Number(item.value)]));
  return baseMilestones.map((item) => {
    const threshold = thresholds.get(item.settingKey) || item.fallback;
    return { value: item.value, label: `${threshold} 人团队奖励`, threshold };
  });
}

function milestoneLabel(value: string, options: MilestoneOption[]) {
  return options.find((item) => item.value === value)?.label || value;
}

function StatusBadge({ status }: { status: RewardStatus }) {
  return (
    <span className={`rounded-full px-2 py-1 text-xs font-bold ${statusStyles[status]}`}>
      {statusLabels[status]}
    </span>
  );
}

function Pagination({
  page,
  totalPages,
  onPrev,
  onNext,
}: {
  page: number;
  totalPages: number;
  onPrev: () => void;
  onNext: () => void;
}) {
  if (totalPages <= 1) return null;
  return (
    <div className="flex items-center justify-center gap-2">
      <button
        onClick={onPrev}
        disabled={page === 1}
        className="rounded-lg px-4 py-2 text-sm font-semibold text-on-surface-variant hover:bg-surface-container-low disabled:opacity-40"
      >
        上一页
      </button>
      <span className="px-4 text-sm text-on-surface-variant">{page} / {totalPages}</span>
      <button
        onClick={onNext}
        disabled={page === totalPages}
        className="rounded-lg px-4 py-2 text-sm font-semibold text-on-surface-variant hover:bg-surface-container-low disabled:opacity-40"
      >
        下一页
      </button>
    </div>
  );
}

function ReissueModal({
  form,
  milestones,
  submitting,
  onChange,
  onCancel,
  onConfirm,
}: {
  form: ReissueForm;
  milestones: MilestoneOption[];
  submitting: boolean;
  onChange: (patch: Partial<ReissueForm>) => void;
  onCancel: () => void;
  onConfirm: () => void;
}) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-4">
      <div className="w-full max-w-md rounded-xl bg-surface-container-lowest p-6 shadow-xl">
        <h2 className="flex items-center gap-2 text-xl font-extrabold font-[var(--font-headline)]">
          <Gift className="h-5 w-5 text-primary" />
          手动补发团队奖励
        </h2>
        <div className="mt-4 space-y-3">
          <input
            type="text"
            value={form.staff_id}
            onChange={(event) => onChange({ staff_id: event.target.value })}
            placeholder="请输入地推员 ID"
            className="w-full rounded-xl border-none bg-surface-container-low px-4 py-3 text-sm focus:ring-2 focus:ring-primary/40"
          />
          <select
            value={form.milestone}
            onChange={(event) => onChange({ milestone: event.target.value })}
            className="w-full rounded-xl border-none bg-surface-container-low px-4 py-3 text-sm focus:ring-2 focus:ring-primary/40"
          >
            {milestones.map((item) => (
              <option key={item.value} value={item.value}>{item.label}</option>
            ))}
          </select>
          <textarea
            value={form.remark}
            onChange={(event) => onChange({ remark: event.target.value })}
            placeholder="备注（可选）"
            className="min-h-28 w-full rounded-xl border-none bg-surface-container-low px-4 py-3 text-sm focus:ring-2 focus:ring-primary/40"
          />
        </div>
        <div className="mt-5 flex justify-end gap-3">
          <button
            onClick={onCancel}
            className="rounded-xl px-4 py-2 text-sm font-bold text-on-surface-variant hover:bg-surface-container-low"
          >
            取消
          </button>
          <button
            onClick={onConfirm}
            disabled={submitting || !form.staff_id.trim() || !form.milestone}
            className="rounded-xl bg-primary px-4 py-2 text-sm font-bold text-on-primary disabled:opacity-50"
          >
            {submitting ? "提交中..." : "确认补发"}
          </button>
        </div>
      </div>
    </div>
  );
}

function VoidModal({
  submitting,
  remark,
  title,
  onRemarkChange,
  onCancel,
  onConfirm,
}: {
  submitting: boolean;
  remark: string;
  title: string;
  onRemarkChange: (value: string) => void;
  onCancel: () => void;
  onConfirm: () => void;
}) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-4">
      <div className="w-full max-w-md rounded-xl bg-surface-container-lowest p-6 shadow-xl">
        <h2 className="flex items-center gap-2 text-xl font-extrabold font-[var(--font-headline)]">
          <Ban className="h-5 w-5 text-error" />
          作废团队奖励
        </h2>
        <p className="mt-1 text-sm text-on-surface-variant">{title}</p>
        <textarea
          value={remark}
          onChange={(event) => onRemarkChange(event.target.value)}
          placeholder="备注（可选）"
          className="mt-4 min-h-28 w-full rounded-xl border-none bg-surface-container-low px-4 py-3 text-sm focus:ring-2 focus:ring-primary/40"
        />
        <div className="mt-5 flex justify-end gap-3">
          <button
            onClick={onCancel}
            className="rounded-xl px-4 py-2 text-sm font-bold text-on-surface-variant hover:bg-surface-container-low"
          >
            取消
          </button>
          <button
            onClick={onConfirm}
            disabled={submitting}
            className="rounded-xl bg-error px-4 py-2 text-sm font-bold text-on-error disabled:opacity-50"
          >
            {submitting ? "提交中..." : "确认作废"}
          </button>
        </div>
      </div>
    </div>
  );
}

export default function TeamRewardsPage() {
  const [items, setItems] = useState<TeamRewardItem[]>([]);
  const [milestones, setMilestones] = useState<MilestoneOption[]>(defaultMilestoneOptions);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(true);
  const [staffKeyword, setStaffKeyword] = useState("");
  const [milestoneFilter, setMilestoneFilter] = useState("");
  const [statusFilter, setStatusFilter] = useState<RewardStatus | "">("");
  const [showReissue, setShowReissue] = useState(false);
  const [reissueForm, setReissueForm] = useState<ReissueForm>({ staff_id: "", milestone: defaultMilestoneOptions[0].value, remark: "" });
  const [submittingReissue, setSubmittingReissue] = useState(false);
  const [voidTarget, setVoidTarget] = useState<TeamRewardItem | null>(null);
  const [voidRemark, setVoidRemark] = useState("");
  const [actioningId, setActioningId] = useState("");

  const loadMilestones = useCallback(async () => {
    try {
      const res = await api.get<SystemSetting[]>("/api/admin/settings/", { params: { group: "team_reward" } });
      setMilestones(buildMilestoneOptions(res.data || []));
    } catch {
      setMilestones(defaultMilestoneOptions);
    }
  }, []);

  const loadRewards = useCallback(async () => {
    setLoading(true);
    try {
      const params: Record<string, string | number> = { page, page_size: 20 };
      if (staffKeyword.trim()) params.staff_id = staffKeyword.trim();
      if (milestoneFilter) params.milestone = milestoneFilter;
      if (statusFilter) params.status = statusFilter;
      const res = await api.get<PageResponse<TeamRewardItem>>("/api/admin/team-rewards", { params });
      setItems(res.data.items || []);
      setTotal(res.data.total || 0);
    } catch {
      setItems([]);
      setTotal(0);
    } finally {
      setLoading(false);
    }
  }, [page, staffKeyword, milestoneFilter, statusFilter]);

  useEffect(() => { loadMilestones(); }, [loadMilestones]);
  useEffect(() => { loadRewards(); }, [loadRewards]);
  useEffect(() => {
    setReissueForm((current) => current.milestone ? current : { ...current, milestone: milestones[0]?.value || "" });
  }, [milestones]);

  const resetFilters = () => {
    setStaffKeyword("");
    setMilestoneFilter("");
    setStatusFilter("");
    setPage(1);
  };

  const submitReissue = async () => {
    setSubmittingReissue(true);
    try {
      const payload = { ...reissueForm, staff_id: reissueForm.staff_id.trim(), remark: reissueForm.remark.trim() };
      await api.post("/api/admin/team-rewards/reissue", payload);
      setShowReissue(false);
      setReissueForm({ staff_id: "", milestone: milestones[0]?.value || "", remark: "" });
      await loadRewards();
    } catch (error: unknown) {
      alert(errorDetail(error, "补发失败"));
    } finally {
      setSubmittingReissue(false);
    }
  };

  const submitVoid = async () => {
    if (!voidTarget) return;
    setActioningId(voidTarget.id);
    try {
      await api.post(`/api/admin/team-rewards/${voidTarget.id}/void`, { remark: voidRemark.trim() });
      setVoidTarget(null);
      setVoidRemark("");
      await loadRewards();
    } catch (error: unknown) {
      alert(errorDetail(error, "作废失败"));
    } finally {
      setActioningId("");
    }
  };

  const totalPages = Math.max(1, Math.ceil(total / 20));
  const hasFilters = Boolean(staffKeyword || milestoneFilter || statusFilter);

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
        <div>
          <h1 className="text-3xl font-extrabold font-[var(--font-headline)] tracking-tight">团队奖励</h1>
          <p className="mt-1 text-on-surface-variant">管理团队里程碑奖励发放与作废，共 {total} 条记录</p>
        </div>
        <button
          onClick={() => setShowReissue(true)}
          className="inline-flex items-center gap-2 rounded-full bg-primary px-4 py-2 text-sm font-bold text-on-primary shadow-sm"
        >
          <RotateCcw className="h-4 w-4" />
          手动补发
        </button>
      </div>

      <div className="space-y-3 rounded-xl bg-surface-container-lowest p-4 shadow-sm">
        <div className="flex flex-col gap-3 lg:flex-row">
          <input
            type="text"
            value={staffKeyword}
            onChange={(event) => { setStaffKeyword(event.target.value); setPage(1); }}
            placeholder="搜索姓名 / 编号 / 手机 / ID"
            className="flex-1 rounded-xl border-none bg-surface-container-low px-4 py-3 text-sm focus:ring-2 focus:ring-primary/40"
          />
          <select
            value={milestoneFilter}
            onChange={(event) => { setMilestoneFilter(event.target.value); setPage(1); }}
            className="rounded-xl border-none bg-surface-container-low px-4 py-3 text-sm focus:ring-2 focus:ring-primary/40"
          >
            <option value="">全部里程碑</option>
            {milestones.map((item) => (
              <option key={item.value} value={item.value}>{item.label}</option>
            ))}
          </select>
          <select
            value={statusFilter}
            onChange={(event) => { setStatusFilter(event.target.value as RewardStatus | ""); setPage(1); }}
            className="rounded-xl border-none bg-surface-container-low px-4 py-3 text-sm focus:ring-2 focus:ring-primary/40"
          >
            {statusOptions.map((item) => (
              <option key={item.value || "all"} value={item.value}>{item.label}</option>
            ))}
          </select>
          {hasFilters && (
            <button
              onClick={resetFilters}
              className="rounded-xl px-4 py-2 text-sm font-semibold text-error transition-colors hover:bg-error/10"
            >
              清除筛选
            </button>
          )}
        </div>
      </div>

      <div className="overflow-x-auto rounded-xl bg-surface-container-lowest shadow-sm">
        <table className="min-w-[1100px] w-full text-sm">
          <thead>
            <tr className="border-b border-surface-container-high">
              {["时间", "地推员", "里程碑", "团队总数", "门槛", "奖励金额", "状态", "佣金单", "操作"].map((header) => (
                <th key={header} className="px-6 py-4 text-left text-xs font-bold uppercase tracking-wider text-on-surface-variant">
                  {header}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr><td colSpan={9} className="px-6 py-8 text-center text-on-surface-variant">加载中...</td></tr>
            ) : items.length === 0 ? (
              <tr><td colSpan={9} className="px-6 py-8 text-center text-on-surface-variant">暂无数据</td></tr>
            ) : (
              items.map((item) => (
                <tr key={item.id} className="border-b border-surface-container-high/50 transition-colors hover:bg-surface-container-low/50">
                  <td className="px-6 py-4 text-xs text-on-surface-variant">{formatDate(item.created_at)}</td>
                  <td className="px-6 py-4">
                    <div className="font-semibold">{item.staff_name || "-"}</div>
                    <div className="text-xs text-on-surface-variant">{item.staff_no || item.staff_id}</div>
                  </td>
                  <td className="px-6 py-4 font-semibold">{milestoneLabel(item.milestone, milestones)}</td>
                  <td className="px-6 py-4">{formatCount(item.team_total)}</td>
                  <td className="px-6 py-4">{formatCount(item.threshold)}</td>
                  <td className="px-6 py-4 font-semibold">{formatMoney(item.amount)}</td>
                  <td className="px-6 py-4"><StatusBadge status={item.status} /></td>
                  <td className="px-6 py-4 font-mono text-xs">{item.commission_log_id || "-"}</td>
                  <td className="px-6 py-4">
                    {item.status === "voided" ? (
                      <span className="text-on-surface-variant">-</span>
                    ) : (
                      <button
                        onClick={() => { setVoidTarget(item); setVoidRemark(""); }}
                        disabled={actioningId === item.id}
                        className="rounded-lg bg-error/10 px-3 py-1 text-xs font-bold text-error transition-colors hover:bg-error/15 disabled:opacity-50"
                      >
                        作废
                      </button>
                    )}
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      <Pagination
        page={page}
        totalPages={totalPages}
        onPrev={() => setPage((current) => Math.max(1, current - 1))}
        onNext={() => setPage((current) => Math.min(totalPages, current + 1))}
      />

      {showReissue && (
        <ReissueModal
          form={reissueForm}
          milestones={milestones}
          submitting={submittingReissue}
          onChange={(patch) => setReissueForm((current) => ({ ...current, ...patch }))}
          onCancel={() => setShowReissue(false)}
          onConfirm={submitReissue}
        />
      )}

      {voidTarget && (
        <VoidModal
          submitting={actioningId === voidTarget.id}
          remark={voidRemark}
          title={`${voidTarget.staff_name || "未命名"} · ${milestoneLabel(voidTarget.milestone, milestones)}`}
          onRemarkChange={setVoidRemark}
          onCancel={() => { setVoidTarget(null); setVoidRemark(""); }}
          onConfirm={submitVoid}
        />
      )}
    </div>
  );
}
