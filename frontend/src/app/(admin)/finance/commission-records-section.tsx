import type { AdminCommissionRecord } from "./finance-types";
import { statusBadge, toPoints } from "./finance-types";

interface CommissionRecordsSectionProps {
  loading: boolean;
  records: AdminCommissionRecord[];
  status: string;
  page: number;
  totalPages: number;
  updatingRecordId: string;
  onStatusChange: (status: string) => void;
  onPrev: () => void;
  onNext: () => void;
  onApprove: (record: AdminCommissionRecord) => void;
  onReject: (record: AdminCommissionRecord) => void;
}

export default function CommissionRecordsSection(props: CommissionRecordsSectionProps) {
  const { loading, records, status, page, totalPages, updatingRecordId, onStatusChange, onPrev, onNext, onApprove, onReject } = props;

  return (
    <section className="space-y-4">
      <div className="bg-surface-container-lowest rounded-xl p-4 shadow-sm">
        <select
          value={status}
          onChange={(e) => onStatusChange(e.target.value)}
          className="bg-surface-container-low border-none rounded-xl py-3 px-4 text-sm"
        >
          <option value="">全部状态</option>
          <option value="pending">待审核</option>
          <option value="approved">已审核</option>
          <option value="paid">已打款</option>
          <option value="rejected">已拒绝</option>
          <option value="frozen">已冻结</option>
        </select>
      </div>

      <div className="bg-surface-container-lowest rounded-xl shadow-sm overflow-x-auto">
        <table className="w-full min-w-[920px] text-sm">
          <thead>
            <tr className="border-b border-surface-container-high">
              {["时间", "地推员", "层级", "类型", "金额", "状态", "操作"].map((h) => (
                <th key={h} className="px-6 py-4 text-left text-xs font-bold uppercase tracking-wider text-on-surface-variant">{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr><td colSpan={7} className="px-6 py-8 text-center text-on-surface-variant">加载中...</td></tr>
            ) : records.length === 0 ? (
              <tr><td colSpan={7} className="px-6 py-8 text-center text-on-surface-variant">暂无佣金记录</td></tr>
            ) : (
              records.map((record) => (
                <tr key={record.id} className="border-b border-surface-container-high/60 hover:bg-surface-container-low/40">
                  <td className="px-6 py-4 text-xs text-on-surface-variant">{new Date(record.created_at).toLocaleString()}</td>
                  <td className="px-6 py-4">
                    <p className="font-semibold">{record.staff_name || record.source_staff_name || "-"}</p>
                    <p className="text-xs text-on-surface-variant">{record.staff_no || record.commission_no}</p>
                  </td>
                  <td className="px-6 py-4 font-bold">L{record.level}</td>
                  <td className="px-6 py-4">{record.type || "-"}</td>
                  <td className="px-6 py-4 font-bold text-primary">{toPoints(record.amount)}</td>
                  <td className="px-6 py-4">{statusBadge(record.status)}</td>
                  <td className="px-6 py-4">
                    {record.status === "pending" ? (
                      <div className="flex items-center gap-2">
                        <button
                          onClick={() => onApprove(record)}
                          disabled={updatingRecordId === record.id}
                          className="rounded-full bg-green-100 px-3 py-1.5 text-xs font-bold text-green-700 disabled:opacity-60"
                        >
                          审核通过
                        </button>
                        <button
                          onClick={() => onReject(record)}
                          disabled={updatingRecordId === record.id}
                          className="rounded-full bg-red-100 px-3 py-1.5 text-xs font-bold text-red-700 disabled:opacity-60"
                        >
                          驳回
                        </button>
                      </div>
                    ) : (
                      <span className="text-xs text-on-surface-variant">-</span>
                    )}
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

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
    </section>
  );
}
