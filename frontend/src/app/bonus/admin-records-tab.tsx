"use client";

import type { BonusClaimRecord, BonusRecordStatus, BonusSettlement, StaffOption } from "./bonus-types";
import { formatDateTime, getStaffLabel, toPoints } from "./bonus-utils";

type Filters = {
  status: "" | BonusRecordStatus;
  date_from: string;
  date_to: string;
  staff_id: string;
};

function statusBadge(status: string) {
  const tone = status === "settled" ? "bg-green-100 text-green-700" : "bg-primary/10 text-primary";
  return <span className={`rounded-full px-3 py-1 text-xs font-bold ${tone}`}>{status === "settled" ? "已结算" : "已领取"}</span>;
}

function SettlementStats({ settlements }: { settlements: BonusSettlement[] }) {
  const totalBonus = settlements.reduce((sum, item) => sum + Number(item.total_bonus || 0), 0);
  const totalValid = settlements.reduce((sum, item) => sum + Number(item.total_valid || 0), 0);
  return (
    <section className="grid grid-cols-3 gap-4">
      <article className="rounded-xl bg-surface-container-lowest p-5 shadow-sm">
        <p className="text-xs font-bold uppercase tracking-wider text-on-surface-variant">结算批次</p>
        <p className="mt-2 font-[var(--font-headline)] text-2xl font-extrabold text-primary">{settlements.length}</p>
      </article>
      <article className="rounded-xl bg-surface-container-lowest p-5 shadow-sm">
        <p className="text-xs font-bold uppercase tracking-wider text-on-surface-variant">结算奖励</p>
        <p className="mt-2 font-[var(--font-headline)] text-2xl font-extrabold text-primary">{toPoints(totalBonus)}</p>
      </article>
      <article className="rounded-xl bg-surface-container-lowest p-5 shadow-sm">
        <p className="text-xs font-bold uppercase tracking-wider text-on-surface-variant">有效领取</p>
        <p className="mt-2 font-[var(--font-headline)] text-2xl font-extrabold text-primary">{totalValid}</p>
      </article>
    </section>
  );
}

function FiltersSection(props: {
  filters: Filters;
  staff: StaffOption[];
  onChange: (filters: Filters) => void;
  onReset: () => void;
}) {
  const update = (patch: Partial<Filters>) => props.onChange({ ...props.filters, ...patch });
  return (
    <section className="rounded-xl bg-surface-container-lowest p-4 shadow-sm">
      <div className="grid grid-cols-5 gap-3">
        <select value={props.filters.status} onChange={(event) => update({ status: event.target.value as Filters["status"] })} className="rounded-xl border-none bg-surface-container-low px-4 py-3 text-sm focus:ring-2 focus:ring-primary/40">
          <option value="">全部状态</option>
          <option value="claimed">已领取</option>
          <option value="settled">已结算</option>
        </select>
        <input type="date" value={props.filters.date_from} onChange={(event) => update({ date_from: event.target.value })} className="rounded-xl border-none bg-surface-container-low px-4 py-3 text-sm focus:ring-2 focus:ring-primary/40" />
        <input type="date" value={props.filters.date_to} onChange={(event) => update({ date_to: event.target.value })} className="rounded-xl border-none bg-surface-container-low px-4 py-3 text-sm focus:ring-2 focus:ring-primary/40" />
        <select value={props.filters.staff_id} onChange={(event) => update({ staff_id: event.target.value })} className="rounded-xl border-none bg-surface-container-low px-4 py-3 text-sm focus:ring-2 focus:ring-primary/40">
          <option value="">全部地推员</option>
          {props.staff.map((item) => <option key={item.id} value={item.id}>{item.name} · {item.staff_no}</option>)}
        </select>
        <button onClick={props.onReset} className="rounded-xl px-4 py-3 text-sm font-bold text-error hover:bg-error/10">清除筛选</button>
      </div>
    </section>
  );
}

