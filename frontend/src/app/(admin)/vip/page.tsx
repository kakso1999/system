"use client";

import { useCallback, useEffect, useState } from "react";
import { Gem, History, PencilLine, Users, type LucideIcon } from "lucide-react";
import api from "@/lib/api";
import type { PageResponse } from "@/types";
import { VIP_LEVEL_OPTIONS, type VipMember, type VipRulesResponse, type VipTab, type VipUpgradeLogRecord, vipBadgeClass, vipLabel } from "./vip-types";

type VipEditor = { member: VipMember; vipLevel: number; remark: string };

const tabs: Array<{ key: VipTab; label: string; icon: LucideIcon }> = [
  { key: "rules", label: "规则", icon: Gem },
  { key: "members", label: "会员", icon: Users },
  { key: "logs", label: "升级日志", icon: History },
];

function errorDetail(error: unknown, fallback: string) {
  const axiosError = error as { response?: { data?: { detail?: string } } };
  return axiosError.response?.data?.detail || fallback;
}

function formatPoints(value: number) {
  return `${Number(value || 0).toFixed(2)}P`;
}

function TabButton({ active, label, icon: Icon, onClick }: { active: boolean; label: string; icon: LucideIcon; onClick: () => void }) {
  const style = active ? "bg-primary text-on-primary" : "text-on-surface-variant hover:bg-surface-container-low";
  return <button onClick={onClick} className={`inline-flex items-center gap-2 rounded-full px-4 py-2 text-sm font-bold transition-colors ${style}`}><Icon className="h-4 w-4" />{label}</button>;
}

function VipLevelBadge({ level }: { level: number }) {
  return <span className={`rounded-full px-2 py-1 text-xs font-bold ${vipBadgeClass(level)}`}>{vipLabel(level)}</span>;
}

function Pager({ page, totalPages, onPrev, onNext }: { page: number; totalPages: number; onPrev: () => void; onNext: () => void }) {
  if (totalPages <= 1) return null;
  return (
    <div className="flex items-center justify-center gap-2">
      <button onClick={onPrev} disabled={page === 1} className="rounded-lg px-4 py-2 text-sm font-semibold text-on-surface-variant hover:bg-surface-container-low disabled:opacity-40">上一页</button>
      <span className="px-4 text-sm text-on-surface-variant">{page} / {totalPages}</span>
      <button onClick={onNext} disabled={page === totalPages} className="rounded-lg px-4 py-2 text-sm font-semibold text-on-surface-variant hover:bg-surface-container-low disabled:opacity-40">下一页</button>
    </div>
  );
}

function RulesPanel({ rules, loading }: { rules: VipRulesResponse | null; loading: boolean }) {
  const thresholdRows = rules ? [["VIP1", rules.thresholds.vip1], ["VIP2", rules.thresholds.vip2], ["VIP3", rules.thresholds.vip3], ["超级VIP", rules.thresholds.svip]] : [];
  const rateRows = rules ? [["普通一级", rules.level1_rates.default], ["VIP1 一级", rules.level1_rates.vip1], ["VIP2 一级", rules.level1_rates.vip2], ["VIP3 一级", rules.level1_rates.vip3], ["超级VIP 一级", rules.level1_rates.svip], ["二级团队", rules.level2_rate], ["三级团队", rules.level3_rate]] : [];
  if (loading) return <section className="rounded-xl bg-surface-container-lowest p-8 text-center text-on-surface-variant shadow-sm">加载中...</section>;
  if (!rules) return <section className="rounded-xl bg-surface-container-lowest p-8 text-center text-on-surface-variant shadow-sm">暂无规则数据</section>;
  return (
    <div className="grid gap-6 lg:grid-cols-2">
      <section className="rounded-xl bg-surface-container-lowest p-6 shadow-sm">
        <h2 className="text-lg font-extrabold font-[var(--font-headline)]">升级门槛</h2>
        <div className="mt-4 grid gap-3 sm:grid-cols-2">{thresholdRows.map(([label, value]) => <article key={label} className="rounded-2xl bg-surface-container-low p-4"><p className="text-xs font-bold uppercase tracking-wider text-on-surface-variant">{label}</p><p className="mt-2 text-2xl font-extrabold font-[var(--font-headline)]">{value}</p><p className="mt-1 text-xs text-on-surface-variant">累计有效数</p></article>)}</div>
      </section>
      <section className="rounded-xl bg-surface-container-lowest p-6 shadow-sm">
        <h2 className="text-lg font-extrabold font-[var(--font-headline)]">佣金比例</h2>
        <div className="mt-4 space-y-3">{rateRows.map(([label, value]) => <div key={label} className="flex items-center justify-between rounded-2xl bg-surface-container-low px-4 py-3"><span className="text-sm font-medium">{label}</span><span className="text-sm font-bold text-primary">{formatPoints(Number(value))}</span></div>)}</div>
      </section>
    </div>
  );
}

