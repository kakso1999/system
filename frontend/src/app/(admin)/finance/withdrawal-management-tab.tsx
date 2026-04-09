import { useCallback, useEffect, useState } from "react";
import api from "@/lib/api";
import type { PageResponse } from "@/types";
import CompleteWithdrawalModal from "./complete-withdrawal-modal";
import type { AdminWithdrawalRecord } from "./finance-types";
import RejectModal from "./reject-modal";
import WithdrawalRecordsSection from "./withdrawal-records-section";

export default function WithdrawalManagementTab() {
  const [records, setRecords] = useState<AdminWithdrawalRecord[]>([]);
  const [page, setPage] = useState(1);
  const [total, setTotal] = useState(0);
  const [status, setStatus] = useState("");
  const [loading, setLoading] = useState(true);
  const [updatingRecordId, setUpdatingRecordId] = useState("");
  const [rejectModal, setRejectModal] = useState<AdminWithdrawalRecord | null>(null);
  const [rejectReason, setRejectReason] = useState("");
  const [submittingReject, setSubmittingReject] = useState(false);
  const [completeModal, setCompleteModal] = useState<AdminWithdrawalRecord | null>(null);
  const [transactionNo, setTransactionNo] = useState("");
  const [remark, setRemark] = useState("");
  const [submittingComplete, setSubmittingComplete] = useState(false);

  const loadWithdrawals = useCallback(async () => {
    setLoading(true);
    try {
      const params: Record<string, string | number> = { page, page_size: 20 };
      if (status) params.status = status;
      const res = await api.get<PageResponse<AdminWithdrawalRecord>>("/api/admin/finance/withdrawal-requests", { params });
      setRecords(res.data.items || []);
      setTotal(res.data.total || 0);
    } catch {
      setRecords([]);
      setTotal(0);
    } finally {
      setLoading(false);
    }
  }, [page, status]);

  useEffect(() => {
    loadWithdrawals();
  }, [loadWithdrawals]);

  const approveWithdrawal = async (record: AdminWithdrawalRecord) => {
    setUpdatingRecordId(record.id);
    try {
      await api.put(`/api/admin/finance/withdrawal-requests/${record.id}/approve`);
      loadWithdrawals();
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
      await api.put(`/api/admin/finance/withdrawal-requests/${rejectModal.id}/reject`, {
        reason: rejectReason.trim(),
      });
      setRejectModal(null);
      setRejectReason("");
      loadWithdrawals();
    } catch {
      alert("驳回失败");
    } finally {
      setSubmittingReject(false);
    }
  };

  const submitComplete = async () => {
    if (!completeModal || !transactionNo.trim()) return;
    setSubmittingComplete(true);
    try {
      await api.put(`/api/admin/finance/withdrawal-requests/${completeModal.id}/complete`, {
        transaction_no: transactionNo.trim(),
        remark: remark.trim(),
      });
      setCompleteModal(null);
      setTransactionNo("");
      setRemark("");
      loadWithdrawals();
    } catch {
      alert("提交失败");
    } finally {
      setSubmittingComplete(false);
    }
  };

  const totalPages = Math.max(1, Math.ceil(total / 20));

  return (
    <>
      <WithdrawalRecordsSection
        loading={loading}
        records={records}
        status={status}
        page={page}
        totalPages={totalPages}
        updatingRecordId={updatingRecordId}
        onStatusChange={(nextStatus) => { setStatus(nextStatus); setPage(1); }}
        onPrev={() => setPage((prev) => Math.max(1, prev - 1))}
        onNext={() => setPage((prev) => Math.min(totalPages, prev + 1))}
        onApprove={approveWithdrawal}
        onReject={(record) => { setRejectModal(record); setRejectReason(""); }}
        onComplete={(record) => {
          setCompleteModal(record);
          setTransactionNo("");
          setRemark("");
        }}
      />

      {rejectModal && (
        <RejectModal
          heading="驳回提现"
          title={rejectModal.staff_name || rejectModal.withdrawal_no}
          reason={rejectReason}
          submitting={submittingReject}
          placeholder="请输入驳回原因"
          confirmLabel="确认驳回"
          onReasonChange={setRejectReason}
          onCancel={() => { setRejectModal(null); setRejectReason(""); }}
          onConfirm={submitReject}
        />
      )}

      {completeModal && (
        <CompleteWithdrawalModal
          title={`${completeModal.staff_name || "-"} · ${completeModal.withdrawal_no}`}
          transactionNo={transactionNo}
          remark={remark}
          submitting={submittingComplete}
          onTransactionNoChange={setTransactionNo}
          onRemarkChange={setRemark}
          onCancel={() => {
            setCompleteModal(null);
            setTransactionNo("");
            setRemark("");
          }}
          onConfirm={submitComplete}
        />
      )}
    </>
  );
}
