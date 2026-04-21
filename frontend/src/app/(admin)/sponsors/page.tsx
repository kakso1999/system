"use client";

import { useEffect, useRef, useState, type ChangeEvent, type FormEvent } from "react";
import { Handshake, Link2, Plus, Power, PowerOff, SquarePen, Trash2, Upload } from "lucide-react";
import api from "@/lib/api";
import type { PageResponse } from "@/types";

type SponsorDetail = { id: string; name: string; logo_url: string; link_url: string; enabled: boolean; sort_order: number; created_at: string; updated_at?: string | null };
type SponsorForm = { name: string; logo_url: string; link_url: string; enabled: boolean; sort_order: number };
type ModalMode = "create" | "edit" | null;
type ModalState = { mode: ModalMode; selected: SponsorDetail | null; form: SponsorForm };

const pageSize = 20;
const headers = ["排序", "Logo", "名称", "链接", "状态", "创建时间", "操作"];
const emptyForm: SponsorForm = { name: "", logo_url: "", link_url: "", enabled: true, sort_order: 0 };

function createForm(sponsor?: SponsorDetail | null): SponsorForm {
  return sponsor ? { name: sponsor.name, logo_url: sponsor.logo_url || "", link_url: sponsor.link_url || "", enabled: sponsor.enabled, sort_order: sponsor.sort_order || 0 } : emptyForm;
}

function formatTime(value: string) {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? "-" : date.toLocaleString("zh-CN");
}

function getErrorDetail(error: unknown, fallback: string) {
  const axiosErr = error as { response?: { data?: { detail?: string } } };
  return axiosErr.response?.data?.detail || fallback;
}

async function requestSponsors(page: number) {
  const res = await api.get<PageResponse<SponsorDetail>>("/api/admin/sponsors/", { params: { page, page_size: pageSize } });
  return { items: res.data.items || [], total: res.data.total || 0 };
}

function LogoPreview({ logoUrl, name }: { logoUrl: string; name: string }) {
  return logoUrl
    ? <img src={logoUrl} alt={name} className="h-14 w-14 rounded-xl bg-surface-container-low object-contain p-2" />
    : <div className="flex h-14 w-14 items-center justify-center rounded-xl bg-surface-container-low text-outline"><Handshake className="h-5 w-5" /></div>;
}

function useSponsorsList(page: number) {
  const [items, setItems] = useState<SponsorDetail[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);

  async function reload(targetPage = page) {
    setLoading(true);
    try {
      const data = await requestSponsors(targetPage);
      setItems(data.items);
      setTotal(data.total);
    } catch {
      setItems([]);
      setTotal(0);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void reload(page);
  }, [page]);

  return { items, total, loading, reload };
}

function useModalState() {
  const [modal, setModal] = useState<ModalState>({ mode: null, selected: null, form: emptyForm });
  const openCreate = () => setModal({ mode: "create", selected: null, form: emptyForm });
  const openEdit = (selected: SponsorDetail) => setModal({ mode: "edit", selected, form: createForm(selected) });
  const close = () => setModal({ mode: null, selected: null, form: emptyForm });
  const updateForm = (form: SponsorForm) => setModal((current) => ({ ...current, form }));
  const updateLogo = (logo_url: string) => setModal((current) => ({ ...current, selected: current.selected ? { ...current.selected, logo_url } : null, form: { ...current.form, logo_url } }));
  return { modal, openCreate, openEdit, close, updateForm, updateLogo };
}

function Header({ total, onCreate }: { total: number; onCreate: () => void }) {
  return (
    <div className="flex items-center justify-between gap-4">
      <div>
        <h1 className="text-3xl font-extrabold font-[var(--font-headline)] tracking-tight">赞助商</h1>
        <p className="mt-1 text-on-surface-variant">共 {total} 个赞助商，管理 Logo、跳转链接和展示顺序。</p>
      </div>
      <button onClick={onCreate} className="flex items-center gap-2 rounded-full bg-primary px-6 py-3 text-sm font-bold text-on-primary shadow-lg shadow-primary/20 transition-all hover:shadow-xl active:scale-[0.98]">
        <Plus className="h-4 w-4" />
        New Sponsor
      </button>
    </div>
  );
}

