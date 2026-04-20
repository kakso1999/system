"use client";

import { useCallback, useEffect, useState, type FormEvent, type ReactNode } from "react";
import { Plus, RefreshCcw, SquarePen, Trash2 } from "lucide-react";
import api from "@/lib/api";
import { getAdminToken } from "@/lib/auth";
import type { PageResponse } from "@/types";

type AdminRole = "super_admin" | "admin";
type AdminStatus = "active" | "disabled";
type AdminUser = { id: string; username: string; display_name: string; role: AdminRole; status: AdminStatus; must_change_password: boolean; last_login_at: string | null; created_at: string; updated_at: string };
type AdminForm = { username: string; password: string; display_name: string; role: AdminRole };
type AdminActionHandlers = { onEdit: (admin: AdminUser) => void; onResetPassword: (admin: AdminUser) => void; onToggleStatus: (admin: AdminUser) => void; onDelete: (admin: AdminUser) => void };
type AdminPageState = ReturnType<typeof useAdminsPageState>;

const emptyForm: AdminForm = { username: "", password: "", display_name: "", role: "admin" };
const headers = ["用户名", "显示名", "角色", "状态", "上次登录", "创建时间", "操作"];

function decodeTokenUsername() {
  const token = typeof document !== "undefined" ? getAdminToken() : null;
  if (!token) return null;
  try {
    const [, payloadB64] = token.split(".");
    const json = JSON.parse(atob(payloadB64.replace(/-/g, "+").replace(/_/g, "/")));
    return typeof json.sub === "string" ? json.sub : null;
  } catch {
    return null;
  }
}

function getErrorDetail(error: unknown, fallback: string) {
  const axiosErr = error as { response?: { data?: { detail?: string } } };
  return axiosErr.response?.data?.detail || fallback;
}

function formatTime(value: string | null) {
  if (!value) return "从未登录";
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? "-" : date.toLocaleString("zh-CN");
}

function Badge({ children, tone }: { children: ReactNode; tone: string }) {
  return <span className={`inline-flex rounded-full px-3 py-1 text-xs font-bold ${tone}`}>{children}</span>;
}

function ActionButton({
  children,
  className,
  onClick,
}: {
  children: ReactNode;
  className: string;
  onClick: () => void;
}) {
  return <button onClick={onClick} className={className}>{children}</button>;
}

function AdminModal(props: {
  mode: "create" | "edit";
  form: AdminForm;
  submitting: boolean;
  username?: string;
  onChange: (next: AdminForm) => void;
  onClose: () => void;
  onSubmit: (event: FormEvent) => void;
}) {
  const { mode, form, submitting, username, onChange, onClose, onSubmit } = props;
  const isCreate = mode === "create";
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-inverse-surface/40 px-4 backdrop-blur-sm">
      <div className="w-full max-w-md rounded-2xl bg-surface-container-lowest p-6 shadow-2xl">
        <h2 className="text-xl font-extrabold font-[var(--font-headline)]">{isCreate ? "新增管理员" : "编辑管理员"}</h2>
        <p className="mt-1 text-sm text-on-surface-variant">{isCreate ? "新建账号后，首次登录必须修改密码。" : `正在编辑 ${username}`}</p>
        <form onSubmit={onSubmit} className="mt-6 space-y-4">
          {isCreate && (
            <>
              <input type="text" value={form.username} onChange={(event) => onChange({ ...form, username: event.target.value })} placeholder="用户名" className="w-full rounded-xl border-none bg-surface-container-low px-4 py-3 text-sm" required />
              <input type="password" value={form.password} onChange={(event) => onChange({ ...form, password: event.target.value })} placeholder="初始密码" className="w-full rounded-xl border-none bg-surface-container-low px-4 py-3 text-sm" required />
            </>
          )}
          <input type="text" value={form.display_name} onChange={(event) => onChange({ ...form, display_name: event.target.value })} placeholder="显示名" className="w-full rounded-xl border-none bg-surface-container-low px-4 py-3 text-sm" required />
          {!isCreate && (
            <select value={form.role} onChange={(event) => onChange({ ...form, role: event.target.value as AdminRole })} className="w-full rounded-xl border-none bg-surface-container-low px-4 py-3 text-sm">
              <option value="admin">管理员</option>
              <option value="super_admin">超级管理员</option>
            </select>
          )}
          <div className="flex gap-3 pt-2">
            <button type="button" onClick={onClose} className="flex-1 rounded-full border border-outline-variant py-3 text-sm font-bold text-on-surface-variant">取消</button>
            <button type="submit" disabled={submitting} className="flex-1 rounded-full bg-primary py-3 text-sm font-bold text-on-primary disabled:opacity-60">{submitting ? "提交中..." : isCreate ? "确认创建" : "保存修改"}</button>
          </div>
        </form>
      </div>
    </div>
  );
}