function MembersPanel(props: { items: VipMember[]; total: number; loading: boolean; level: string; page: number; totalPages: number; onLevelChange: (value: string) => void; onPrev: () => void; onNext: () => void; onEdit: (member: VipMember) => void; }) {
  const { items, total, loading, level, page, totalPages, onLevelChange, onPrev, onNext, onEdit } = props;
  return (
    <div className="space-y-4">
      <section className="flex flex-col gap-3 rounded-xl bg-surface-container-lowest p-4 shadow-sm md:flex-row md:items-center md:justify-between">
        <div><p className="text-sm font-semibold">VIP 会员总数</p><p className="text-2xl font-extrabold font-[var(--font-headline)]">{total}</p></div>
        <select value={level} onChange={(event) => onLevelChange(event.target.value)} className="rounded-xl border-none bg-surface-container-low px-4 py-3 text-sm focus:ring-2 focus:ring-primary/40"><option value="all">全部等级</option>{VIP_LEVEL_OPTIONS.map((item) => <option key={item} value={String(item)}>{vipLabel(item)}</option>)}</select>
      </section>
      <section className="overflow-x-auto rounded-xl bg-surface-container-lowest shadow-sm">
        <table className="min-w-[920px] w-full text-sm"><thead><tr className="border-b border-surface-container-high">{["编号", "姓名", "手机号", "VIP", "累计有效", "累计佣金", "更新时间", "操作"].map((title) => <th key={title} className="px-6 py-4 text-left text-xs font-bold uppercase tracking-wider text-on-surface-variant">{title}</th>)}</tr></thead><tbody>{loading ? <tr><td colSpan={8} className="px-6 py-8 text-center text-on-surface-variant">加载中...</td></tr> : items.length === 0 ? <tr><td colSpan={8} className="px-6 py-8 text-center text-on-surface-variant">暂无会员数据</td></tr> : items.map((member) => <tr key={member.id} className="border-b border-surface-container-high/50 hover:bg-surface-container-low/50"><td className="px-6 py-4 font-mono text-xs">{member.staff_no || "-"}</td><td className="px-6 py-4 font-semibold">{member.name || "-"}</td><td className="px-6 py-4 font-mono text-xs">{member.phone || "-"}</td><td className="px-6 py-4"><VipLevelBadge level={member.vip_level} /></td><td className="px-6 py-4">{member.total_valid}</td><td className="px-6 py-4 font-semibold text-primary">{formatPoints(member.total_commission)}</td><td className="px-6 py-4 text-xs text-on-surface-variant">{member.updated_at ? new Date(member.updated_at).toLocaleString() : "-"}</td><td className="px-6 py-4"><button onClick={() => onEdit(member)} className="inline-flex items-center gap-1 rounded-lg bg-primary/10 px-3 py-1 text-xs font-bold text-primary hover:bg-primary/15"><PencilLine className="h-3.5 w-3.5" />调整等级</button></td></tr>)}</tbody></table>
      </section>
      <Pager page={page} totalPages={totalPages} onPrev={onPrev} onNext={onNext} />
    </div>
  );
}

