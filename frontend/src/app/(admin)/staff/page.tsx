"use client";

import { Suspense, useCallback, useEffect, useState, type FormEvent } from "react";
import { UserPlus } from "lucide-react";
import { useSearchParams } from "next/navigation";
import api from "@/lib/api";
import type { PageResponse, Staff } from "@/types";
import StaffFormModal from "./staff-form-modal";
import StaffTable from "./staff-table";
import StaffTreeView from "./staff-tree-view";

type ViewMode = "list" | "tree";

type StaffFormValues = {
  name: string;
  phone: string;
  username: string;
  password: string;
};

const emptyForm: StaffFormValues = { name: "", phone: "", username: "", password: "" };

function StaffManagementContent() {
  const searchParams = useSearchParams();
  const [staffList, setStaffList] = useState<Staff[]>([]);
  const [treeRoots, setTreeRoots] = useState<Staff[]>([]);
  const [childrenData, setChildrenData] = useState<Record<string, Staff[]>>({});
  const [expandedIds, setExpandedIds] = useState<Set<string>>(new Set());
  const [loadingIds, setLoadingIds] = useState<Set<string>>(new Set());
  const [total, setTotal] = useState(0);
  const [pendingCount, setPendingCount] = useState(0);
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState(searchParams.get("status") || "");
  const [viewMode, setViewMode] = useState<ViewMode>("list");
  const [loading, setLoading] = useState(true);
  const [loadingTree, setLoadingTree] = useState(false);
  const [showModal, setShowModal] = useState(false);
  const [editingStaff, setEditingStaff] = useState<Staff | null>(null);
  const [form, setForm] = useState<StaffFormValues>(emptyForm);

  const loadStaff = useCallback(async () => {
    setLoading(true);
    try {
      const params: Record<string, string | number> = { page, page_size: 20 };
      if (search) params.search = search;
      if (statusFilter) params.status = statusFilter;
      const [listRes, pendingRes] = await Promise.all([
        api.get<PageResponse<Staff>>("/api/admin/staff/", { params }),
        api.get<PageResponse<Staff>>("/api/admin/staff/", {
          params: { page: 1, page_size: 1, status: "pending_review" },
        }),
      ]);
      setStaffList(listRes.data.items);
      setTotal(listRes.data.total);
      setPendingCount(pendingRes.data.total);
    } catch {
      setStaffList([]);
      setPendingCount(0);
    } finally {
      setLoading(false);
    }
  }, [page, search, statusFilter]);

  const loadTree = useCallback(async () => {
    setLoadingTree(true);
    try {
      const res = await api.get<Staff[]>("/api/admin/staff/tree");
      setTreeRoots(res.data || []);
    } catch {
      setTreeRoots([]);
    } finally {
      setLoadingTree(false);
    }
  }, []);

  const resetTreeState = useCallback(() => {
    setTreeRoots([]);
    setChildrenData({});
    setExpandedIds(new Set());
    setLoadingIds(new Set());
  }, []);

  const refreshAllData = useCallback(async () => {
    resetTreeState();
    await Promise.all([loadStaff(), loadTree()]);
  }, [loadStaff, loadTree, resetTreeState]);

  useEffect(() => {
    loadStaff();
  }, [loadStaff]);

  useEffect(() => {
    if (viewMode === "tree" && treeRoots.length === 0) {
      loadTree();
    }
  }, [viewMode, treeRoots.length, loadTree]);

  useEffect(() => {
    const urlStatus = searchParams.get("status") || "";
    setStatusFilter(urlStatus);
    setPage(1);
  }, [searchParams]);

  const handleCreate = async (event: FormEvent) => {
    event.preventDefault();
    try {
      if (editingStaff) {
        await api.put(`/api/admin/staff/${editingStaff.id}`, {
          name: form.name,
          phone: form.phone,
        });
      } else {
        await api.post("/api/admin/staff/", form);
      }
      setShowModal(false);
      setEditingStaff(null);
      setForm(emptyForm);
      await refreshAllData();
    } catch (error: unknown) {
      const axiosErr = error as { response?: { data?: { detail?: string } } };
      alert(axiosErr.response?.data?.detail || "Operation failed");
    }
  };

  const updateStatus = async (staff: Staff, newStatus: "active" | "disabled") => {
    try {
      await api.put(`/api/admin/staff/${staff.id}/status`, { status: newStatus });
      await refreshAllData();
    } catch {
      alert("Failed to update status");
    }
  };

  const deleteStaff = async (staff: Staff) => {
    if (!confirm(`确认删除地推员「${staff.name}」？此操作不可恢复。`)) return;
    try {
      await api.delete(`/api/admin/staff/${staff.id}`);
      await refreshAllData();
    } catch {
      alert("删除失败");
    }
  };

  const openEdit = async (staff: Staff) => {
    try {
      const detailRes = await api.get<Staff>(`/api/admin/staff/${staff.id}`);
      const detail = detailRes.data;
      setEditingStaff(detail);
      setForm({ name: detail.name, phone: detail.phone, username: detail.username, password: "" });
      setShowModal(true);
    } catch {
      alert("加载详情失败");
    }
  };

  const openCreate = () => {
    setEditingStaff(null);
    setForm(emptyForm);
    setShowModal(true);
  };

  const toggleNode = useCallback(async (staff: Staff) => {
    const isExpanded = expandedIds.has(staff.id);
    if (isExpanded) {
      setExpandedIds((prev) => {
        const next = new Set(prev);
        next.delete(staff.id);
        return next;
      });
      return;
    }

    setExpandedIds((prev) => new Set(prev).add(staff.id));
    if ((staff.children_count ?? 0) === 0 || childrenData[staff.id]) {
      return;
    }

    setLoadingIds((prev) => new Set(prev).add(staff.id));
    try {
      const res = await api.get<Staff[]>(`/api/admin/staff/${staff.id}/children`);
      setChildrenData((prev) => ({ ...prev, [staff.id]: res.data || [] }));
    } catch {
      alert("加载下级成员失败");
      setExpandedIds((prev) => {
        const next = new Set(prev);
        next.delete(staff.id);
        return next;
      });
    } finally {
      setLoadingIds((prev) => {
        const next = new Set(prev);
        next.delete(staff.id);
        return next;
      });
    }
  }, [childrenData, expandedIds]);

  const totalPages = Math.ceil(total / 20);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between gap-4">
        <div>
          <h1 className="text-3xl font-extrabold font-[var(--font-headline)] tracking-tight">地推员管理</h1>
          <div className="flex items-center gap-3 mt-1">
            <p className="text-on-surface-variant">共 {total} 名地推员</p>
            <span className="inline-flex items-center px-3 py-1 rounded-full text-xs font-bold bg-yellow-100 text-yellow-800">
              {pendingCount} 条待审核
            </span>
          </div>
        </div>
        <div className="flex items-center gap-3">
          <div className="inline-flex rounded-full bg-surface-container-lowest p-1 shadow-sm">
            <button
              onClick={() => setViewMode("list")}
              className={`rounded-full px-4 py-2 text-sm font-bold ${viewMode === "list" ? "bg-primary text-on-primary" : "text-on-surface-variant"}`}
            >
              列表模式
            </button>
            <button
              onClick={() => setViewMode("tree")}
              className={`rounded-full px-4 py-2 text-sm font-bold ${viewMode === "tree" ? "bg-primary text-on-primary" : "text-on-surface-variant"}`}
            >
              树状模式
            </button>
          </div>
          <button onClick={openCreate}
            className="bg-primary text-on-primary px-6 py-3 rounded-full font-bold text-sm flex items-center gap-2 shadow-lg shadow-primary/20 hover:shadow-xl active:scale-[0.98] transition-all"
          >
            <UserPlus className="w-4 h-4" />
            新增地推员
          </button>
        </div>
      </div>

      {viewMode === "list" && (
        <>
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

          <StaffTable
            loading={loading}
            staffList={staffList}
            onEdit={openEdit}
            onUpdateStatus={updateStatus}
            onDelete={deleteStaff}
          />
        </>
      )}

      {viewMode === "tree" && (
        <StaffTreeView
          loading={loadingTree}
          roots={treeRoots}
          expandedIds={expandedIds}
          childrenData={childrenData}
          loadingIds={loadingIds}
          onToggle={toggleNode}
        />
      )}

      {viewMode === "list" && totalPages > 1 && (
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

      {showModal && (
        <StaffFormModal
          editingStaff={editingStaff}
          form={form}
          onFormChange={setForm}
          onClose={() => setShowModal(false)}
          onSubmit={handleCreate}
        />
      )}
    </div>
  );
}

export default function StaffManagementPage() {
  return (
    <Suspense fallback={<div className="flex items-center justify-center py-20 text-on-surface-variant">加载中...</div>}>
      <StaffManagementContent />
    </Suspense>
  );
}