function HeaderSection({ count, canCreate, onCreate }: { count: number; canCreate: boolean; onCreate: () => void }) {
  return (
    <div className="flex items-center justify-between gap-4">
      <div>
        <h1 className="text-3xl font-extrabold font-[var(--font-headline)] tracking-tight">管理员管理</h1>
        <p className="mt-1 text-on-surface-variant">共 {count} 个管理员账号</p>
      </div>
      {canCreate && (
        <button onClick={onCreate} className="flex items-center gap-2 rounded-full bg-primary px-6 py-3 text-sm font-bold text-on-primary shadow-lg shadow-primary/20 transition-all hover:shadow-xl active:scale-[0.98]">
          <Plus className="h-4 w-4" />
          新增管理员
        </button>
      )}
    </div>
  );
}

function ActionCell(props: { admin: AdminUser; canMutate: boolean; isSelf: boolean } & AdminActionHandlers) {
  const { admin, canMutate, isSelf, onEdit, onResetPassword, onToggleStatus, onDelete } = props;
  if (!canMutate) return <span className="text-xs text-on-surface-variant">{isSelf ? "当前账号不可操作" : "仅超级管理员可操作"}</span>;
  return (
    <div className="flex flex-wrap gap-2">
      <ActionButton onClick={() => onEdit(admin)} className="inline-flex items-center gap-1 rounded-full px-3 py-1.5 text-xs font-bold text-primary hover:bg-primary/10"><SquarePen className="h-3.5 w-3.5" />编辑</ActionButton>
      <ActionButton onClick={() => onResetPassword(admin)} className="inline-flex items-center gap-1 rounded-full px-3 py-1.5 text-xs font-bold text-on-surface hover:bg-surface-container-low"><RefreshCcw className="h-3.5 w-3.5" />重置密码</ActionButton>
      <ActionButton onClick={() => onToggleStatus(admin)} className={`rounded-full px-3 py-1.5 text-xs font-bold ${admin.status === "active" ? "text-error hover:bg-error/10" : "text-primary hover:bg-primary/10"}`}>{admin.status === "active" ? "禁用" : "启用"}</ActionButton>
      <ActionButton onClick={() => onDelete(admin)} className="inline-flex items-center gap-1 rounded-full px-3 py-1.5 text-xs font-bold text-error hover:bg-error/10"><Trash2 className="h-3.5 w-3.5" />删除</ActionButton>
    </div>
  );
}

