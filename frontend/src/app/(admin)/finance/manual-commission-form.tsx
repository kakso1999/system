import { PlusCircle, Search } from "lucide-react";
import { staffLabel, type ManualCommissionFormValues, type StaffLite } from "./manual-commission-shared";

interface FormProps {
  form: ManualCommissionFormValues;
  beneficiaryQuery: string;
  staffOptions: StaffLite[];
  loadingOptions: boolean;
  submitting: boolean;
  onFieldChange: (field: keyof ManualCommissionFormValues, value: string) => void;
  onBeneficiaryQueryChange: (value: string) => void;
  onSelectBeneficiary: (staff: StaffLite) => void;
  onSubmit: () => void;
}

function BeneficiaryField(props: Pick<FormProps, "beneficiaryQuery" | "staffOptions" | "loadingOptions" | "onBeneficiaryQueryChange" | "onSelectBeneficiary">) {
  const { beneficiaryQuery, staffOptions, loadingOptions, onBeneficiaryQueryChange, onSelectBeneficiary } = props;
  return (
    <div className="space-y-2">
      <label className="text-sm font-semibold">收益地推员</label>
      <div className="relative">
        <Search className="pointer-events-none absolute left-3 top-3.5 h-4 w-4 text-on-surface-variant" />
        <input value={beneficiaryQuery} onChange={(event) => onBeneficiaryQueryChange(event.target.value)} placeholder="按 staff_no 或手机号搜索" className="w-full rounded-xl border-none bg-surface-container-low py-3 pl-10 pr-4 text-sm focus:ring-2 focus:ring-primary/40" />
      </div>
      {!!staffOptions.length && <div className="overflow-hidden rounded-xl border border-surface-container-high bg-surface-container-lowest">{staffOptions.map((item) => <button key={item.id} onClick={() => onSelectBeneficiary(item)} className="block w-full px-4 py-3 text-left hover:bg-surface-container-low"><div className="font-semibold">{item.name}</div><div className="text-xs text-on-surface-variant">{staffLabel(item)}</div></button>)}</div>}
      {!staffOptions.length && loadingOptions && <p className="text-xs text-on-surface-variant">搜索中...</p>}
    </div>
  );
}

function OptionalFields(props: Pick<FormProps, "form" | "onFieldChange">) {
  const fields: Array<[keyof ManualCommissionFormValues, string]> = [
    ["claim_id", "关联 claim_id（可选）"],
    ["source_staff_id", "来源 source_staff_id（可选）"],
    ["campaign_id", "活动 campaign_id（可选）"],
  ];
  return <div className="grid gap-4 lg:col-span-2 sm:grid-cols-3">{fields.map(([key, label]) => <label key={key} className="space-y-2 text-sm"><span className="font-semibold">{label}</span><input value={props.form[key]} onChange={(event) => props.onFieldChange(key, event.target.value)} className="w-full rounded-xl border-none bg-surface-container-low px-4 py-3 focus:ring-2 focus:ring-primary/40" /></label>)}</div>;
}

export default function ManualCommissionForm(props: FormProps) {
  return (
    <div className="rounded-2xl bg-surface-container-lowest p-5 shadow-sm">
      <div className="flex items-center gap-2 text-lg font-extrabold font-[var(--font-headline)]"><PlusCircle className="h-5 w-5 text-primary" />手动佣金</div>
      <p className="mt-1 text-sm text-on-surface-variant">按地推员补录、修正或取消手动佣金记录。</p>
      <div className="mt-5 grid gap-4 lg:grid-cols-2">
        <BeneficiaryField {...props} />
        <div className="grid gap-4 sm:grid-cols-2"><label className="space-y-2 text-sm"><span className="font-semibold">层级</span><select value={props.form.level} onChange={(event) => props.onFieldChange("level", event.target.value)} className="w-full rounded-xl border-none bg-surface-container-low px-4 py-3 focus:ring-2 focus:ring-primary/40">{[0, 1, 2, 3].map((level) => <option key={level} value={String(level)}>L{level}</option>)}</select></label><label className="space-y-2 text-sm"><span className="font-semibold">金额（PHP）</span><input value={props.form.amount} onChange={(event) => props.onFieldChange("amount", event.target.value)} placeholder="例如 88.50" className="w-full rounded-xl border-none bg-surface-container-low px-4 py-3 focus:ring-2 focus:ring-primary/40" /></label></div>
        <label className="space-y-2 text-sm lg:col-span-2"><span className="font-semibold">备注</span><textarea value={props.form.remark} onChange={(event) => props.onFieldChange("remark", event.target.value)} rows={3} placeholder="请输入创建原因或说明" className="w-full rounded-xl border-none bg-surface-container-low px-4 py-3 focus:ring-2 focus:ring-primary/40" /></label>
        <OptionalFields {...props} />
        <div className="lg:col-span-2"><button onClick={props.onSubmit} disabled={props.submitting} className="inline-flex items-center gap-2 rounded-xl bg-primary px-5 py-3 text-sm font-bold text-on-primary disabled:opacity-50"><PlusCircle className="h-4 w-4" />{props.submitting ? "提交中..." : "新增手动佣金"}</button></div>
      </div>
    </div>
  );
}
