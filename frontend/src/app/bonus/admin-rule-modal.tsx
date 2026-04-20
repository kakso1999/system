"use client";

import { Minus, Plus } from "lucide-react";
import type { FormEvent } from "react";
import type { BonusRuleForm, BonusTier, StaffOption } from "./bonus-types";

function updateTier(tiers: BonusTier[], index: number, field: keyof BonusTier, value: number) {
  return tiers.map((tier, tierIndex) => tierIndex === index ? { ...tier, [field]: Math.max(0, value) } : tier);
}

export default function AdminRuleModal(props: {
  mode: "global" | "staff";
  form: BonusRuleForm;
  staff: StaffOption[];
  submitting: boolean;
  onChange: (form: BonusRuleForm) => void;
  onClose: () => void;
  onSubmit: (event: FormEvent) => void;
}) {
  const addTier = () => props.onChange({ ...props.form, tiers: [...props.form.tiers, { threshold: 1, amount: 0 }] });
  const removeTier = (index: number) => {
    const tiers = props.form.tiers.filter((_, tierIndex) => tierIndex !== index);
    props.onChange({ ...props.form, tiers: tiers.length > 0 ? tiers : [{ threshold: 1, amount: 0 }] });
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-inverse-surface/40 px-4 backdrop-blur-sm">
      <div className="w-full max-w-2xl rounded-2xl bg-surface-container-lowest p-6 shadow-2xl">
        <h2 className="font-[var(--font-headline)] text-xl font-extrabold">{props.mode === "global" ? "编辑默认规则" : "新增/编辑专属规则"}</h2>
        <p className="mt-1 text-sm text-on-surface-variant">按有效领取数设置阶梯奖励，保存时会按门槛自动排序。</p>
        <form onSubmit={props.onSubmit} className="mt-6 space-y-4">
          {props.mode === "staff" && (
            <select value={props.form.staff_id} onChange={(event) => props.onChange({ ...props.form, staff_id: event.target.value })} required className="w-full rounded-xl border-none bg-surface-container-low px-4 py-3 text-sm focus:ring-2 focus:ring-primary/40">
              <option value="">选择地推员</option>
              {props.staff.map((item) => <option key={item.id} value={item.id}>{item.name} · {item.staff_no}</option>)}
            </select>
          )}
          <label className="flex items-center gap-3 rounded-xl bg-surface-container-low px-4 py-3 text-sm font-bold">
            <input type="checkbox" checked={props.form.enabled} onChange={(event) => props.onChange({ ...props.form, enabled: event.target.checked })} />
            启用规则
          </label>
          <div className="space-y-3">
            {props.form.tiers.map((tier, index) => (
              <div key={index} className="grid grid-cols-[1fr_1fr_auto] items-center gap-3">
                <input type="number" min="1" value={tier.threshold} onChange={(event) => props.onChange({ ...props.form, tiers: updateTier(props.form.tiers, index, "threshold", Number(event.target.value)) })} placeholder="门槛" className="rounded-xl border-none bg-surface-container-low px-4 py-3 text-sm focus:ring-2 focus:ring-primary/40" required />
                <input type="number" min="0" step="0.01" value={tier.amount} onChange={(event) => props.onChange({ ...props.form, tiers: updateTier(props.form.tiers, index, "amount", Number(event.target.value)) })} placeholder="奖励金额" className="rounded-xl border-none bg-surface-container-low px-4 py-3 text-sm focus:ring-2 focus:ring-primary/40" required />
                <button type="button" onClick={() => removeTier(index)} className="rounded-full p-3 text-error hover:bg-error/10" aria-label="移除阶梯">
                  <Minus className="h-4 w-4" />
                </button>
              </div>
            ))}
          </div>
          <button type="button" onClick={addTier} className="inline-flex items-center gap-2 rounded-full px-4 py-2 text-sm font-bold text-primary hover:bg-primary/10">
            <Plus className="h-4 w-4" />
            添加阶梯
          </button>
          <div className="flex gap-3 pt-2">
            <button type="button" onClick={props.onClose} disabled={props.submitting} className="flex-1 rounded-full border border-outline-variant py-3 text-sm font-bold text-on-surface-variant disabled:opacity-60">取消</button>
            <button type="submit" disabled={props.submitting} className="flex-1 rounded-full bg-primary py-3 text-sm font-bold text-on-primary disabled:opacity-60">{props.submitting ? "保存中..." : "保存"}</button>
          </div>
        </form>
      </div>
    </div>
  );
}
