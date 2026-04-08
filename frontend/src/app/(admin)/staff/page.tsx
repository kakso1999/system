"use client";

import { useEffect, useState, useCallback } from "react";
import { UserPlus, Pencil, Ban, CheckCircle } from "lucide-react";
import api from "@/lib/api";
import type { Staff, PageResponse } from "@/types";

export default function StaffManagementPage() {
  const [staffList, setStaffList] = useState<Staff[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("");
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [editingStaff, setEditingStaff] = useState<Staff | null>(null);
  const [form, setForm] = useState({ name: "", phone: "", username: "", password: "" });

  const loadStaff = useCallback(async () => {
    setLoading(true);
    try {
      const params: Record<string, string | number> = { page, page_size: 20 };
      if (search) params.search = search;
      if (statusFilter) params.status = statusFilter;
      const res = await api.get<PageResponse<Staff>>("/api/admin/staff/", { params });
      setStaffList(res.data.items);
      setTotal(res.data.total);
    } catch {
      setStaffList([]);
    } finally {
      setLoading(false);
    }
  }, [page, search, statusFilter]);

  useEffect(() => { loadStaff(); }, [loadStaff]);

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      if (editingStaff) {
        await api.put(`/api/admin/staff/${editingStaff.id}`, {
          name: form.name, phone: form.phone,
        });
      } else {
        await api.post("/api/admin/staff/", form);
      }
      setShowModal(false);
      setEditingStaff(null);
      setForm({ name: "", phone: "", username: "", password: "" });
      loadStaff();
    } catch (err: unknown) {
      const axiosErr = err as { response?: { data?: { detail?: string } } };
      alert(axiosErr.response?.data?.detail || "Operation failed");
    }
  };

  const toggleStatus = async (staff: Staff) => {
    const newStatus = staff.status === "active" ? "disabled" : "active";
    try {
      await api.put(`/api/admin/staff/${staff.id}/status`, { status: newStatus });
      loadStaff();
    } catch {
      alert("Failed to update status");
    }
  };

  const openEdit = (staff: Staff) => {
    setEditingStaff(staff);
    setForm({ name: staff.name, phone: staff.phone, username: staff.username, password: "" });
    setShowModal(true);
  };

  const openCreate = () => {
    setEditingStaff(null);
    setForm({ name: "", phone: "", username: "", password: "" });
    setShowModal(true);
  };

  const statusBadge = (status: string) => {
    const styles: Record<string, string> = {
      active: "bg-green-100 text-green-700",
      disabled: "bg-red-100 text-red-700",
      pending_review: "bg-yellow-100 text-yellow-700",
    };
    const labels: Record<string, string> = {
      active: "活跃", disabled: "禁用", pending_review: "待审核",
    };
    return (
      <span className={`px-2 py-1 rounded-full text-xs font-bold ${styles[status] || "bg-gray-100 text-gray-600"}`}>
        {labels[status] || status}
      </span>
    );
  };

  const vipLabel = (level: number) => {
    const labels = ["普通", "VIP1", "VIP2", "VIP3", "超级VIP"];
    return labels[level] || `VIP${level}`;
  };

  const totalPages = Math.ceil(total / 20);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-extrabold font-[var(--font-headline)] tracking-tight">地推员管理</h1>
          <p className="text-on-surface-variant mt-1">共 {total} 名地推员</p>
        </div>
        <button onClick={openCreate}
          className="bg-primary text-on-primary px-6 py-3 rounded-full font-bold text-sm flex items-center gap-2 shadow-lg shadow-primary/20 hover:shadow-xl active:scale-[0.98] transition-all"
        >
          <UserPlus className="w-4 h-4" />
          新增地推员
        </button>
      </div>

      {/* Filters */}
      <div className="flex gap-3">
        <input
          type="text" placeholder="搜索姓名 / 手机号 / 编号..."
          value={search} onChange={(e) => { setSearch(e.target.value); setPage(1); }}
          className="flex-1 bg-surface-container-lowest border-none rounded-xl py-3 px-4 text-sm focus:ring-2 focus:ring-primary/40 transition-all"
        />
        <select value={statusFilter} onChange={(e) => { setStatusFilter(e.target.value); setPage(1); }}
          className="bg-surface-container-lowest border-none rounded-xl py-3 px-4 text-sm focus:ring-2 focus:ring-primary/40"
        >
          <option value="">全部状态</option>
          <option value="active">活跃</option>
          <option value="disabled">禁用</option>
          <option value="pending_review">待审核</option>
        </select>
      </div>

      {/* Table */}
      <div className="bg-surface-container-lowest rounded-xl shadow-sm overflow-hidden">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-surface-container-high">
              <th className="text-left px-6 py-4 font-bold text-on-surface-variant text-xs uppercase tracking-wider">编号</th>
              <th className="text-left px-6 py-4 font-bold text-on-surface-variant text-xs uppercase tracking-wider">姓名</th>
              <th className="text-left px-6 py-4 font-bold text-on-surface-variant text-xs uppercase tracking-wider">手机号</th>
              <th className="text-left px-6 py-4 font-bold text-on-surface-variant text-xs uppercase tracking-wider">VIP</th>
              <th className="text-left px-6 py-4 font-bold text-on-surface-variant text-xs uppercase tracking-wider">有效量</th>
              <th className="text-left px-6 py-4 font-bold text-on-surface-variant text-xs uppercase tracking-wider">佣金</th>
              <th className="text-left px-6 py-4 font-bold text-on-surface-variant text-xs uppercase tracking-wider">状态</th>
              <th className="text-left px-6 py-4 font-bold text-on-surface-variant text-xs uppercase tracking-wider">操作</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr><td colSpan={8} className="px-6 py-8 text-center text-on-surface-variant">加载中...</td></tr>
            ) : staffList.length === 0 ? (
              <tr><td colSpan={8} className="px-6 py-8 text-center text-on-surface-variant">暂无数据</td></tr>
            ) : (
              staffList.map((s) => (
                <tr key={s.id} className="border-b border-surface-container-high/50 hover:bg-surface-container-low/50 transition-colors">
                  <td className="px-6 py-4 font-mono text-xs">{s.staff_no}</td>
                  <td className="px-6 py-4 font-semibold">{s.name}</td>
                  <td className="px-6 py-4 text-on-surface-variant">{s.phone}</td>
                  <td className="px-6 py-4"><span className="text-primary font-bold text-xs">{vipLabel(s.vip_level)}</span></td>
                  <td className="px-6 py-4 font-bold">{s.stats?.total_valid ?? 0}</td>
                  <td className="px-6 py-4 font-bold text-secondary">{(s.stats?.total_commission ?? 0).toFixed(2)}</td>
                  <td className="px-6 py-4">{statusBadge(s.status)}</td>
                  <td className="px-6 py-4">
                    <div className="flex items-center gap-2">
                      <button onClick={() => openEdit(s)} className="text-primary hover:bg-primary/10 p-1.5 rounded-lg transition-colors">
                        <Pencil className="w-4 h-4" />
                      </button>
                      <button onClick={() => toggleStatus(s)}
                        className={`${s.status === "active" ? "text-error hover:bg-error/10" : "text-green-600 hover:bg-green-50"} p-1.5 rounded-lg transition-colors`}
                      >
                        {s.status === "active" ? <Ban className="w-4 h-4" /> : <CheckCircle className="w-4 h-4" />}
                      </button>
                    </div>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="flex items-center justify-center gap-2">
          <button onClick={() => setPage(Math.max(1, page - 1))} disabled={page === 1}
            className="px-4 py-2 rounded-lg text-sm font-semibold text-on-surface-variant hover:bg-surface-container-low disabled:opacity-40 transition-all"
          >上一页</button>
          <span className="text-sm text-on-surface-variant px-4">{page} / {totalPages}</span>
          <button onClick={() => setPage(Math.min(totalPages, page + 1))} disabled={page === totalPages}
            className="px-4 py-2 rounded-lg text-sm font-semibold text-on-surface-variant hover:bg-surface-container-low disabled:opacity-40 transition-all"
          >下一页</button>
        </div>
      )}

      {/* Create/Edit Modal */}
      {showModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-inverse-surface/40 backdrop-blur-sm">
          <div className="bg-surface-container-lowest rounded-2xl p-8 w-full max-w-md shadow-2xl">
            <h2 className="text-xl font-extrabold font-[var(--font-headline)] mb-6">
              {editingStaff ? "编辑地推员" : "新增地推员"}
            </h2>
            <form onSubmit={handleCreate} className="space-y-4">
              <div>
                <label className="text-sm font-bold text-on-surface-variant block mb-1">姓名</label>
                <input type="text" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })}
                  className="w-full bg-surface-container-low border-none rounded-xl py-3 px-4 text-sm focus:ring-2 focus:ring-primary/40" required />
              </div>
              <div>
                <label className="text-sm font-bold text-on-surface-variant block mb-1">手机号</label>
                <input type="text" value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })}
                  className="w-full bg-surface-container-low border-none rounded-xl py-3 px-4 text-sm focus:ring-2 focus:ring-primary/40" required />
              </div>
              {!editingStaff && (
                <>
                  <div>
                    <label className="text-sm font-bold text-on-surface-variant block mb-1">用户名</label>
                    <input type="text" value={form.username} onChange={(e) => setForm({ ...form, username: e.target.value })}
                      className="w-full bg-surface-container-low border-none rounded-xl py-3 px-4 text-sm focus:ring-2 focus:ring-primary/40" required />
                  </div>
                  <div>
                    <label className="text-sm font-bold text-on-surface-variant block mb-1">密码</label>
                    <input type="password" value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })}
                      className="w-full bg-surface-container-low border-none rounded-xl py-3 px-4 text-sm focus:ring-2 focus:ring-primary/40" required />
                  </div>
                </>
              )}
              <div className="flex gap-3 pt-4">
                <button type="button" onClick={() => setShowModal(false)}
                  className="flex-1 py-3 rounded-full border border-outline-variant text-on-surface-variant font-bold text-sm hover:bg-surface-container-low transition-all"
                >取消</button>
                <button type="submit"
                  className="flex-1 bg-primary text-on-primary py-3 rounded-full font-bold text-sm shadow-md shadow-primary/20 hover:shadow-lg active:scale-[0.98] transition-all"
                >{editingStaff ? "保存" : "创建"}</button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
