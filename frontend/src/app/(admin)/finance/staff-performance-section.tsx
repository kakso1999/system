import type { StaffPerformance } from "./finance-types";
import { toPoints, vipLabel } from "./finance-types";

interface StaffPerformanceSectionProps {
  loading: boolean;
  staffList: StaffPerformance[];
  page: number;
  totalPages: number;
  onPrev: () => void;
  onNext: () => void;
  onSettle: (staff: StaffPerformance) => void;
}

export default function StaffPerformanceSection(props: StaffPerformanceSectionProps) {
  const { loading, staffList, page, totalPages, onPrev, onNext, onSettle } = props;

  return (
    <section className="space-y-4">
      <div className="bg-surface-container-lowest rounded-xl shadow-sm overflow-x-auto">
        <table className="w-full min-w-[820px] text-sm">
          <thead>
            <tr className="border-b border-surface-container-high">
              {["编号", "姓名", "VIP", "有效领取", "总佣金", "已结算", "待结算", "操作"].map((h) => (
                <th key={h} className="px-6 py-4 text-left text-xs font-bold uppercase tracking-wider text-on-surface-variant">{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr><td colSpan={8} className="px-6 py-8 text-center text-on-surface-variant">加载中...</td></tr>
            ) : staffList.length === 0 ? (
              <tr><td colSpan={8} className="px-6 py-8 text-center text-on-surface-variant">暂无数据</td></tr>
            ) : (
              staffList.map((staff) => (
                <tr key={staff.id} className="border-b border-surface-container-high/60 hover:bg-surface-container-low/40">
                  <td className="px-6 py-4 font-mono text-xs">{staff.staff_no}</td>
                  <td className="px-6 py-4 font-semibold">{staff.name}</td>
                  <td className="px-6 py-4 text-primary font-bold text-xs">{vipLabel(staff.vip_level)}</td>
                  <td className="px-6 py-4 font-bold">{staff.stats?.total_valid ?? 0}</td>
                  <td className="px-6 py-4 font-bold text-secondary">{toPoints(staff.stats?.total_commission ?? 0)}</td>
                  <td className="px-6 py-4 font-bold text-green-700">{toPoints(staff.paid_amount ?? 0)}</td>
                  <td className="px-6 py-4 font-bold text-primary">{toPoints(staff.pending_amount ?? 0)}</td>
                  <td className="px-6 py-4">
                    <button
                      onClick={() => onSettle(staff)}
                      className="rounded-full bg-primary px-4 py-2 text-xs font-bold text-on-primary"
                    >
                      结算
                    </button>
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
