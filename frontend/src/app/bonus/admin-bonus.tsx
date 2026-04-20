"use client";

import { useCallback, useEffect, useMemo, useState, type FormEvent } from "react";
import api from "@/lib/api";
import type {
  BonusClaimRecord,
  BonusRecordPage,
  BonusRule,
  BonusRuleForm,
  BonusRuleListResponse,
  BonusSettlement,
  BonusSettlementPage,
  StaffOption,
} from "./bonus-types";
import { buildStaffMap, getErrorDetail, sortedTiers } from "./bonus-utils";
import AdminRecordsTab, { type AdminRecordFilters } from "./admin-records-tab";
import AdminRuleModal from "./admin-rule-modal";
import AdminRulesTab from "./admin-rules-tab";

type ActiveTab = "rules" | "records";
type ModalState = { mode: "global" | "staff" } | null;

const pageSize = 20;
const emptyFilters: AdminRecordFilters = { status: "", date_from: "", date_to: "", staff_id: "" };
const emptyForm: BonusRuleForm = { staff_id: "", tiers: [{ threshold: 10, amount: 50 }], enabled: true };

function createRuleForm(rule: BonusRule | null): BonusRuleForm {
  if (!rule) return emptyForm;
  return { staff_id: rule.staff_id || "", tiers: rule.tiers.length > 0 ? sortedTiers(rule.tiers) : emptyForm.tiers, enabled: rule.enabled };
}

function buildParams(filters: AdminRecordFilters, page: number) {
  const params: Record<string, string | number> = { page, page_size: pageSize };
  if (filters.status) params.status = filters.status;
  if (filters.date_from) params.date_from = filters.date_from;
  if (filters.date_to) params.date_to = filters.date_to;
  if (filters.staff_id) params.staff_id = filters.staff_id;
  return params;
}

function validateForm(form: BonusRuleForm, modal: ModalState) {
  if (modal?.mode === "staff" && !form.staff_id) return "请选择地推员";
  if (form.tiers.length === 0) return "至少需要一个奖励阶梯";
  if (form.tiers.some((tier) => tier.threshold < 1)) return "门槛必须大于 0";
  if (form.tiers.some((tier) => tier.amount < 0)) return "奖励金额不能为负数";
  return "";
}