function SponsorRow(props: { item: SponsorDetail; onEdit: (item: SponsorDetail) => void; onToggle: (item: SponsorDetail) => void; onDelete: (item: SponsorDetail) => void }) {
  const { item, onEdit, onToggle, onDelete } = props;
  return (
    <tr className="border-b border-surface-container-high/50 transition-colors hover:bg-surface-container-low/50">
      <td className="px-6 py-4 font-mono text-xs">{item.sort_order}</td>
      <td className="px-6 py-4"><LogoPreview logoUrl={item.logo_url} name={item.name} /></td>
      <td className="px-6 py-4 font-semibold text-on-surface">{item.name}</td>
      <td className="px-6 py-4 text-xs text-on-surface-variant">{item.link_url ? <a href={item.link_url} target="_blank" rel="noreferrer" className="inline-flex max-w-[260px] items-center gap-1 truncate text-primary hover:underline"><Link2 className="h-3.5 w-3.5" />{item.link_url}</a> : "—"}</td>
      <td className="px-6 py-4"><span className={`inline-flex rounded-full px-3 py-1 text-xs font-bold ${item.enabled ? "bg-green-100 text-green-700" : "bg-gray-100 text-gray-600"}`}>{item.enabled ? "启用" : "禁用"}</span></td>
      <td className="px-6 py-4 text-xs text-on-surface-variant">{formatTime(item.created_at)}</td>
      <td className="px-6 py-4"><div className="flex flex-wrap gap-2">
        <button onClick={() => onEdit(item)} className="inline-flex items-center gap-1 rounded-full px-3 py-1.5 text-xs font-bold text-primary hover:bg-primary/10"><SquarePen className="h-3.5 w-3.5" />编辑</button>
        <button onClick={() => onToggle(item)} className={`inline-flex items-center gap-1 rounded-full px-3 py-1.5 text-xs font-bold ${item.enabled ? "text-error hover:bg-error/10" : "text-green-700 hover:bg-green-100"}`}>{item.enabled ? <PowerOff className="h-3.5 w-3.5" /> : <Power className="h-3.5 w-3.5" />}{item.enabled ? "禁用" : "启用"}</button>
        <button onClick={() => onDelete(item)} className="inline-flex items-center gap-1 rounded-full px-3 py-1.5 text-xs font-bold text-error hover:bg-error/10"><Trash2 className="h-3.5 w-3.5" />删除</button>
      </div></td>
    </tr>
  );
}

function SponsorsTable(props: { loading: boolean; items: SponsorDetail[]; onEdit: (item: SponsorDetail) => void; onToggle: (item: SponsorDetail) => void; onDelete: (item: SponsorDetail) => void }) {
  return (
    <div className="overflow-x-auto rounded-xl bg-surface-container-lowest shadow-sm">
      <table className="w-full min-w-[1100px] text-sm">
        <thead><tr className="border-b border-surface-container-high">{headers.map((header) => <th key={header} className="px-6 py-4 text-left text-xs font-bold uppercase tracking-wider text-on-surface-variant">{header}</th>)}</tr></thead>
        <tbody>
          {props.loading && <tr><td colSpan={7} className="px-6 py-10 text-center text-on-surface-variant">加载中...</td></tr>}
          {!props.loading && props.items.length === 0 && <tr><td colSpan={7} className="px-6 py-10 text-center text-on-surface-variant">暂无赞助商，点击右上角创建</td></tr>}
          {!props.loading && props.items.map((item) => <SponsorRow key={item.id} item={item} onEdit={props.onEdit} onToggle={props.onToggle} onDelete={props.onDelete} />)}
        </tbody>
      </table>
    </div>
  );
}

