"use client";

import { useCallback, useEffect, useState, type FormEvent } from "react";
import { UserPlus } from "lucide-react";
import { useRouter, useSearchParams } from "next/navigation";
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

type StaffListQuery = {
  page: number;
  search: string;
  statusFilter: string;
  onlineFilter: "all" | "true" | "false";
};

const emptyForm: StaffFormValues = { name: "", phone: "", username: "", password: "" };

function getErrorDetail(error: unknown, fallback: string) {
  const axiosErr = error as { response?: { data?: { detail?: string } } };
  return axiosErr.response?.data?.detail || fallback;
}

export default function StaffManagementContent() {
  const router = useRouter();
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
  const [onlineFilter, setOnlineFilter] = useState<"all" | "true" | "false">("all");
  const [viewMode, setViewMode] = useState<ViewMode>("list");
  const [loading, setLoading] = useState(true);
  const [loadingTree, setLoadingTree] = useState(false);
  const [showModal, setShowModal] = useState(false);
  const [editingStaff, setEditingStaff] = useState<Staff | null>(null);
  const [form, setForm] = useState<StaffFormValues>(emptyForm);

  const loadStaff = useCallback(async (nextQuery?: Partial<StaffListQuery>) => {
    const currentPage = nextQuery?.page ?? page;
    const currentSearch = nextQuery?.search ?? search;
    const currentStatusFilter = nextQuery?.statusFilter ?? statusFilter;
    const currentOnlineFilter = nextQuery?.onlineFilter ?? onlineFilter;
    setLoading(true);
    try {
      const params: Record<string, string | number> = { page: currentPage, page_size: 20 };
      if (currentSearch) params.search = currentSearch;
      if (currentStatusFilter) params.status = currentStatusFilter;
      if (currentOnlineFilter !== "all") params.online_filter = currentOnlineFilter;
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
      setTotal(0);
      setPendingCount(0);
    } finally {
      setLoading(false);
    }
  }, [onlineFilter, page, search, statusFilter]);

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

  const refreshAllData = useCallback(async (nextQuery?: Partial<StaffListQuery>) => {
    resetTreeState();
    await Promise.all([loadStaff(nextQuery), loadTree()]);
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
    setStatusFilter(searchParams.get("status") || "");
    setPage(1);
  }, [searchParams]);

  const handleCreate = async (event: FormEvent) => {
    event.preventDefault();
    try {
      if (editingStaff) {
        await api.put(`/api/admin/staff/${editingStaff.id}`, { name: form.name, phone: form.phone });
        await refreshAllData();
      } else {
        const nextQuery = { page: 1, search: "", statusFilter: "", onlineFilter: "all" as const };
        await api.post("/api/admin/staff/", form);
        setPage(nextQuery.page);
        setSearch(nextQuery.search);
        setStatusFilter(nextQuery.statusFilter);
        setOnlineFilter(nextQuery.onlineFilter);
        router.replace("/staff");
        await refreshAllData(nextQuery);
      }
      setShowModal(false);
      setEditingStaff(null);
      setForm(emptyForm);
    } catch (error: unknown) {
      alert(getErrorDetail(error, "Operation failed"));
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
    const nextPage = staffList.length === 1 && page > 1 ? page - 1 : page;
    try {
      await api.delete(`/api/admin/staff/${staff.id}`);
      if (nextPage !== page) setPage(nextPage);
      await refreshAllData({ page: nextPage });
    } catch (error: unknown) {
      alert(getErrorDetail(error, "删除失败"));
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
    if (expandedIds.has(staff.id)) {
      setExpandedIds((prev) => {
        const next = new Set(prev);
        next.delete(staff.id);
        return next;
      });
      return;
    }

    setExpandedIds((prev) => new Set(prev).add(staff.id));
    if ((staff.children_count ?? 0) === 0 || childrenData[staff.id]) return;

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
          <div className="mt-1 flex items-center gap-3">
            <p className="text-on-surface-variant">共 {total} 名地推员</p>
            <span className="inline-flex items-center rounded-full bg-yellow-100 px-3 py-1 text-xs font-bold text-yellow-800">
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
          <button
            onClick={openCreate}
            className="flex items-center gap-2 rounded-full bg-primary px-6 py-3 text-sm font-bold text-on-primary shadow-lg shadow-primary/20 transition-all hover:shadow-xl active:scale-[0.98]"
          >
            <UserPlus className="h-4 w-4" />
            新增地推员
          </button>
        </div>
      </div>

      {viewMode === "list" && (
        <>
          <div className="flex flex-col gap-3 xl:flex-row xl:items-center xl:justify-between">
            <div className="flex flex-1 gap-3">
              <input
                type="text"
                placeholder="搜索姓名 / 手机号 / 编号..."
                value={search}
                onChange={(event) => { setSearch(event.target.value); setPage(1); }}
                className="flex-1 rounded-xl border-none bg-surface-container-lowest px-4 py-3 text-sm transition-all focus:ring-2 focus:ring-primary/40"
              />
              <select
                value={statusFilter}
                onChange={(event) => { setStatusFilter(event.target.value); setPage(1); }}
                className="rounded-xl border-none bg-surface-container-lowest px-4 py-3 text-sm focus:ring-2 focus:ring-primary/40"
              >
                <option value="">全部状态</option>
                <option value="active">活跃</option>
                <option value="disabled">禁用</option>
                <option value="pending_review">待审核</option>
              </select>
            </div>
            <div className="inline-flex self-start rounded-full bg-surface-container-lowest p-1 shadow-sm">
              <button
                onClick={() => { setOnlineFilter("all"); setPage(1); }}
                className={`rounded-full px-4 py-2 text-sm font-bold ${onlineFilter === "all" ? "bg-primary text-on-primary" : "text-on-surface-variant"}`}
              >
                全部
              </button>
              <button
                onClick={() => { setOnlineFilter("true"); setPage(1); }}
                className={`rounded-full px-4 py-2 text-sm font-bold ${onlineFilter === "true" ? "bg-primary text-on-primary" : "text-on-surface-variant"}`}
              >
                在线
              </button>
              <button
                onClick={() => { setOnlineFilter("false"); setPage(1); }}
                className={`rounded-full px-4 py-2 text-sm font-bold ${onlineFilter === "false" ? "bg-primary text-on-primary" : "text-on-surface-variant"}`}
              >
                离线
              </button>
            </div>
          </div>

          <StaffTable loading={loading} staffList={staffList} onEdit={openEdit} onUpdateStatus={updateStatus} onDelete={deleteStaff} />
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
          <button
            onClick={() => setPage(Math.max(1, page - 1))}
            disabled={page === 1}
            className="rounded-lg px-4 py-2 text-sm font-semibold text-on-surface-variant transition-all hover:bg-surface-container-low disabled:opacity-40"
          >
            上一页
          </button>
          <span className="px-4 text-sm text-on-surface-variant">{page} / {totalPages}</span>
          <button
            onClick={() => setPage(Math.min(totalPages, page + 1))}
            disabled={page === totalPages}
            className="rounded-lg px-4 py-2 text-sm font-semibold text-on-surface-variant transition-all hover:bg-surface-container-low disabled:opacity-40"
          >
            下一页
          </button>
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