function LogsPanel(props: { items: VipUpgradeLogRecord[]; total: number; loading: boolean; staffId: string; page: number; totalPages: number; onStaffIdChange: (value: string) => void; onPrev: () => void; onNext: () => void; }) {
  const { items, total, loading, staffId, page, totalPages, onStaffIdChange, onPrev, onNext } = props;
  return (
    <div className="space-y-4">
      <section className="flex flex-col gap-3 rounded-xl bg-surface-container-lowest p-4 shadow-sm md:flex-row md:items-center md:justify-between">
        <div><p className="text-sm font-semibold">升级记录</p><p className="text-2xl font-extrabold font-[var(--font-headline)]">{total}</p></div>
        <input value={staffId} onChange={(event) => onStaffIdChange(event.target.value)} placeholder="按 staff_id 筛选" className="w-full rounded-xl border-none bg-surface-container-low px-4 py-3 text-sm md:max-w-sm focus:ring-2 focus:ring-primary/40" />
      </section>
      <section className="overflow-x-auto rounded-xl bg-surface-container-lowest shadow-sm">
        <table className="min-w-[840px] w-full text-sm"><thead><tr className="border-b border-surface-container-high">{["地推员", "Staff ID", "等级变化", "原因", "时间"].map((title) => <th key={title} className="px-6 py-4 text-left text-xs font-bold uppercase tracking-wider text-on-surface-variant">{title}</th>)}</tr></thead><tbody>{loading ? <tr><td colSpan={5} className="px-6 py-8 text-center text-on-surface-variant">加载中...</td></tr> : items.length === 0 ? <tr><td colSpan={5} className="px-6 py-8 text-center text-on-surface-variant">暂无升级日志</td></tr> : items.map((item) => <tr key={item.id} className="border-b border-surface-container-high/50 hover:bg-surface-container-low/50"><td className="px-6 py-4 font-semibold">{item.staff_name || "-"}</td><td className="px-6 py-4 font-mono text-xs">{item.staff_id}</td><td className="px-6 py-4"><div className="flex items-center gap-2"><VipLevelBadge level={item.from_level} /><span className="text-on-surface-variant">→</span><VipLevelBadge level={item.to_level} /></div></td><td className="px-6 py-4">{item.reason || "-"}</td><td className="px-6 py-4 text-xs text-on-surface-variant">{item.created_at ? new Date(item.created_at).toLocaleString() : "-"}</td></tr>)}</tbody></table>
      </section>
      <Pager page={page} totalPages={totalPages} onPrev={onPrev} onNext={onNext} />
    </div>
  );
}

function EditModal(props: { editor: VipEditor; saving: boolean; onClose: () => void; onChange: (next: VipEditor) => void; onSubmit: () => void; }) {
  const { editor, saving, onClose, onChange, onSubmit } = props;
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-4">
      <div className="w-full max-w-md rounded-xl bg-surface-container-lowest p-6 shadow-xl">
        <h2 className="text-xl font-extrabold font-[var(--font-headline)]">调整 VIP 等级</h2>
        <p className="mt-1 text-sm text-on-surface-variant">{editor.member.name || "-"} / {editor.member.staff_no || "-"}</p>
        <select value={editor.vipLevel} onChange={(event) => onChange({ ...editor, vipLevel: Number(event.target.value) })} className="mt-4 w-full rounded-xl border-none bg-surface-container-low px-4 py-3 text-sm focus:ring-2 focus:ring-primary/40">{VIP_LEVEL_OPTIONS.map((level) => <option key={level} value={level}>{vipLabel(level)}</option>)}</select>
        <textarea value={editor.remark} onChange={(event) => onChange({ ...editor, remark: event.target.value })} placeholder="备注（可选）" className="mt-4 min-h-28 w-full rounded-xl border-none bg-surface-container-low px-4 py-3 text-sm focus:ring-2 focus:ring-primary/40" />
        <div className="mt-5 flex justify-end gap-3"><button onClick={onClose} className="rounded-xl px-4 py-2 text-sm font-bold text-on-surface-variant hover:bg-surface-container-low">取消</button><button onClick={onSubmit} disabled={saving} className="rounded-xl bg-primary px-4 py-2 text-sm font-bold text-on-primary disabled:opacity-50">{saving ? "提交中..." : "确认调整"}</button></div>
      </div>
    </div>
  );
}