function SponsorsModal(props: { modal: ModalState; saving: boolean; uploading: boolean; onChange: (form: SponsorForm) => void; onClose: () => void; onSubmit: (event: FormEvent) => void; onUpload: () => void }) {
  if (!props.modal.mode) return null;
  const edit = props.modal.mode === "edit";
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-inverse-surface/40 px-4 py-8 backdrop-blur-sm">
      <div className="w-full max-w-lg rounded-2xl bg-surface-container-lowest p-8 shadow-2xl">
        <h2 className="mb-6 text-xl font-extrabold font-[var(--font-headline)]">{edit ? "编辑赞助商" : "新增赞助商"}</h2>
        <form onSubmit={props.onSubmit} className="space-y-4">
          <div className="flex items-center gap-4 rounded-2xl bg-surface-container-low p-4">
            <LogoPreview logoUrl={props.modal.form.logo_url} name={props.modal.form.name || "Sponsor"} />
            <div className="flex-1"><p className="text-sm font-bold text-on-surface">{props.modal.form.name || "未命名赞助商"}</p><p className="mt-1 text-xs text-on-surface-variant">{props.modal.form.logo_url || "尚未上传 Logo"}</p></div>
            {edit && <button type="button" onClick={props.onUpload} disabled={props.uploading || !props.modal.selected} className="inline-flex items-center gap-2 rounded-full bg-primary px-4 py-2 text-xs font-bold text-on-primary disabled:opacity-50"><Upload className="h-4 w-4" />{props.uploading ? "上传中..." : "上传 Logo"}</button>}
          </div>
          <input type="text" value={props.modal.form.name} onChange={(e) => props.onChange({ ...props.modal.form, name: e.target.value })} placeholder="赞助商名称" className="w-full rounded-xl border-none bg-surface-container-low px-4 py-3 text-sm focus:ring-2 focus:ring-primary/40" required />
          <input type="url" value={props.modal.form.link_url} onChange={(e) => props.onChange({ ...props.modal.form, link_url: e.target.value })} placeholder="https://example.com" className="w-full rounded-xl border-none bg-surface-container-low px-4 py-3 text-sm focus:ring-2 focus:ring-primary/40" />
          <div className="grid grid-cols-2 gap-3">
            <input type="number" value={props.modal.form.sort_order} onChange={(e) => props.onChange({ ...props.modal.form, sort_order: Number.parseInt(e.target.value, 10) || 0 })} className="w-full rounded-xl border-none bg-surface-container-low px-4 py-3 text-sm focus:ring-2 focus:ring-primary/40" />
            <button type="button" onClick={() => props.onChange({ ...props.modal.form, enabled: !props.modal.form.enabled })} className={`rounded-xl px-4 py-3 text-sm font-bold ${props.modal.form.enabled ? "bg-green-100 text-green-700" : "bg-gray-100 text-gray-600"}`}>当前状态: {props.modal.form.enabled ? "启用" : "禁用"}</button>
          </div>
          <div className="flex gap-3 pt-2"><button type="button" onClick={props.onClose} className="flex-1 rounded-full border border-outline-variant py-3 text-sm font-bold text-on-surface-variant">取消</button><button type="submit" disabled={props.saving} className="flex-1 rounded-full bg-primary py-3 text-sm font-bold text-on-primary disabled:opacity-60">{props.saving ? "保存中..." : edit ? "保存" : "创建"}</button></div>
        </form>
      </div>
    </div>
  );
}

function DeleteDialog(props: { item: SponsorDetail | null; deleting: boolean; onClose: () => void; onConfirm: () => void }) {
  if (!props.item) return null;
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-inverse-surface/40 px-4 backdrop-blur-sm">
      <div className="w-full max-w-md rounded-2xl bg-surface-container-lowest p-6 shadow-2xl">
        <h2 className="text-xl font-extrabold font-[var(--font-headline)]">删除赞助商</h2>
        <p className="mt-2 text-sm text-on-surface-variant">确认删除「{props.item.name}」？此操作不可恢复。</p>
        <div className="mt-6 flex gap-3"><button onClick={props.onClose} className="flex-1 rounded-full border border-outline-variant py-3 text-sm font-bold text-on-surface-variant">取消</button><button onClick={props.onConfirm} disabled={props.deleting} className="flex-1 rounded-full bg-error py-3 text-sm font-bold text-on-error disabled:opacity-50">{props.deleting ? "删除中..." : "确认删除"}</button></div>
      </div>
    </div>
  );
}

function Pagination(props: { page: number; totalPages: number; onPageChange: (updater: (current: number) => number) => void }) {
  if (props.totalPages <= 1) return null;
  return (
    <div className="flex items-center justify-center gap-2">
      <button onClick={() => props.onPageChange((current) => Math.max(1, current - 1))} disabled={props.page === 1} className="rounded-lg px-4 py-2 text-sm font-semibold text-on-surface-variant transition-all hover:bg-surface-container-low disabled:opacity-40">上一页</button>
      <span className="px-4 text-sm text-on-surface-variant">{props.page} / {props.totalPages}</span>
      <button onClick={() => props.onPageChange((current) => Math.min(props.totalPages, current + 1))} disabled={props.page === props.totalPages} className="rounded-lg px-4 py-2 text-sm font-semibold text-on-surface-variant transition-all hover:bg-surface-container-low disabled:opacity-40">下一页</button>
    </div>
  );
}