function AdminsTable(props: {
  admins: AdminUser[];
  loading: boolean;
  myIdentity: string | null;
  canMutate: (admin: AdminUser) => boolean;
} & AdminActionHandlers) {
  const { admins, loading, myIdentity, canMutate, onEdit, onResetPassword, onToggleStatus, onDelete } = props;
  return (
    <div className="overflow-x-auto rounded-xl bg-surface-container-lowest shadow-sm">
      <table className="w-full min-w-[960px] text-sm">
        <thead>
          <tr className="border-b border-surface-container-high">
            {headers.map((item) => <th key={item} className="px-6 py-4 text-left text-xs font-bold uppercase tracking-wider text-on-surface-variant">{item}</th>)}
          </tr>
        </thead>
        <tbody>
          {loading && <tr><td colSpan={7} className="px-6 py-10 text-center text-on-surface-variant">加载中...</td></tr>}
          {!loading && admins.length === 0 && <tr><td colSpan={7} className="px-6 py-10 text-center text-on-surface-variant">暂无管理员数据</td></tr>}
          {!loading && admins.map((admin) => (
            <tr key={admin.id} className="border-b border-surface-container-high/50 transition-colors hover:bg-surface-container-low/50">
              <td className="px-6 py-4 font-mono text-xs text-on-surface">{admin.username}</td>
              <td className="px-6 py-4 font-semibold text-on-surface">{admin.display_name || "-"}</td>
              <td className="px-6 py-4"><Badge tone={admin.role === "super_admin" ? "bg-primary/12 text-primary" : "bg-surface-container-low text-on-surface"}>{admin.role === "super_admin" ? "超级管理员" : "管理员"}</Badge></td>
              <td className="px-6 py-4"><Badge tone={admin.status === "active" ? "bg-green-100 text-green-700" : "bg-red-100 text-red-700"}>{admin.status === "active" ? "活跃" : "禁用"}</Badge></td>
              <td className="px-6 py-4 text-xs text-on-surface-variant">{formatTime(admin.last_login_at)}</td>
              <td className="px-6 py-4 text-xs text-on-surface-variant">{formatTime(admin.created_at)}</td>
              <td className="px-6 py-4"><ActionCell admin={admin} canMutate={canMutate(admin)} isSelf={admin.username === myIdentity || admin.id === myIdentity} onEdit={onEdit} onResetPassword={onResetPassword} onToggleStatus={onToggleStatus} onDelete={onDelete} /></td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function useAdminsData() {
  const [admins, setAdmins] = useState<AdminUser[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [myAdmin, setMyAdmin] = useState<AdminUser | null>(null);
  const [myUsername, setMyUsername] = useState<string | null>(null);

  const loadAdmins = useCallback(async () => {
    setLoading(true);
    try {
      const res = await api.get<PageResponse<AdminUser>>("/api/admin/admins/");
      const items = res.data.items || [];
      const username = decodeTokenUsername();
      setAdmins(items);
      setTotal(res.data.total ?? items.length);
      setMyUsername(username);
      setMyAdmin(items.find((item) => item.username === username || item.id === username) || null);
    } catch {
      setAdmins([]);
      setTotal(0);
      setMyAdmin(null);
      setMyUsername(null);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { loadAdmins(); }, [loadAdmins]);
  return { admins, total, loading, myAdmin, myUsername, loadAdmins };
}

function useAdminsPageState() {
  const data = useAdminsData();
  const [submitting, setSubmitting] = useState(false);
  const [showCreate, setShowCreate] = useState(false);
  const [editingAdmin, setEditingAdmin] = useState<AdminUser | null>(null);
  const [form, setForm] = useState<AdminForm>(emptyForm);

  const resetForm = () => setForm(emptyForm);
  const closeCreate = () => { setShowCreate(false); resetForm(); };
  const closeEdit = () => { setEditingAdmin(null); resetForm(); };
  const openCreate = () => { resetForm(); setShowCreate(true); };
  const openEdit = (admin: AdminUser) => { setEditingAdmin(admin); setForm({ username: admin.username, password: "", display_name: admin.display_name, role: admin.role }); };

  return { ...data, submitting, showCreate, editingAdmin, form, setSubmitting, setForm, closeCreate, closeEdit, openCreate, openEdit };
}

async function runMutation(state: AdminPageState, request: Promise<unknown>, onDone: () => void, successText?: string) {
  state.setSubmitting(true);
  try {
    await request;
    onDone();
    await state.loadAdmins();
    if (successText) alert(successText);
  } finally {
    state.setSubmitting(false);
  }
}

function buildActions(state: AdminPageState): AdminActionHandlers {
  return {
    onEdit: state.openEdit,
    onResetPassword: async (admin) => {
      const nextPassword = window.prompt(`请输入「${admin.display_name || admin.username}」的新密码`);
      if (!nextPassword?.trim()) return;
      try {
        await runMutation(state, api.put(`/api/admin/admins/${admin.id}/reset-password`, { new_password: nextPassword.trim() }), () => undefined, "密码已重置");
      } catch (error) {
        alert(getErrorDetail(error, "重置密码失败"));
      }
    },
    onToggleStatus: async (admin) => {
      const status = admin.status === "active" ? "disabled" : "active";
      try {
        await runMutation(state, api.put(`/api/admin/admins/${admin.id}/status`, { status }), () => undefined);
      } catch (error) {
        alert(getErrorDetail(error, "更新状态失败"));
      }
    },
    onDelete: async (admin) => {
      if (!window.confirm(`确认删除管理员「${admin.display_name || admin.username}」？此操作不可恢复。`)) return;
      try {
        await runMutation(state, api.delete(`/api/admin/admins/${admin.id}`), () => undefined);
      } catch (error) {
        alert(getErrorDetail(error, "删除管理员失败"));
      }
    },
  };
}

async function submitCreate(event: FormEvent, state: AdminPageState) {
  event.preventDefault();
  try {
    await runMutation(state, api.post("/api/admin/admins/", { username: state.form.username, password: state.form.password, display_name: state.form.display_name }), state.closeCreate, "创建成功。新账号首次登录后必须修改密码。");
  } catch (error) {
    alert(getErrorDetail(error, "创建管理员失败"));
  }
}

async function submitEdit(event: FormEvent, state: AdminPageState) {
  event.preventDefault();
  if (!state.editingAdmin) return;
  try {
    await runMutation(state, api.put(`/api/admin/admins/${state.editingAdmin.id}`, { display_name: state.form.display_name, role: state.form.role }), state.closeEdit);
  } catch (error) {
    alert(getErrorDetail(error, "更新管理员失败"));
  }
}

export default function AdminsPage() {
  const state = useAdminsPageState();
  const actions = buildActions(state);
  const canMutate = (admin: AdminUser) => state.myAdmin?.role === "super_admin" && admin.username !== state.myUsername;
  const myIdentity = state.myAdmin?.id || state.myUsername;
  return (
    <div className="space-y-6">
      <HeaderSection count={state.total} canCreate={state.myAdmin?.role === "super_admin"} onCreate={state.openCreate} />
      <AdminsTable admins={state.admins} loading={state.loading} myIdentity={myIdentity} canMutate={canMutate} {...actions} />
      {state.showCreate && <AdminModal mode="create" form={state.form} submitting={state.submitting} onChange={state.setForm} onClose={state.closeCreate} onSubmit={(event) => submitCreate(event, state)} />}
      {state.editingAdmin && <AdminModal mode="edit" form={state.form} submitting={state.submitting} username={state.editingAdmin.username} onChange={state.setForm} onClose={state.closeEdit} onSubmit={(event) => submitEdit(event, state)} />}
    </div>
  );
}