export default function AdminBonusPage() {
  const [activeTab, setActiveTab] = useState<ActiveTab>("rules");
  const [rules, setRules] = useState<BonusRule[]>([]);
  const [globalRule, setGlobalRule] = useState<BonusRule | null>(null);
  const [staff, setStaff] = useState<StaffOption[]>([]);
  const [records, setRecords] = useState<BonusClaimRecord[]>([]);
  const [settlements, setSettlements] = useState<BonusSettlement[]>([]);
  const [recordsTotal, setRecordsTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [filters, setFilters] = useState<AdminRecordFilters>(emptyFilters);
  const [loadingRules, setLoadingRules] = useState(true);
  const [loadingRecords, setLoadingRecords] = useState(true);
  const [modal, setModal] = useState<ModalState>(null);
  const [form, setForm] = useState<BonusRuleForm>(emptyForm);
  const [submitting, setSubmitting] = useState(false);
  const [updatingId, setUpdatingId] = useState("");

  const staffMap = useMemo(() => buildStaffMap(staff), [staff]);
  const overrides = useMemo(() => rules.filter((rule) => rule.staff_id !== null), [rules]);
  const totalPages = Math.max(1, Math.ceil(recordsTotal / pageSize));

  const loadRules = useCallback(async () => {
    setLoadingRules(true);
    try {
      const res = await api.get<BonusRuleListResponse>("/api/admin/bonus/rules");
      setRules(res.data.items || []);
      setGlobalRule(res.data.global_default || null);
    } catch {
      setRules([]);
      setGlobalRule(null);
    } finally {
      setLoadingRules(false);
    }
  }, []);

  const loadStaff = useCallback(async () => {
    try {
      const res = await api.get<{ items: StaffOption[] }>("/api/admin/staff/", { params: { page: 1, page_size: 100 } });
      setStaff(res.data.items || []);
    } catch {
      setStaff([]);
    }
  }, []);

  const loadRecords = useCallback(async () => {
    setLoadingRecords(true);
    try {
      const params = buildParams(filters, page);
      const [recordsRes, settlementsRes] = await Promise.all([
        api.get<BonusRecordPage>("/api/admin/bonus/records", { params }),
        api.get<BonusSettlementPage>("/api/admin/bonus/settlements", { params }),
      ]);
      setRecords(recordsRes.data.items || []);
      setRecordsTotal(recordsRes.data.total || 0);
      setSettlements(settlementsRes.data.items || []);
    } catch {
      setRecords([]);
      setRecordsTotal(0);
      setSettlements([]);
    } finally {
      setLoadingRecords(false);
    }
  }, [filters, page]);

  useEffect(() => { loadRules(); loadStaff(); }, [loadRules, loadStaff]);
  useEffect(() => { loadRecords(); }, [loadRecords]);

  const openAdd = () => { setForm(emptyForm); setModal({ mode: "staff" }); };
  const openEditGlobal = () => {
    setForm(createRuleForm(globalRule));
    setModal({ mode: "global" });
  };
  const openEdit = (rule: BonusRule) => {
    setForm(createRuleForm(rule));
    setModal({ mode: rule.staff_id === null ? "global" : "staff" });
  };

  const saveRule = async (event: FormEvent) => {
    event.preventDefault();
    const error = validateForm(form, modal);
    if (error) { alert(error); return; }
    setSubmitting(true);
    try {
      await api.post("/api/admin/bonus/rules", {
        staff_id: modal?.mode === "global" ? null : form.staff_id,
        tiers: sortedTiers(form.tiers),
        enabled: form.enabled,
      });
      setModal(null);
      await loadRules();
    } catch (errorResponse) {
      alert(getErrorDetail(errorResponse) || "保存失败");
    } finally {
      setSubmitting(false);
    }
  };

  const toggleRule = async (rule: BonusRule) => {
    setUpdatingId(rule.id);
    try {
      await api.post("/api/admin/bonus/rules", { staff_id: rule.staff_id, tiers: sortedTiers(rule.tiers), enabled: !rule.enabled });
      await loadRules();
    } catch {
      alert("更新失败");
    } finally {
      setUpdatingId("");
    }
  };

  const deleteRule = async (rule: BonusRule) => {
    if (!window.confirm(`确认删除「${rule.staff_name || rule.staff_id}」的专属规则？`)) return;
    try {
      await api.delete(`/api/admin/bonus/rules/${rule.id}`);
      await loadRules();
    } catch (errorResponse) {
      alert(getErrorDetail(errorResponse) || "删除失败");
    }
  };

  const updateFilters = (next: AdminRecordFilters) => {
    setFilters(next);
    setPage(1);
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-[var(--font-headline)] text-3xl font-extrabold tracking-tight">冲单奖励</h1>
        <p className="mt-1 text-on-surface-variant">管理每日冲单奖励规则，查看领取记录与结算统计。</p>
      </div>

      <section className="inline-flex gap-2 rounded-xl bg-surface-container-lowest p-2 shadow-sm">
        <button onClick={() => setActiveTab("rules")} className={`rounded-full px-4 py-2 text-sm font-bold ${activeTab === "rules" ? "bg-primary text-on-primary" : "text-on-surface-variant"}`}>奖励规则</button>
        <button onClick={() => setActiveTab("records")} className={`rounded-full px-4 py-2 text-sm font-bold ${activeTab === "records" ? "bg-primary text-on-primary" : "text-on-surface-variant"}`}>领取记录</button>
      </section>

      {activeTab === "rules" && (
        <AdminRulesTab
          globalRule={globalRule}
          overrides={overrides}
          staffMap={staffMap}
          loading={loadingRules}
          updatingId={updatingId}
          onAdd={openAdd}
          onEditGlobal={openEditGlobal}
          onEdit={openEdit}
          onToggle={toggleRule}
          onDelete={deleteRule}
        />
      )}

      {activeTab === "records" && (
        <AdminRecordsTab
          filters={filters}
          staff={staff}
          staffMap={staffMap}
          records={records}
          settlements={settlements}
          loading={loadingRecords}
          page={page}
          totalPages={totalPages}
          onFiltersChange={updateFilters}
          onResetFilters={() => updateFilters(emptyFilters)}
          onPrev={() => setPage((current) => Math.max(1, current - 1))}
          onNext={() => setPage((current) => Math.min(totalPages, current + 1))}
        />
      )}

      {modal && <AdminRuleModal mode={modal.mode} form={form} staff={staff} submitting={submitting} onChange={setForm} onClose={() => setModal(null)} onSubmit={saveRule} />}
    </div>
  );
}
