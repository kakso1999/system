"use client";

import { useCallback, useEffect, useState } from "react";
import api from "@/lib/api";
import type { PageResponse } from "@/types";
import CombinedSettleTab from "./combined-settle-tab";
import CommissionRecordsSection from "./commission-records-section";
import type { AdminCommissionRecord, FinanceOverview, StaffPerformance, TabKey } from "./finance-types";
import { toPoints } from "./finance-types";
import ManualSettleModal from "./manual-settle-modal";
import OverviewCards from "./overview-cards";
import RejectModal from "./reject-modal";
import StaffPerformanceSection from "./staff-performance-section";
import WithdrawalManagementTab from "./withdrawal-management-tab";

type FinanceOverviewWithSettlement = FinanceOverview & {
  settlement_pending: number;
  settlement_paid: number;
};

const emptyOverview: FinanceOverviewWithSettlement = {
  total_commission: 0,
  pending: 0,
  approved: 0,
  paid: 0,
  frozen: 0,
  settlement_pending: 0,
  settlement_paid: 0,
};

const settlementCards = [
  { label: "待结算（按订单）", subtext: "基于订单状态", key: "settlement_pending", tone: "text-blue-700" },
  { label: "已结算（按订单）", subtext: "基于订单状态", key: "settlement_paid", tone: "text-green-700" },
] satisfies {
  label: string;
  subtext: string;
  key: keyof Pick<FinanceOverviewWithSettlement, "settlement_pending" | "settlement_paid">;
  tone: string;
}[];

