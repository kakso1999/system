"use client";

import { Pencil, Plus, Trash2 } from "lucide-react";
import type { BonusRule, StaffOption } from "./bonus-types";
import { formatDateTime, formatRuleTiers, getStaffLabel } from "./bonus-utils";

function StatusBadge({ enabled }: { enabled: boolean }) {
  return <span className={`rounded-full px-3 py-1 text-xs font-bold ${enabled ? "bg-green-100 text-green-700" : "bg-red-100 text-red-700"}`}>{enabled ? "启用" : "停用"}</span>;
}

export default function AdminRulesTab(props: {
  globalRule: BonusRule | null;
  overrides: BonusRule[];
  staffMap: Map<string, StaffOption>;
  loading: boolean;
  updatingId: string;
  onAdd: () => void;
  onEditGlobal: () => void;
  onEdit: (rule: BonusRule) => void;
  onToggle: (rule: BonusRule) => void;
  onDelete: (rule: BonusRule) => void;
}) {
  return (
    <section className="space-y-5">
      <article className="rounded-xl bg-surface-container-lowest p-6 shadow-sm">
        <div className="flex items-start justify-between gap-4">
          <div>
            <p className="text-xs font-bold uppercase tracking-wider text-on-surface-variant">默认规则</p>
            <h2 className="mt-1 font-[var(--font-headline)] text-2xl font-extrabold text-primary">Global Default</h2>
            <p className="mt-2 text-sm text-on-surface-variant">{props.globalRule ? formatRuleTiers(props.globalRule.tiers) : "暂无默认规则"}</p>
          </div>
          <div className="flex items-center gap-3">
            {props.globalRule && <StatusBadge enabled={props.globalRule.enabled} />}
            <button onClick={props.onEditGlobal} className="rounded-full bg-primary px-4 py-2 text-sm font-bold text-on-primary">
              {props.globalRule ? "编辑" : "创建默认规则"}
            </button>
          </div>
        </div>
      </article>

      <div className="flex items-center justify-between gap-4">
        <div>
          <h2 className="font-[var(--font-headline)] text-xl font-extrabold">专属规则</h2>
          <p className="text-sm text-on-surface-variant">为单个地推员覆盖默认阶梯奖励。</p>
        </div>
        <button onClick={props.onAdd} className="inline-flex items-center gap-2 rounded-full bg-primary px-5 py-3 text-sm font-bold text-on-primary shadow-lg shadow-primary/20">
          <Plus className="h-4 w-4" />
          新增规则
        </button>
      </div>

      <div className="overflow-x-auto rounded-xl bg-surface-container-lowest shadow-sm">
        <table className="w-full min-w-[900px] text-sm">
          <thead>
            <tr className="border-b border-surface-container-high">
              {["地推员", "员工编号", "奖励阶梯", "状态", "更新时间", "操作"].map((header) => <th key={header} className="px-6 py-4 text-left text-xs font-bold uppercase tracking-wider text-on-surface-variant">{header}</th>)}
            </tr>
          </thead>
          <tbody>
            {props.loading && <tr><td colSpan={6} className="px-6 py-10 text-center text-on-surface-variant">加载中...</td></tr>}
            {!props.loading && props.overrides.length === 0 && <tr><td colSpan={6} className="px-6 py-10 text-center text-on-surface-variant">暂无专属规则</td></tr>}
            {!props.loading && props.overrides.map((rule) => {
              const staff = getStaffLabel(rule.staff_id || undefined, props.staffMap);
              return (
                <tr key={rule.id} className="border-b border-surface-container-high/50 transition-colors hover:bg-surface-container-low/50">
                  <td className="px-6 py-4 font-semibold">{rule.staff_name || staff.name}</td>
                  <td className="px-6 py-4 font-mono text-xs">{staff.no || "-"}</td>
                  <td className="px-6 py-4 text-xs text-on-surface-variant">{formatRuleTiers(rule.tiers)}</td>
                  <td className="px-6 py-4"><StatusBadge enabled={rule.enabled} /></td>
                  <td className="px-6 py-4 text-xs text-on-surface-variant">{formatDateTime(rule.updated_at)}</td>
                  <td className="px-6 py-4">
                    <div className="flex flex-wrap gap-2">
                      <button onClick={() => props.onEdit(rule)} className="inline-flex items-center gap-1 rounded-full px-3 py-1.5 text-xs font-bold text-primary hover:bg-primary/10"><Pencil className="h-3.5 w-3.5" />编辑</button>
                      <button onClick={() => props.onToggle(rule)} disabled={props.updatingId === rule.id} className="rounded-full px-3 py-1.5 text-xs font-bold text-on-surface hover:bg-surface-container-low disabled:opacity-50">{rule.enabled ? "停用" : "启用"}</button>
                      <button onClick={() => props.onDelete(rule)} className="inline-flex items-center gap-1 rounded-full px-3 py-1.5 text-xs font-bold text-error hover:bg-error/10"><Trash2 className="h-3.5 w-3.5" />删除</button>
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </section>
  );
}
