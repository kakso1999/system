import { Ban, CheckCircle, Pencil, Trash2, XCircle } from "lucide-react";
import { useRouter } from "next/navigation";
import api from "@/lib/api";
import type { Staff } from "@/types";
import { statusBadge, vipLabel } from "./staff-shared";

interface StaffTableProps {
  loading: boolean;
  staffList: Staff[];
  onEdit: (staff: Staff) => void;
  onUpdateStatus: (staff: Staff, newStatus: "active" | "disabled") => void;
  onDelete: (staff: Staff) => void;
}

function formatDateShort(iso?: string | null) {
  if (!iso) return "—";

  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "—";

  const year = date.getFullYear();
  const month = `${date.getMonth() + 1}`.padStart(2, "0");
  const day = `${date.getDate()}`.padStart(2, "0");
  const hours = `${date.getHours()}`.padStart(2, "0");
  const minutes = `${date.getMinutes()}`.padStart(2, "0");

  return `${year}-${month}-${day} ${hours}:${minutes}`;
}

function getErrorDetail(error: unknown, fallback: string) {
  const axiosErr = error as { response?: { data?: { detail?: string } } };
  return axiosErr.response?.data?.detail || fallback;
}

export default function StaffTable(props: StaffTableProps) {
  const { loading, staffList, onEdit, onUpdateStatus, onDelete } = props;
  const router = useRouter();

  const handleWorkStatusAction = async (staff: Staff, action: "pause" | "resume") => {
    try {
      await api.post(`/api/admin/staff/${staff.id}/${action}`);
      router.refresh();
    } catch (error: unknown) {
      const fallback = action === "pause" ? "Failed to pause promoter" : "Failed to resume promoter";
      alert(getErrorDetail(error, fallback));
    }
  };

  return (
    <div className="bg-surface-container-lowest rounded-xl shadow-sm overflow-hidden">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-surface-container-high">
            <th className="text-left px-6 py-4 font-bold text-on-surface-variant text-xs uppercase tracking-wider">编号</th>
            <th className="text-left px-6 py-4 font-bold text-on-surface-variant text-xs uppercase tracking-wider">姓名</th>
            <th className="text-left px-6 py-4 font-bold text-on-surface-variant text-xs uppercase tracking-wider">手机号</th>
            <th className="text-left px-6 py-4 font-bold text-on-surface-variant text-xs uppercase tracking-wider">邀请码</th>
            <th className="text-left px-6 py-4 font-bold text-on-surface-variant text-xs uppercase tracking-wider">VIP</th>
            <th className="text-left px-6 py-4 font-bold text-on-surface-variant text-xs uppercase tracking-wider">有效量</th>
            <th className="text-left px-6 py-4 font-bold text-on-surface-variant text-xs uppercase tracking-wider">佣金</th>
            <th className="text-left px-6 py-4 font-bold text-on-surface-variant text-xs uppercase tracking-wider">状态</th>
            <th className="text-left px-6 py-4 font-bold text-on-surface-variant text-xs uppercase tracking-wider">上次登录</th>
            <th className="text-left px-6 py-4 font-bold text-on-surface-variant text-xs uppercase tracking-wider">操作</th>
          </tr>
        </thead>
        <tbody>
          {loading ? (
            <tr><td colSpan={10} className="px-6 py-8 text-center text-on-surface-variant">加载中...</td></tr>
          ) : staffList.length === 0 ? (
            <tr><td colSpan={10} className="px-6 py-8 text-center text-on-surface-variant">暂无数据</td></tr>
          ) : (
            staffList.map((staff) => (
              <tr key={staff.id} className="border-b border-surface-container-high/50 hover:bg-surface-container-low/50 transition-colors">
                <td className="px-6 py-4 font-mono text-xs">{staff.staff_no}</td>
                <td className="px-6 py-4 font-semibold">
                  <div className="flex items-center gap-2">
                    <span
                      className={`h-2 w-2 rounded-full ring-1 ring-inset ${staff.is_online === true ? "bg-green-500 ring-green-200" : "bg-outline-variant ring-outline-variant"}`}
                    />
                    <span>{staff.name}</span>
                  </div>
                </td>
                <td className="px-6 py-4 text-on-surface-variant">{staff.phone}</td>
                <td className="px-6 py-4 font-mono text-xs text-on-surface-variant">{staff.invite_code || "-"}</td>
                <td className="px-6 py-4"><span className="text-primary font-bold text-xs">{vipLabel(staff.vip_level)}</span></td>
                <td className="px-6 py-4 font-bold">{staff.stats?.total_valid ?? 0}</td>
                <td className="px-6 py-4 font-bold text-secondary">{(staff.stats?.total_commission ?? 0).toFixed(2)}</td>
                <td className="px-6 py-4">{statusBadge(staff.status)}</td>
                <td className="px-6 py-4 text-on-surface-variant">{formatDateShort(staff.last_login_at)}</td>
                <td className="px-6 py-4">
                  <div className="flex items-center gap-2">
                    <button onClick={() => onEdit(staff)} className="text-primary hover:bg-primary/10 p-1.5 rounded-lg transition-colors" title="编辑">
                      <Pencil className="w-4 h-4" />
                    </button>
                    {staff.status === "pending_review" ? (
                      <>
                        <button onClick={() => onUpdateStatus(staff, "active")}
                          className="text-green-600 hover:bg-green-50 p-1.5 rounded-lg transition-colors"
                          title="通过"
                        >
                          <CheckCircle className="w-4 h-4" />
                        </button>
                        <button onClick={() => onUpdateStatus(staff, "disabled")}
                          className="text-error hover:bg-error/10 p-1.5 rounded-lg transition-colors"
                          title="拒绝"
                        >
                          <XCircle className="w-4 h-4" />
                        </button>
                      </>
                    ) : (
                      <button onClick={() => onUpdateStatus(staff, staff.status === "active" ? "disabled" : "active")}
                        className={`${staff.status === "active" ? "text-error hover:bg-error/10" : "text-green-600 hover:bg-green-50"} p-1.5 rounded-lg transition-colors`}
                        title={staff.status === "active" ? "禁用" : "启用"}
                      >
                        {staff.status === "active" ? <Ban className="w-4 h-4" /> : <CheckCircle className="w-4 h-4" />}
                      </button>
                    )}
                    {staff.work_status === "promoting" && (
                      <button
                        onClick={() => void handleWorkStatusAction(staff, "pause")}
                        className="rounded-full bg-yellow-100 px-3 py-1 text-xs font-bold text-yellow-800 transition-colors hover:bg-yellow-200"
                        title="暂停推广"
                      >
                        Pause
                      </button>
                    )}
                    {staff.work_status === "paused" && (
                      <button
                        onClick={() => void handleWorkStatusAction(staff, "resume")}
                        className="rounded-full bg-green-100 px-3 py-1 text-xs font-bold text-green-700 transition-colors hover:bg-green-200"
                        title="恢复推广"
                      >
                        Resume
                      </button>
                    )}
                    <button
                      onClick={() => onDelete(staff)}
                      className="text-error hover:bg-error/10 p-1.5 rounded-lg transition-colors"
                      title="删除"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                </td>
              </tr>
            ))
          )}
        </tbody>
      </table>
    </div>
  );
}