export default function FinancePage() {
  const [activeTab, setActiveTab] = useState<TabKey>("staff");
  const [overview, setOverview] = useState<FinanceOverviewWithSettlement>(emptyOverview);
  const [staffList, setStaffList] = useState<StaffPerformance[]>([]);
  const [staffPage, setStaffPage] = useState(1);
  const [staffTotal, setStaffTotal] = useState(0);
  const [loadingStaff, setLoadingStaff] = useState(true);
  const [commissionList, setCommissionList] = useState<AdminCommissionRecord[]>([]);
  const [commissionPage, setCommissionPage] = useState(1);
  const [commissionTotal, setCommissionTotal] = useState(0);
  const [commissionStatus, setCommissionStatus] = useState("");
  const [loadingCommissions, setLoadingCommissions] = useState(true);
  const [settleModal, setSettleModal] = useState<{ staff: StaffPerformance } | null>(null);
  const [settleAmount, setSettleAmount] = useState("");
  const [settleRemark, setSettleRemark] = useState("");
  const [settling, setSettling] = useState(false);
  const [rejectModal, setRejectModal] = useState<AdminCommissionRecord | null>(null);
  const [rejectReason, setRejectReason] = useState("");
  const [submittingReject, setSubmittingReject] = useState(false);
  const [updatingRecordId, setUpdatingRecordId] = useState("");

  const loadOverview = useCallback(async () => {
    try {
      const res = await api.get<FinanceOverview>("/api/admin/finance/overview");
      const data = res.data as FinanceOverview & {
        total_pending?: number;
        total_approved?: number;
        total_paid?: number;
        total_frozen?: number;
        settlement_pending?: number;
        settlement_paid?: number;
      };
      setOverview({
        total_commission: Number(data.total_commission || 0),
        pending: Number(data.pending ?? data.total_pending ?? 0),
        approved: Number(data.approved ?? data.total_approved ?? 0),
        paid: Number(data.paid ?? data.total_paid ?? 0),
        frozen: Number(data.frozen ?? data.total_frozen ?? 0),
        settlement_pending: Number(data.settlement_pending ?? 0),
        settlement_paid: Number(data.settlement_paid ?? 0),
      });
    } catch {
      setOverview(emptyOverview);
    }
  }, []);

  const loadStaffPerformance = useCallback(async () => {
    setLoadingStaff(true);
    try {
      const res = await api.get<PageResponse<StaffPerformance>>("/api/admin/finance/staff-performance", {
        params: { page: staffPage, page_size: 20 },
      });
      setStaffList(res.data.items || []);
      setStaffTotal(res.data.total || 0);
    } catch {
      setStaffList([]);
      setStaffTotal(0);
    } finally {
      setLoadingStaff(false);
    }
  }, [staffPage]);

  const loadCommissions = useCallback(async () => {
    setLoadingCommissions(true);
    try {
      const params: Record<string, string | number> = { page: commissionPage, page_size: 20 };
      if (commissionStatus) params.status = commissionStatus;
      const res = await api.get<PageResponse<AdminCommissionRecord>>("/api/admin/finance/commissions", { params });
      setCommissionList(res.data.items || []);
      setCommissionTotal(res.data.total || 0);
    } catch {
      setCommissionList([]);
      setCommissionTotal(0);
    } finally {
      setLoadingCommissions(false);
    }
  }, [commissionPage, commissionStatus]);

  useEffect(() => { loadOverview(); }, [loadOverview]);
  useEffect(() => { loadStaffPerformance(); }, [loadStaffPerformance]);
  useEffect(() => { loadCommissions(); }, [loadCommissions]);

  const handleSettle = async () => {
    if (!settleModal || !settleAmount) return;
    setSettling(true);
    try {
      await api.post("/api/admin/finance/manual-settle", {
        staff_id: settleModal.staff.id,
        amount: Number(settleAmount),
        remark: settleRemark,
      });
      setSettleModal(null);
      setSettleAmount("");
      setSettleRemark("");
      loadStaffPerformance();
      loadOverview();
    } catch (error: unknown) {
      const axiosErr = error as { response?: { data?: { detail?: string } } };
      alert(axiosErr.response?.data?.detail || "结算失败");
    } finally {
      setSettling(false);
    }
  };

  const approveCommission = async (record: AdminCommissionRecord) => {
    setUpdatingRecordId(record.id);
    try {
      await api.put(`/api/admin/finance/commission/${record.id}/approve`);
      loadCommissions();
      loadOverview();
    } catch {
      alert("审核失败");
    } finally {
      setUpdatingRecordId("");
    }
  };

  const submitReject = async () => {
    if (!rejectModal || !rejectReason.trim()) return;
    setSubmittingReject(true);
    try {
      await api.put(`/api/admin/finance/commission/${rejectModal.id}/reject`, { reason: rejectReason.trim() });
      setRejectModal(null);
      setRejectReason("");
      loadCommissions();
      loadOverview();
    } catch {
      alert("驳回失败");
    } finally {
      setSubmittingReject(false);
    }
  };

  const staffTotalPages = Math.max(1, Math.ceil(staffTotal / 20));
  const commissionTotalPages = Math.max(1, Math.ceil(commissionTotal / 20));

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-extrabold font-[var(--font-headline)] tracking-tight">财务结算</h1>
        <p className="text-on-surface-variant mt-1">查看佣金概览、地推员业绩和佣金记录</p>
      </div>

      <OverviewCards overview={overview} />

      <section className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {settlementCards.map((item) => (
          <article key={item.key} className="bg-surface-container-lowest rounded-xl shadow-sm p-6">
            <p className="text-xs font-bold uppercase tracking-wider text-on-surface-variant">{item.label}</p>
            <p className={`text-2xl font-extrabold font-[var(--font-headline)] mt-2 ${item.tone}`}>
              {toPoints(overview[item.key] ?? 0)}
            </p>
            <p className="mt-1 text-xs text-on-surface-variant">{item.subtext}</p>
          </article>
        ))}
      </section>

      <section className="bg-surface-container-lowest rounded-xl p-2 shadow-sm inline-flex gap-2">
        <button
          onClick={() => setActiveTab("staff")}
          className={`rounded-full px-4 py-2 text-sm font-bold ${activeTab === "staff" ? "bg-primary text-on-primary" : "text-on-surface-variant"}`}
        >
          地推员业绩
        </button>
        <button
          onClick={() => setActiveTab("commissions")}
          className={`rounded-full px-4 py-2 text-sm font-bold ${activeTab === "commissions" ? "bg-primary text-on-primary" : "text-on-surface-variant"}`}
        >
          佣金记录
        </button>
        <button
          onClick={() => setActiveTab("combined")}
          className={`rounded-full px-4 py-2 text-sm font-bold ${activeTab === "combined" ? "bg-primary text-on-primary" : "text-on-surface-variant"}`}
        >
          合并结算
        </button>
        <button
          onClick={() => setActiveTab("withdrawals")}
          className={`rounded-full px-4 py-2 text-sm font-bold ${activeTab === "withdrawals" ? "bg-primary text-on-primary" : "text-on-surface-variant"}`}
        >
          提现管理
        </button>
      </section>

      {activeTab === "staff" && (
        <StaffPerformanceSection
          loading={loadingStaff}
          staffList={staffList}
          page={staffPage}
          totalPages={staffTotalPages}
          onPrev={() => setStaffPage((prev) => Math.max(1, prev - 1))}
          onNext={() => setStaffPage((prev) => Math.min(staffTotalPages, prev + 1))}
          onSettle={(staff) => setSettleModal({ staff })}
        />
      )}

      {activeTab === "commissions" && (
        <CommissionRecordsSection
          loading={loadingCommissions}
          records={commissionList}
          status={commissionStatus}
          page={commissionPage}
          totalPages={commissionTotalPages}
          updatingRecordId={updatingRecordId}
          onStatusChange={(status) => { setCommissionStatus(status); setCommissionPage(1); }}
          onPrev={() => setCommissionPage((prev) => Math.max(1, prev - 1))}
          onNext={() => setCommissionPage((prev) => Math.min(commissionTotalPages, prev + 1))}
          onApprove={approveCommission}
          onReject={(record) => { setRejectModal(record); setRejectReason(""); }}
        />
      )}

      {activeTab === "combined" && (
        <CombinedSettleTab />
      )}

      {activeTab === "withdrawals" && (
        <WithdrawalManagementTab />
      )}

      {settleModal && (
        <ManualSettleModal
          staffName={settleModal.staff.name}
          staffNo={settleModal.staff.staff_no}
          amount={settleAmount}
          remark={settleRemark}
          settling={settling}
          onAmountChange={setSettleAmount}
          onRemarkChange={setSettleRemark}
          onCancel={() => setSettleModal(null)}
          onConfirm={handleSettle}
        />
      )}

      {rejectModal && (
        <RejectModal
          title={rejectModal.staff_name || rejectModal.source_staff_name || rejectModal.commission_no}
          reason={rejectReason}
          submitting={submittingReject}
          onReasonChange={setRejectReason}
          onCancel={() => { setRejectModal(null); setRejectReason(""); }}
          onConfirm={submitReject}
        />
      )}
    </div>
  );
}
