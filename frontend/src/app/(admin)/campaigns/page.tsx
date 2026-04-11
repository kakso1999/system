"use client";

import { useEffect, useState, useCallback } from "react";
import { Plus, Pencil, Trash2, Play, Pause, Eye, Users, Settings2, ExternalLink, Upload, Gift, ChevronDown, ChevronRight } from "lucide-react";
import api, { resolveApiUrl } from "@/lib/api";
import type { Campaign, PageResponse, WheelItem, Staff } from "@/types";

type ModalMode = "create" | "edit" | "wheel" | "staff" | null;

interface StaffPrizeStat {
  wheel_item_id: string;
  display_name: string;
  type: "onsite" | "website";
  max_per_staff: number;
  claimed_count: number;
}

export default function CampaignsPage() {
  const [campaigns, setCampaigns] = useState<Campaign[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(true);
  const [modal, setModal] = useState<ModalMode>(null);
  const [selected, setSelected] = useState<Campaign | null>(null);

  const [form, setForm] = useState({ name: "", description: "", start_time: "", end_time: "", rules_text: "", max_claims_per_user: 1 });

  const [wheelItems, setWheelItems] = useState<WheelItem[]>([]);
  const [wheelForm, setWheelForm] = useState({
    name: "",
    display_name: "",
    type: "onsite" as "onsite" | "website",
    weight: 10,
    sort_order: 0,
    max_per_staff: 0,
    redirect_url: "",
    display_text: "",
    enabled: true,
  });
  const [editingWheel, setEditingWheel] = useState<WheelItem | null>(null);

  const [allStaff, setAllStaff] = useState<Staff[]>([]);
  const [selectedStaffIds, setSelectedStaffIds] = useState<string[]>([]);
  const [expandedStaffIds, setExpandedStaffIds] = useState<Record<string, boolean>>({});
  const [staffPrizeStats, setStaffPrizeStats] = useState<Record<string, StaffPrizeStat[]>>({});
  const [loadingStaffStats, setLoadingStaffStats] = useState<Record<string, boolean>>({});

  const loadCampaigns = useCallback(async () => {
    setLoading(true);
    try {
      const res = await api.get<PageResponse<Campaign>>("/api/admin/campaigns/", { params: { page, page_size: 20 } });
      setCampaigns(res.data.items);
      setTotal(res.data.total);
    } catch { setCampaigns([]); }
    finally { setLoading(false); }
  }, [page]);

  useEffect(() => { loadCampaigns(); }, [loadCampaigns]);

  const openCreate = () => {
    setSelected(null);
    setForm({ name: "", description: "", start_time: "", end_time: "", rules_text: "", max_claims_per_user: 1 });
    setModal("create");
  };

  const openEdit = (c: Campaign) => {
    setSelected(c);
    setForm({
      name: c.name, description: c.description,
      start_time: c.start_time?.slice(0, 16) || "", end_time: c.end_time?.slice(0, 16) || "",
      rules_text: c.rules_text || "",
      max_claims_per_user: c.max_claims_per_user || 1,
    });
    setModal("edit");
  };

  const openWheel = async (c: Campaign) => {
    setSelected(c);
    setModal("wheel");
    setEditingWheel(null);
    resetWheelForm();
    try {
      const res = await api.get<WheelItem[]>("/api/admin/wheel-items/", { params: { campaign_id: c.id } });
      setWheelItems(res.data);
    } catch { setWheelItems([]); }
  };

  const openStaff = async (c: Campaign) => {
    setSelected(c);
    setModal("staff");
    setExpandedStaffIds({});
    setStaffPrizeStats({});
    setLoadingStaffStats({});
    try {
      const staffRes = await api.get<PageResponse<Staff>>("/api/admin/staff/", { params: { page: 1, page_size: 100 } });
      setAllStaff(staffRes.data.items);
      try {
        const boundRes = await api.get<Staff[]>(`/api/admin/campaigns/${c.id}/staff`);
        setSelectedStaffIds(boundRes.data.map((s: Staff) => s.id));
      } catch {
        setSelectedStaffIds([]);
      }
    } catch { setAllStaff([]); setSelectedStaffIds([]); }
  };

  const handleSaveCampaign = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      const payload = { ...form, start_time: new Date(form.start_time).toISOString(), end_time: new Date(form.end_time).toISOString() };
      if (modal === "create") {
        await api.post("/api/admin/campaigns/", payload);
      } else if (selected) {
        await api.put(`/api/admin/campaigns/${selected.id}`, payload);
      }
      setModal(null);
      loadCampaigns();
    } catch (err: unknown) {
      const e = err as { response?: { data?: { detail?: string } } };
      alert(e.response?.data?.detail || "Failed");
    }
  };

  const toggleStatus = async (c: Campaign) => {
    const newStatus = c.status === "active" ? "paused" : "active";
    try {
      await api.put(`/api/admin/campaigns/${c.id}/status`, { status: newStatus });
      loadCampaigns();
    } catch { alert("操作失败"); }
  };

  const deleteCampaign = async (c: Campaign) => {
    if (!confirm("确认删除此活动？")) return;
    try {
      await api.delete(`/api/admin/campaigns/${c.id}`);
      loadCampaigns();
    } catch (err: unknown) {
      const e = err as { response?: { data?: { detail?: string } } };
      alert(e.response?.data?.detail || "Cannot delete");
    }
  };

  const resetWheelForm = () => {
    setWheelForm({
      name: "",
      display_name: "",
      type: "onsite",
      weight: 10,
      sort_order: 0,
      max_per_staff: 0,
      redirect_url: "",
      display_text: "",
      enabled: true,
    });
  };

  const handleSaveWheel = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selected) return;
    try {
      if (editingWheel) {
        await api.put(`/api/admin/wheel-items/${editingWheel.id}`, wheelForm);
      } else {
        await api.post("/api/admin/wheel-items/", { ...wheelForm, campaign_id: selected.id });
      }
      setEditingWheel(null);
      resetWheelForm();
      const res = await api.get<WheelItem[]>("/api/admin/wheel-items/", { params: { campaign_id: selected.id } });
      setWheelItems(res.data);
    } catch (err: unknown) {
      const e = err as { response?: { data?: { detail?: string } } };
      alert(e.response?.data?.detail || "Failed");
    }
  };

  const editWheel = (w: WheelItem) => {
    setEditingWheel(w);
    setWheelForm({
      name: w.name,
      display_name: w.display_name,
      type: w.type,
      weight: w.weight,
      sort_order: w.sort_order,
      max_per_staff: w.max_per_staff || 0,
      redirect_url: w.redirect_url || "",
      display_text: w.display_text || "",
      enabled: w.enabled,
    });
  };

  const deleteWheel = async (w: WheelItem) => {
    try {
      await api.delete(`/api/admin/wheel-items/${w.id}`);
      if (selected) {
        const res = await api.get<WheelItem[]>("/api/admin/wheel-items/", { params: { campaign_id: selected.id } });
        setWheelItems(res.data);
      }
    } catch { alert("删除失败"); }
  };

  const toggleWheel = async (w: WheelItem) => {
    try {
      await api.put(`/api/admin/wheel-items/${w.id}/toggle`);
      if (selected) {
        const res = await api.get<WheelItem[]>("/api/admin/wheel-items/", { params: { campaign_id: selected.id } });
        setWheelItems(res.data);
      }
    } catch { alert("操作失败"); }
  };

  const uploadImage = async (w: WheelItem) => {
    const input = document.createElement("input");
    input.type = "file";
    input.accept = "image/*";
    input.onchange = async (e) => {
      const file = (e.target as HTMLInputElement).files?.[0];
      if (!file) return;
      const formData = new FormData();
      formData.append("file", file);
      try {
        await api.post(`/api/admin/wheel-items/${w.id}/upload-image`, formData, {
          headers: { "Content-Type": "multipart/form-data" },
        });
        if (selected) {
          const res = await api.get<WheelItem[]>("/api/admin/wheel-items/", { params: { campaign_id: selected.id } });
          setWheelItems(res.data);
        }
      } catch { alert("上传失败"); }
    };
    input.click();
  };

  const toggleStaffSelect = (id: string) => {
    setSelectedStaffIds(prev => prev.includes(id) ? prev.filter(s => s !== id) : [...prev, id]);
  };

  const toggleStaffStats = async (staffId: string) => {
    const isExpanded = !!expandedStaffIds[staffId];
    setExpandedStaffIds(prev => ({ ...prev, [staffId]: !prev[staffId] }));

    if (isExpanded || !selected || staffPrizeStats[staffId]) {
      return;
    }

    setLoadingStaffStats(prev => ({ ...prev, [staffId]: true }));
    try {
      const res = await api.get<StaffPrizeStat[]>(`/api/admin/campaigns/${selected.id}/staff/${staffId}/prize-stats`);
      setStaffPrizeStats(prev => ({ ...prev, [staffId]: res.data }));
    } catch {
      setStaffPrizeStats(prev => ({ ...prev, [staffId]: [] }));
    } finally {
      setLoadingStaffStats(prev => ({ ...prev, [staffId]: false }));
    }
  };

  const saveStaffBinding = async () => {
    if (!selected) return;
    try {
      await api.post(`/api/admin/campaigns/${selected.id}/bind-staff`, { staff_ids: selectedStaffIds });
      alert("绑定成功");
      setModal(null);
    } catch { alert("绑定失败"); }
  };

  // Probability calc: each item's weight is treated as percentage, remainder = no prize
  const totalPct = wheelItems.filter(w => w.enabled).reduce((s, w) => s + w.weight, 0);
  const noPrizePct = Math.max(0, 100 - totalPct);

  const statusBadge = (s: string) => {
    const m: Record<string, [string, string]> = {
      draft: ["bg-gray-100 text-gray-600", "草稿"],
      active: ["bg-green-100 text-green-700", "进行中"],
      paused: ["bg-yellow-100 text-yellow-700", "暂停"],
      ended: ["bg-red-100 text-red-700", "已结束"],
    };
    const [cls, label] = m[s] || ["bg-gray-100", s];
    return <span className={`px-2 py-1 rounded-full text-xs font-bold ${cls}`}>{label}</span>;
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-extrabold font-[var(--font-headline)] tracking-tight">活动管理</h1>
          <p className="text-on-surface-variant mt-1">管理活动、转盘奖项和地推员绑定</p>
        </div>
        <button onClick={openCreate}
          className="bg-primary text-on-primary px-6 py-3 rounded-full font-bold text-sm flex items-center gap-2 shadow-lg shadow-primary/20 hover:shadow-xl active:scale-[0.98] transition-all">
          <Plus className="w-4 h-4" /> 新建活动
        </button>
      </div>

      <div className="grid gap-4">
        {loading ? <p className="text-center text-on-surface-variant py-8">加载中...</p> :
         campaigns.length === 0 ? <p className="text-center text-on-surface-variant py-8">暂无活动，点击右上角创建</p> :
         campaigns.map(c => (
          <div key={c.id} className="bg-surface-container-lowest rounded-xl p-6 shadow-sm">
            <div className="flex items-start justify-between">
              <div>
                <div className="flex items-center gap-3 mb-2">
                  <h3 className="font-bold text-lg">{c.name}</h3>
                  {statusBadge(c.status)}
                </div>
                <p className="text-on-surface-variant text-sm mb-2">{c.description || "无描述"}</p>
                <p className="text-xs text-outline">
                  {c.start_time ? new Date(c.start_time).toLocaleDateString() : "未设置"} ~ {c.end_time ? new Date(c.end_time).toLocaleDateString() : "未设置"}
                </p>
              </div>
              <div className="flex items-center gap-1">
                <button onClick={() => openWheel(c)} title="转盘配置"
                  className="p-2 rounded-lg text-primary hover:bg-primary/10 transition-colors">
                  <Settings2 className="w-5 h-5" />
                </button>
                <button onClick={() => openStaff(c)} title="地推员绑定"
                  className="p-2 rounded-lg text-secondary hover:bg-secondary/10 transition-colors">
                  <Users className="w-5 h-5" />
                </button>
                <button onClick={() => toggleStatus(c)} title={c.status === "active" ? "暂停" : "启动"}
                  className="p-2 rounded-lg text-green-600 hover:bg-green-50 transition-colors">
                  {c.status === "active" ? <Pause className="w-5 h-5" /> : <Play className="w-5 h-5" />}
                </button>
                <button onClick={() => openEdit(c)} className="p-2 rounded-lg text-outline hover:bg-surface-container-low transition-colors">
                  <Pencil className="w-5 h-5" />
                </button>
                {c.status === "draft" && (
                  <button onClick={() => deleteCampaign(c)} className="p-2 rounded-lg text-error hover:bg-error/10 transition-colors">
                    <Trash2 className="w-5 h-5" />
                  </button>
                )}
              </div>
            </div>
          </div>
        ))}
      </div>

      {/* Create/Edit Campaign Modal — no prize_url field */}
      {(modal === "create" || modal === "edit") && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-inverse-surface/40 backdrop-blur-sm overflow-auto py-8">
          <div className="bg-surface-container-lowest rounded-2xl p-8 w-full max-w-lg shadow-2xl">
            <h2 className="text-xl font-extrabold font-[var(--font-headline)] mb-6">
              {modal === "create" ? "新建活动" : "编辑活动"}
            </h2>
            <form onSubmit={handleSaveCampaign} className="space-y-4">
              <div>
                <label className="text-sm font-bold text-on-surface-variant block mb-1">活动名称</label>
                <input type="text" value={form.name} onChange={e => setForm({...form, name: e.target.value})}
                  className="w-full bg-surface-container-low border-none rounded-xl py-3 px-4 text-sm focus:ring-2 focus:ring-primary/40" required />
              </div>
              <div>
                <label className="text-sm font-bold text-on-surface-variant block mb-1">活动描述</label>
                <textarea value={form.description} onChange={e => setForm({...form, description: e.target.value})}
                  className="w-full bg-surface-container-low border-none rounded-xl py-3 px-4 text-sm focus:ring-2 focus:ring-primary/40 h-20" />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-sm font-bold text-on-surface-variant block mb-1">开始时间</label>
                  <input type="datetime-local" value={form.start_time} onChange={e => setForm({...form, start_time: e.target.value})}
                    className="w-full bg-surface-container-low border-none rounded-xl py-3 px-4 text-sm focus:ring-2 focus:ring-primary/40" required />
                </div>
                <div>
                  <label className="text-sm font-bold text-on-surface-variant block mb-1">结束时间</label>
                  <input type="datetime-local" value={form.end_time} onChange={e => setForm({...form, end_time: e.target.value})}
                    className="w-full bg-surface-container-low border-none rounded-xl py-3 px-4 text-sm focus:ring-2 focus:ring-primary/40" required />
                </div>
              </div>
              <div>
                <label className="text-sm font-bold text-on-surface-variant block mb-1">规则说明</label>
                <textarea value={form.rules_text} onChange={e => setForm({...form, rules_text: e.target.value})}
                  className="w-full bg-surface-container-low border-none rounded-xl py-3 px-4 text-sm focus:ring-2 focus:ring-primary/40 h-16" />
              </div>
              <div className="flex gap-3 pt-4">
                <button type="button" onClick={() => setModal(null)}
                  className="flex-1 py-3 rounded-full border border-outline-variant text-on-surface-variant font-bold text-sm">取消</button>
                <button type="submit"
                  className="flex-1 bg-primary text-on-primary py-3 rounded-full font-bold text-sm shadow-md shadow-primary/20">
                  {modal === "create" ? "创建" : "保存"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Wheel Items Modal — percentage based */}
      {modal === "wheel" && selected && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-inverse-surface/40 backdrop-blur-sm overflow-auto py-8">
          <div className="bg-surface-container-lowest rounded-2xl p-8 w-full max-w-2xl shadow-2xl max-h-[90vh] overflow-auto">
            <div className="flex items-center justify-between mb-6">
              <h2 className="text-xl font-extrabold font-[var(--font-headline)]">
                转盘配置 — {selected.name}
              </h2>
              <button onClick={() => setModal(null)} className="text-outline hover:text-on-surface text-2xl">&times;</button>
            </div>

            {/* Probability summary */}
            <div className="mb-4 p-4 bg-surface-container-low rounded-xl">
              <div className="flex items-center justify-between mb-2">
                <span className="text-sm font-bold text-on-surface-variant">概率分配</span>
                <span className={`text-sm font-bold ${totalPct > 100 ? "text-error" : "text-on-surface"}`}>
                  已分配 {totalPct}% / 100%
                </span>
              </div>
              <div className="h-3 w-full bg-surface-variant rounded-full overflow-hidden flex">
                {wheelItems.filter(w => w.enabled).map((w, i) => (
                  <div key={w.id} className="h-full" style={{
                    width: `${w.weight}%`,
                    backgroundColor: ["#0253cd", "#ffc69a", "#0048b5", "#8c4a00", "#789dff", "#ffb375"][i % 6],
                  }} />
                ))}
                {noPrizePct > 0 && (
                  <div className="h-full bg-gray-300" style={{ width: `${noPrizePct}%` }} />
                )}
              </div>
              <div className="flex items-center gap-4 mt-2 text-xs text-on-surface-variant flex-wrap">
                {wheelItems.filter(w => w.enabled).map((w, i) => (
                  <span key={w.id} className="flex items-center gap-1">
                    <span className="w-2 h-2 rounded-full" style={{
                      backgroundColor: ["#0253cd", "#ffc69a", "#0048b5", "#8c4a00", "#789dff", "#ffb375"][i % 6],
                    }} />
                    {w.display_name} {w.weight}%
                  </span>
                ))}
                {noPrizePct > 0 && (
                  <span className="flex items-center gap-1">
                    <span className="w-2 h-2 rounded-full bg-gray-300" />
                    未中奖 {noPrizePct}%
                  </span>
                )}
              </div>
              {totalPct > 100 && (
                <p className="text-error text-xs font-bold mt-2">总概率超过100%，请调整！</p>
              )}
            </div>

            {/* Existing items */}
            {wheelItems.length > 0 && (
              <div className="mb-6">
                <h3 className="text-sm font-bold text-on-surface-variant uppercase tracking-wider mb-3">当前奖项</h3>
                <div className="space-y-2">
                  {wheelItems.map(w => (
                    <div key={w.id} className={`flex items-center justify-between p-3 rounded-xl ${w.enabled ? "bg-surface-container-low" : "bg-surface-container-low/50 opacity-60"}`}>
                      <div className="flex items-center gap-3 flex-wrap">
                        {w.image_url ? (
                          <img src={resolveApiUrl(w.image_url)} alt="" className="w-10 h-10 rounded-lg object-cover" />
                        ) : (
                          <div className="w-10 h-10 rounded-lg bg-surface-variant flex items-center justify-center">
                            <Gift className="w-5 h-5 text-outline" />
                          </div>
                        )}
                        <span className={`px-2 py-0.5 rounded text-[10px] font-bold uppercase ${w.type === "website" ? "bg-primary/10 text-primary" : "bg-secondary-container text-on-secondary-container"}`}>
                          {w.type === "website" ? "跳转奖" : "现场奖"}
                        </span>
                        <span className="font-semibold text-sm">{w.display_name}</span>
                        <span className="text-xs text-outline font-bold">{w.weight}%</span>
                        <span className={`text-xs font-bold ${w.max_per_staff > 0 ? "text-secondary" : "text-outline"}`}>
                          每员工上限: {w.max_per_staff > 0 ? w.max_per_staff : "不限"}
                        </span>
                        {w.type === "website" && w.redirect_url && (
                          <span className="text-xs text-primary flex items-center gap-1"><ExternalLink className="w-3 h-3" />{w.redirect_url.slice(0, 30)}{w.redirect_url.length > 30 ? "..." : ""}</span>
                        )}
                      </div>
                      <div className="flex items-center gap-1">
                        <button onClick={() => uploadImage(w)} className="p-1.5 rounded-lg text-outline hover:bg-surface-container" title="上传图片">
                          <Upload className="w-4 h-4" />
                        </button>
                        <button onClick={() => toggleWheel(w)} className={`p-1.5 rounded-lg ${w.enabled ? "text-green-600 hover:bg-green-50" : "text-outline hover:bg-surface-container"}`}>
                          <Eye className="w-4 h-4" />
                        </button>
                        <button onClick={() => editWheel(w)} className="p-1.5 rounded-lg text-primary hover:bg-primary/10">
                          <Pencil className="w-4 h-4" />
                        </button>
                        <button onClick={() => deleteWheel(w)} className="p-1.5 rounded-lg text-error hover:bg-error/10">
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Add/Edit form */}
            <div className="border-t border-outline-variant/20 pt-6">
              <h3 className="text-sm font-bold text-on-surface-variant uppercase tracking-wider mb-3">
                {editingWheel ? "编辑奖项" : "添加奖项"}
              </h3>
              <form onSubmit={handleSaveWheel} className="space-y-3">
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="text-xs font-bold text-outline block mb-1">奖项名称(内部)</label>
                    <input type="text" value={wheelForm.name} onChange={e => setWheelForm({...wheelForm, name: e.target.value})}
                      placeholder="如: iphone15" className="w-full bg-surface-container-low border-none rounded-xl py-2.5 px-3 text-sm focus:ring-2 focus:ring-primary/40" required />
                  </div>
                  <div>
                    <label className="text-xs font-bold text-outline block mb-1">显示名称(用户看到)</label>
                    <input type="text" value={wheelForm.display_name} onChange={e => setWheelForm({...wheelForm, display_name: e.target.value})}
                      placeholder="如: iPhone 15" className="w-full bg-surface-container-low border-none rounded-xl py-2.5 px-3 text-sm focus:ring-2 focus:ring-primary/40" required />
                  </div>
                </div>
                <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                  <div>
                    <label className="text-xs font-bold text-outline block mb-1">类型</label>
                    <select value={wheelForm.type} onChange={e => setWheelForm({...wheelForm, type: e.target.value as "onsite" | "website"})}
                      className="w-full bg-surface-container-low border-none rounded-xl py-2.5 px-3 text-sm focus:ring-2 focus:ring-primary/40">
                      <option value="onsite">现场奖</option>
                      <option value="website">跳转网页奖</option>
                    </select>
                  </div>
                  <div>
                    <label className="text-xs font-bold text-outline block mb-1">中奖概率(%)</label>
                    <input type="number" min={1} max={100} value={wheelForm.weight} onChange={e => setWheelForm({...wheelForm, weight: parseInt(e.target.value) || 1})}
                      className="w-full bg-surface-container-low border-none rounded-xl py-2.5 px-3 text-sm focus:ring-2 focus:ring-primary/40" />
                  </div>
                  <div>
                    <label className="text-xs font-bold text-outline block mb-1">排序</label>
                    <input type="number" value={wheelForm.sort_order} onChange={e => setWheelForm({...wheelForm, sort_order: parseInt(e.target.value) || 0})}
                      className="w-full bg-surface-container-low border-none rounded-xl py-2.5 px-3 text-sm focus:ring-2 focus:ring-primary/40" />
                  </div>
                  <div>
                    <label className="text-xs font-bold text-outline block mb-1">最大数量/员工</label>
                    <input
                      type="number"
                      min={0}
                      value={wheelForm.max_per_staff}
                      onChange={e => setWheelForm({ ...wheelForm, max_per_staff: Math.max(0, parseInt(e.target.value) || 0) })}
                      className="w-full bg-surface-container-low border-none rounded-xl py-2.5 px-3 text-sm focus:ring-2 focus:ring-primary/40"
                    />
                  </div>
                </div>
                {wheelForm.type === "website" && (
                  <div>
                    <label className="text-xs font-bold text-outline block mb-1">跳转网址</label>
                    <input type="url" value={wheelForm.redirect_url} onChange={e => setWheelForm({...wheelForm, redirect_url: e.target.value})}
                      placeholder="https://example.com/prize" className="w-full bg-surface-container-low border-none rounded-xl py-2.5 px-3 text-sm focus:ring-2 focus:ring-primary/40" />
                  </div>
                )}
                <div>
                  <label className="text-xs font-bold text-outline block mb-1">中奖提示文案</label>
                  <input type="text" value={wheelForm.display_text} onChange={e => setWheelForm({...wheelForm, display_text: e.target.value})}
                    placeholder="Congratulations!" className="w-full bg-surface-container-low border-none rounded-xl py-2.5 px-3 text-sm focus:ring-2 focus:ring-primary/40" />
                </div>
                <div className="flex gap-3 pt-2">
                  {editingWheel && (
                    <button type="button" onClick={() => { setEditingWheel(null); resetWheelForm(); }}
                      className="px-4 py-2 rounded-full border border-outline-variant text-on-surface-variant font-bold text-sm">取消编辑</button>
                  )}
                  <button type="submit"
                    className="px-6 py-2 bg-primary text-on-primary rounded-full font-bold text-sm shadow-md shadow-primary/20">
                    {editingWheel ? "保存修改" : "添加奖项"}
                  </button>
                </div>
              </form>
            </div>
          </div>
        </div>
      )}

      {/* Staff Binding Modal */}
      {modal === "staff" && selected && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-inverse-surface/40 backdrop-blur-sm overflow-auto py-8">
          <div className="bg-surface-container-lowest rounded-2xl p-8 w-full max-w-lg shadow-2xl max-h-[90vh] overflow-auto">
            <div className="flex items-center justify-between mb-6">
              <h2 className="text-xl font-extrabold font-[var(--font-headline)]">
                绑定地推员 — {selected.name}
              </h2>
              <button onClick={() => setModal(null)} className="text-outline hover:text-on-surface text-2xl">&times;</button>
            </div>

            {/* Already bound staff */}
            {selectedStaffIds.length > 0 && (
              <div className="mb-5">
                <h3 className="text-sm font-bold text-on-surface-variant uppercase tracking-wider mb-2">已绑定 ({selectedStaffIds.length}人)</h3>
                <div className="space-y-2">
                  {allStaff.filter(s => selectedStaffIds.includes(s.id)).map(s => (
                    <div key={s.id} className="rounded-xl bg-primary/10 p-3">
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2">
                          <button
                            type="button"
                            onClick={() => toggleStaffStats(s.id)}
                            className="p-1 rounded-md text-outline hover:bg-surface-container-low transition-colors"
                            title={expandedStaffIds[s.id] ? "收起奖项统计" : "展开奖项统计"}
                          >
                            {expandedStaffIds[s.id] ? <ChevronDown className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />}
                          </button>
                          <div>
                            <p className="font-semibold text-sm">{s.name} <span className="text-xs text-outline ml-1">{s.staff_no}</span></p>
                            <p className="text-xs text-on-surface-variant">{s.phone}</p>
                          </div>
                        </div>
                        <button onClick={() => toggleStaffSelect(s.id)}
                          className="p-1.5 rounded-lg text-error hover:bg-error/10 transition-colors" title="移除">
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>

                      {expandedStaffIds[s.id] && (
                        <div className="mt-3 rounded-lg border border-outline-variant/30 bg-surface-container-low p-3">
                          <div className="grid grid-cols-4 text-[11px] font-bold text-outline uppercase tracking-wider">
                            <span>奖项</span>
                            <span className="text-center">最大</span>
                            <span className="text-center">已领</span>
                            <span className="text-right">剩余</span>
                          </div>
                          <div className="mt-2 space-y-1.5">
                            {loadingStaffStats[s.id] && (
                              <p className="text-xs text-on-surface-variant py-2">加载中...</p>
                            )}
                            {!loadingStaffStats[s.id] && (staffPrizeStats[s.id] || []).map(stat => {
                              const limited = stat.max_per_staff > 0;
                              const remaining = limited ? Math.max(0, stat.max_per_staff - stat.claimed_count) : null;
                              const exhausted = limited && stat.claimed_count >= stat.max_per_staff;
                              return (
                                <div key={stat.wheel_item_id} className="grid grid-cols-4 items-center text-xs">
                                  <div className="truncate pr-2">
                                    {stat.display_name}
                                    <span className="ml-1 text-outline">({stat.type === "website" ? "跳转" : "现场"})</span>
                                  </div>
                                  <span className="text-center font-semibold">{limited ? stat.max_per_staff : "∞"}</span>
                                  <span className="text-center">{stat.claimed_count}</span>
                                  <span className={`text-right font-bold ${exhausted ? "text-error" : "text-green-700"}`}>
                                    {limited ? remaining : "不限"}
                                  </span>
                                </div>
                              );
                            })}
                            {!loadingStaffStats[s.id] && (staffPrizeStats[s.id] || []).length === 0 && (
                              <p className="text-xs text-on-surface-variant py-2">暂无奖项统计</p>
                            )}
                          </div>
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Unbound staff to add */}
            {allStaff.filter(s => !selectedStaffIds.includes(s.id)).length > 0 && (
              <div className="mb-4">
                <h3 className="text-sm font-bold text-on-surface-variant uppercase tracking-wider mb-2">可添加</h3>
                <div className="space-y-2 max-h-52 overflow-auto">
                  {allStaff.filter(s => !selectedStaffIds.includes(s.id)).map(s => (
                    <label key={s.id} className="flex items-center gap-3 p-3 rounded-xl cursor-pointer bg-surface-container-low hover:bg-surface-container transition-colors">
                      <input type="checkbox" checked={false} onChange={() => toggleStaffSelect(s.id)}
                        className="w-4 h-4 rounded border-outline text-primary focus:ring-primary/20" />
                      <div>
                        <p className="font-semibold text-sm">{s.name} <span className="text-xs text-outline ml-1">{s.staff_no}</span></p>
                        <p className="text-xs text-on-surface-variant">{s.phone}</p>
                      </div>
                    </label>
                  ))}
                </div>
              </div>
            )}

            {allStaff.length === 0 && <p className="text-center text-on-surface-variant py-4">暂无地推员</p>}

            <div className="flex gap-3 pt-4">
              <button onClick={() => setModal(null)}
                className="flex-1 py-3 rounded-full border border-outline-variant text-on-surface-variant font-bold text-sm">取消</button>
              <button onClick={saveStaffBinding}
                className="flex-1 bg-primary text-on-primary py-3 rounded-full font-bold text-sm shadow-md shadow-primary/20">
                确认保存
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