function RecordsTable(props: {
  records: BonusClaimRecord[];
  staffMap: Map<string, StaffOption>;
  loading: boolean;
}) {
  return (
    <div className="overflow-x-auto rounded-xl bg-surface-container-lowest shadow-sm">
      <table className="w-full min-w-[1000px] text-sm">
        <thead>
          <tr className="border-b border-surface-container-high">
            {["日期", "地推员", "员工编号", "奖励档位", "金额", "领取时有效数", "状态", "创建时间"].map((header) => <th key={header} className="px-6 py-4 text-left text-xs font-bold uppercase tracking-wider text-on-surface-variant">{header}</th>)}
          </tr>
        </thead>
        <tbody>
          {props.loading && <tr><td colSpan={8} className="px-6 py-10 text-center text-on-surface-variant">加载中...</td></tr>}
          {!props.loading && props.records.length === 0 && <tr><td colSpan={8} className="px-6 py-10 text-center text-on-surface-variant">暂无奖励记录</td></tr>}
          {!props.loading && props.records.map((record) => {
            const staff = getStaffLabel(record.staff_id, props.staffMap);
            return (
              <tr key={record.id} className="border-b border-surface-container-high/50 transition-colors hover:bg-surface-container-low/50">
                <td className="px-6 py-4 font-semibold">{record.date}</td>
                <td className="px-6 py-4 font-semibold">{staff.name}</td>
                <td className="px-6 py-4 font-mono text-xs">{staff.no || "-"}</td>
                <td className="px-6 py-4">{record.tier_threshold}</td>
                <td className="px-6 py-4 font-bold text-primary">{toPoints(record.amount)}</td>
                <td className="px-6 py-4">{record.valid_count_at_claim}</td>
                <td className="px-6 py-4">{statusBadge(record.status)}</td>
                <td className="px-6 py-4 text-xs text-on-surface-variant">{formatDateTime(record.created_at)}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

export default function AdminRecordsTab(props: {
  filters: Filters;
  staff: StaffOption[];
  staffMap: Map<string, StaffOption>;
  records: BonusClaimRecord[];
  settlements: BonusSettlement[];
  loading: boolean;
  page: number;
  totalPages: number;
  batchSettleCount: number;
  settlingBatch: boolean;
  onFiltersChange: (filters: Filters) => void;
  onResetFilters: () => void;
  onBatchSettle: () => void;
  onPrev: () => void;
  onNext: () => void;
}) {
  return (
    <section className="space-y-5">
      <SettlementStats settlements={props.settlements} />
      <FiltersSection filters={props.filters} staff={props.staff} onChange={props.onFiltersChange} onReset={props.onResetFilters} />
      <div className="flex justify-end">
        <button
          onClick={props.onBatchSettle}
          disabled={props.loading || props.settlingBatch || props.batchSettleCount === 0}
          className="rounded-xl bg-primary px-4 py-3 text-sm font-bold text-on-primary disabled:cursor-not-allowed disabled:opacity-50"
        >
          {props.settlingBatch ? "结算中..." : `批量结算${props.batchSettleCount > 0 ? `（${props.batchSettleCount}）` : ""}`}
        </button>
      </div>
      <RecordsTable records={props.records} staffMap={props.staffMap} loading={props.loading} />
      <div className="flex items-center justify-center gap-2">
        <button onClick={props.onPrev} disabled={props.page === 1} className="rounded-lg px-4 py-2 text-sm font-semibold text-on-surface-variant hover:bg-surface-container-low disabled:opacity-40">上一页</button>
        <span className="px-4 text-sm text-on-surface-variant">{props.page} / {props.totalPages}</span>
        <button onClick={props.onNext} disabled={props.page === props.totalPages} className="rounded-lg px-4 py-2 text-sm font-semibold text-on-surface-variant hover:bg-surface-container-low disabled:opacity-40">下一页</button>
      </div>
    </section>
  );
}

export type { Filters as AdminRecordFilters };
