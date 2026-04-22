import type { ReactNode } from "react";
import type { AdjustModalState, CancelModalState } from "./manual-commission-shared";

function ModalShell(props: { title: string; subtitle?: string; children: ReactNode }) {
  return <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"><div className="w-full max-w-md space-y-4 rounded-2xl bg-surface-container-lowest p-6 shadow-xl"><div><h3 className="text-xl font-extrabold font-[var(--font-headline)]">{props.title}</h3>{props.subtitle ? <p className="mt-1 text-sm text-on-surface-variant">{props.subtitle}</p> : null}</div>{props.children}</div></div>;
}

export function AdjustCommissionDialog(props: {
  modal: AdjustModalState;
  submitting: boolean;
  onChange: (value: string, remark: string) => void;
  onCancel: () => void;
  onConfirm: () => void;
}) {
  if (!props.modal) return null;
  return <ModalShell title="调整手动佣金" subtitle={props.modal.record.commission_no}><label className="block space-y-2 text-sm"><span className="font-semibold">新金额（PHP）</span><input value={props.modal.amount} onChange={(event) => props.onChange(event.target.value, props.modal.remark)} className="w-full rounded-xl border-none bg-surface-container-low px-4 py-3 focus:ring-2 focus:ring-primary/40" /></label><label className="block space-y-2 text-sm"><span className="font-semibold">调整备注</span><textarea value={props.modal.remark} onChange={(event) => props.onChange(props.modal.amount, event.target.value)} rows={3} placeholder="请输入调整备注" className="w-full rounded-xl border-none bg-surface-container-low px-4 py-3 focus:ring-2 focus:ring-primary/40" /></label><div className="flex justify-end gap-3"><button onClick={props.onCancel} disabled={props.submitting} className="rounded-xl px-4 py-2 text-sm font-bold text-on-surface-variant hover:bg-surface-container-low disabled:opacity-50">取消</button><button onClick={props.onConfirm} disabled={props.submitting} className="rounded-xl bg-primary px-4 py-2 text-sm font-bold text-on-primary disabled:opacity-50">{props.submitting ? "提交中..." : "确认调整"}</button></div></ModalShell>;
}

export function CancelCommissionDialog(props: {
  modal: CancelModalState;
  submitting: boolean;
  onChange: (remark: string) => void;
  onCancel: () => void;
  onConfirm: () => void;
}) {
  if (!props.modal) return null;
  return <ModalShell title="取消手动佣金" subtitle={props.modal.record.commission_no}><label className="block space-y-2 text-sm"><span className="font-semibold">取消原因</span><textarea value={props.modal.remark} onChange={(event) => props.onChange(event.target.value)} rows={3} placeholder="请输入取消原因" className="w-full rounded-xl border-none bg-surface-container-low px-4 py-3 focus:ring-2 focus:ring-primary/40" /></label><div className="flex justify-end gap-3"><button onClick={props.onCancel} disabled={props.submitting} className="rounded-xl px-4 py-2 text-sm font-bold text-on-surface-variant hover:bg-surface-container-low disabled:opacity-50">返回</button><button onClick={props.onConfirm} disabled={props.submitting} className="rounded-xl bg-red-600 px-4 py-2 text-sm font-bold text-white disabled:opacity-50">{props.submitting ? "提交中..." : "确认取消"}</button></div></ModalShell>;
}