export default function VipPage() {
  const [activeTab, setActiveTab] = useState<VipTab>("rules");
  const [rules, setRules] = useState<VipRulesResponse | null>(null);
  const [rulesLoading, setRulesLoading] = useState(true);
  const [members, setMembers] = useState<VipMember[]>([]);
  const [membersTotal, setMembersTotal] = useState(0);
  const [memberPage, setMemberPage] = useState(1);
  const [memberLevel, setMemberLevel] = useState("all");
  const [membersLoading, setMembersLoading] = useState(false);
  const [logs, setLogs] = useState<VipUpgradeLogRecord[]>([]);
  const [logsTotal, setLogsTotal] = useState(0);
  const [logPage, setLogPage] = useState(1);
  const [logStaffId, setLogStaffId] = useState("");
  const [logsLoading, setLogsLoading] = useState(false);
  const [editor, setEditor] = useState<VipEditor | null>(null);
  const [saving, setSaving] = useState(false);

  const loadRules = useCallback(async () => {
    setRulesLoading(true);
    try { const res = await api.get<VipRulesResponse>("/api/admin/vip/rules"); setRules(res.data); } catch { setRules(null); } finally { setRulesLoading(false); }
  }, []);
  const loadMembers = useCallback(async () => {
    setMembersLoading(true);
    try { const params: Record<string, string | number> = { page: memberPage, page_size: 20 }; if (memberLevel !== "all") params.level = Number(memberLevel); const res = await api.get<PageResponse<VipMember>>("/api/admin/vip/members", { params }); setMembers(res.data.items || []); setMembersTotal(res.data.total || 0); } catch { setMembers([]); setMembersTotal(0); } finally { setMembersLoading(false); }
  }, [memberLevel, memberPage]);
  const loadLogs = useCallback(async () => {
    setLogsLoading(true);
    try { const params: Record<string, string | number> = { page: logPage, page_size: 20 }; if (logStaffId.trim()) params.staff_id = logStaffId.trim(); const res = await api.get<PageResponse<VipUpgradeLogRecord>>("/api/admin/vip/upgrade-logs", { params }); setLogs(res.data.items || []); setLogsTotal(res.data.total || 0); } catch { setLogs([]); setLogsTotal(0); } finally { setLogsLoading(false); }
  }, [logPage, logStaffId]);

  useEffect(() => { void loadRules(); }, [loadRules]);
  useEffect(() => { if (activeTab === "members") void loadMembers(); }, [activeTab, loadMembers]);
  useEffect(() => { if (activeTab === "logs") void loadLogs(); }, [activeTab, loadLogs]);

  const submitEdit = async () => {
    if (!editor) return;
    setSaving(true);
    try {
      await api.put(`/api/admin/vip/members/${editor.member.id}`, { vip_level: editor.vipLevel, remark: editor.remark.trim() || undefined });
      setEditor(null);
      await Promise.all([loadMembers(), loadLogs()]);
    } catch (error: unknown) {
      alert(errorDetail(error, "调整失败"));
    } finally {
      setSaving(false);
    }
  };

  const memberTotalPages = Math.max(1, Math.ceil(membersTotal / 20));
  const logTotalPages = Math.max(1, Math.ceil(logsTotal / 20));

  return (
    <div className="space-y-6">
      <div><h1 className="text-3xl font-extrabold font-[var(--font-headline)] tracking-tight">VIP 管理</h1><p className="mt-1 text-on-surface-variant">查看 VIP 规则、会员等级与升级日志</p></div>
      <section className="inline-flex gap-2 rounded-xl bg-surface-container-lowest p-2 shadow-sm">{tabs.map((tab) => <TabButton key={tab.key} active={activeTab === tab.key} label={tab.label} icon={tab.icon} onClick={() => setActiveTab(tab.key)} />)}</section>
      {activeTab === "rules" && <RulesPanel rules={rules} loading={rulesLoading} />}
      {activeTab === "members" && <MembersPanel items={members} total={membersTotal} loading={membersLoading} level={memberLevel} page={memberPage} totalPages={memberTotalPages} onLevelChange={(value) => { setMemberLevel(value); setMemberPage(1); }} onPrev={() => setMemberPage((prev) => Math.max(1, prev - 1))} onNext={() => setMemberPage((prev) => Math.min(memberTotalPages, prev + 1))} onEdit={(member) => setEditor({ member, vipLevel: member.vip_level, remark: "" })} />}
      {activeTab === "logs" && <LogsPanel items={logs} total={logsTotal} loading={logsLoading} staffId={logStaffId} page={logPage} totalPages={logTotalPages} onStaffIdChange={(value) => { setLogStaffId(value); setLogPage(1); }} onPrev={() => setLogPage((prev) => Math.max(1, prev - 1))} onNext={() => setLogPage((prev) => Math.min(logTotalPages, prev + 1))} />}
      {editor && <EditModal editor={editor} saving={saving} onClose={() => setEditor(null)} onChange={setEditor} onSubmit={submitEdit} />}
    </div>
  );
}