async function runSave(modal: ModalState, close: () => void, reload: (targetPage?: number) => Promise<void>, setSaving: (value: boolean) => void) {
  setSaving(true);
  try {
    if (modal.mode === "create") await api.post("/api/admin/sponsors/", modal.form);
    if (modal.mode === "edit" && modal.selected) await api.put(`/api/admin/sponsors/${modal.selected.id}`, modal.form);
    close();
    await reload();
  } catch (error) {
    alert(getErrorDetail(error, "保存失败"));
  } finally {
    setSaving(false);
  }
}

async function runToggle(item: SponsorDetail, reload: (targetPage?: number) => Promise<void>) {
  try {
    await api.put(`/api/admin/sponsors/${item.id}/toggle`);
    await reload();
  } catch (error) {
    alert(getErrorDetail(error, "更新状态失败"));
  }
}

async function runDelete(props: { pendingDelete: SponsorDetail | null; items: SponsorDetail[]; page: number; setPage: (value: number) => void; setPendingDelete: (value: SponsorDetail | null) => void; reload: (targetPage?: number) => Promise<void>; setDeleting: (value: boolean) => void }) {
  if (!props.pendingDelete) return;
  const nextPage = props.items.length === 1 && props.page > 1 ? props.page - 1 : props.page;
  props.setDeleting(true);
  try {
    await api.delete(`/api/admin/sponsors/${props.pendingDelete.id}`);
    props.setPendingDelete(null);
    if (nextPage !== props.page) props.setPage(nextPage);
    await props.reload(nextPage);
  } catch (error) {
    alert(getErrorDetail(error, "删除失败"));
  } finally {
    props.setDeleting(false);
  }
}

async function runUploadLogo(props: { event: ChangeEvent<HTMLInputElement>; selected: SponsorDetail | null; updateLogo: (logo_url: string) => void; reload: (targetPage?: number) => Promise<void>; setUploading: (value: boolean) => void }) {
  const file = props.event.target.files?.[0];
  if (!file || !props.selected) return;
  const formData = new FormData();
  formData.append("file", file);
  props.setUploading(true);
  try {
    const res = await api.post<{ logo_url: string }>(`/api/admin/sponsors/${props.selected.id}/upload-logo`, formData, { headers: { "Content-Type": "multipart/form-data" } });
    props.updateLogo(res.data.logo_url || "");
    await props.reload();
  } catch (error) {
    alert(getErrorDetail(error, "上传失败"));
  } finally {
    props.event.target.value = "";
    props.setUploading(false);
  }
}

export default function SponsorsPage() {
  const [page, setPage] = useState(1);
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [pendingDelete, setPendingDelete] = useState<SponsorDetail | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const { items, total, loading, reload } = useSponsorsList(page);
  const { modal, openCreate, openEdit, close, updateForm, updateLogo } = useModalState();
  const totalPages = Math.max(1, Math.ceil(total / pageSize));

  return (
    <div className="space-y-6">
      <Header total={total} onCreate={openCreate} />
      <SponsorsTable loading={loading} items={items} onEdit={openEdit} onToggle={(item) => void runToggle(item, reload)} onDelete={setPendingDelete} />
      <Pagination page={page} totalPages={totalPages} onPageChange={setPage} />
      <input ref={inputRef} type="file" accept="image/*" onChange={(event) => void runUploadLogo({ event, selected: modal.selected, updateLogo, reload, setUploading })} className="hidden" />
      <SponsorsModal modal={modal} saving={saving} uploading={uploading} onChange={updateForm} onClose={close} onSubmit={(event) => { event.preventDefault(); void runSave(modal, close, reload, setSaving); }} onUpload={() => inputRef.current?.click()} />
      <DeleteDialog item={pendingDelete} deleting={deleting} onClose={() => setPendingDelete(null)} onConfirm={() => void runDelete({ pendingDelete, items, page, setPage, setPendingDelete, reload, setDeleting })} />
    </div>
  );
}
