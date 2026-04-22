import { PencilLine, Ban, RefreshCcw } from "lucide-react";
import {
  formatMoney,
  formatTime,
  getStatusMeta,
  pageSize,
  type ManualCommissionRecord,
  type StaffLite,
} from "./manual-commission-shared";

interface RecordsProps {
  records: ManualCommissionRecord[];
  staffMap: Record<string, StaffLite>;
  loadingRecords: boolean;
  onRefresh: () => void;
  onAdjust: (record: ManualCommissionRecord) => void;
  onCancel: (record: ManualCommissionRecord) => void;
}

function RecordRow(props: {
  record: ManualCommissionRecord;
  staffMap: Record<string, StaffLite>;
  onAdjust: (record: ManualCommissionRecord) => void;
  onCancel: (record: ManualCommissionRecord) => void;
}) {
  const beneficiaryStaff = props.staffMap[props.record.beneficiary_staff_id];
  const canAdjust = ["pending", "approved", "pending_redeem"].includes(props.record.status);
  const canCancel = !["paid", "cancelled"].includes(props.record.status);
  const statusMeta = getStatusMeta(props.record.status);
  return (
    <tr className="border-b border-surface-container-high/60 align-top hover:bg-surface-container-low/40">
      <td className="px-4 py-4 text-xs text-on-surface-variant">{formatTime(props.record.created_at)}</td>
      <td className="px-4 py-4"><div className="font-semibold">{props.record.commission_no}</div><div className="text-xs text-on-surface-variant">{props.record.id}</div></td>
      <td className="px-4 py-4"><div className="font-semibold">{beneficiaryStaff?.name || props.record.beneficiary_staff_id}</div><div className="text-xs text-on-surface-variant">{beneficiaryStaff ? `${beneficiaryStaff.staff_no} · ${beneficiaryStaff.phone}` : "未加载资料"}</div></td>
      <td className="px-4 py-4 font-bold">L{props.record.level}</td>
      <td className="px-4 py-4 font-bold text-primary">{formatMoney(props.record.amount)}</td>
      <td className="px-4 py-4"><span className={`rounded-full px-2 py-1 text-xs font-bold ${statusMeta.className}`}>{statusMeta.label}</span></td>
      <td className="px-4 py-4 text-xs text-on-surface-variant"><div>{props.record.remark || "-"}</div>{props.record.claim_id && <div className="mt-1">Claim: {props.record.claim_id}</div>}{props.record.source_staff_id && <div className="mt-1">Source: {props.record.source_staff_id}</div>}</td>
      <td className="px-4 py-4"><div className="flex items-center gap-2"><button onClick={() => props.onAdjust(props.record)} disabled={!canAdjust} className="inline-flex items-center gap-1 rounded-full bg-blue-100 px-3 py-1.5 text-xs font-bold text-blue-700 disabled:opacity-40"><PencilLine className="h-3.5 w-3.5" />调额</button><button onClick={() => props.onCancel(props.record)} disabled={!canCancel} className="inline-flex items-center gap-1 rounded-full bg-red-100 px-3 py-1.5 text-xs font-bold text-red-700 disabled:opacity-40"><Ban className="h-3.5 w-3.5" />取消</button></div></td>
    </tr>
  );
}

export default function ManualCommissionRecords(props: RecordsProps) {
  return (
    <div className="rounded-2xl bg-surface-container-lowest p-5 shadow-sm">
      <div className="flex items-center justify-between gap-3"><div><h2 className="text-lg font-extrabold font-[var(--font-headline)]">最近手动佣金</h2><p className="text-sm text-on-surface-variant">展示最近 {pageSize} 条 `type=manual` 佣金记录。</p></div><button onClick={props.onRefresh} className="inline-flex items-center gap-2 rounded-xl px-4 py-2 text-sm font-bold text-on-surface-variant hover:bg-surface-container-low"><RefreshCcw className="h-4 w-4" />刷新</button></div>
      <div className="mt-4 overflow-x-auto"><table className="w-full min-w-[980px] text-sm"><thead><tr className="border-b border-surface-container-high">{["时间", "佣金单号", "收益人", "层级", "金额", "状态", "备注", "操作"].map((title) => <th key={title} className="px-4 py-3 text-left text-xs font-bold uppercase tracking-wider text-on-surface-variant">{title}</th>)}</tr></thead><tbody>{props.loadingRecords ? <tr><td colSpan={8} className="px-4 py-8 text-center text-on-surface-variant">加载中...</td></tr> : null}{!props.loadingRecords && props.records.length === 0 ? <tr><td colSpan={8} className="px-4 py-8 text-center text-on-surface-variant">暂无手动佣金记录</td></tr> : null}{!props.loadingRecords && props.records.map((record) => <RecordRow key={record.id} record={record} staffMap={props.staffMap} onAdjust={props.onAdjust} onCancel={props.onCancel} />)}</tbody></table></div>
    </div>
  );
}
