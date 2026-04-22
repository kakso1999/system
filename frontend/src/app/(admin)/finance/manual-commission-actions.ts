"use client";

import { useState } from "react";
import {
  adjustManualCommission,
  cancelManualCommission,
  createManualCommission,
} from "./manual-commission-api";
import { useBeneficiarySearch } from "./manual-commission-hooks";
import {
  emptyForm,
  getErrorDetail,
  staffLabel,
  type AdjustModalState,
  type CancelModalState,
  type ManualCommissionFormValues,
  type ManualCommissionRecord,
  type StaffLite,
} from "./manual-commission-shared";

type RefreshFn = () => Promise<void>;

export function useManualCommissionCreate(refreshRecords: RefreshFn) {
  const [form, setForm] = useState(emptyForm);
  const [beneficiary, setBeneficiary] = useState<StaffLite | null>(null);
  const [beneficiaryQuery, setBeneficiaryQuery] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const { staffOptions, loadingOptions } = useBeneficiarySearch(beneficiary, beneficiaryQuery);
  const setField = (field: keyof ManualCommissionFormValues, value: string) => setForm((current) => ({ ...current, [field]: value }));
  const selectBeneficiary = (staff: StaffLite) => { setBeneficiary(staff); setBeneficiaryQuery(staffLabel(staff)); };
  const submitCreate = async () => {
    if (!beneficiary || !form.amount || !form.remark.trim()) return alert("请选择收益地推员并填写金额、备注");
    setSubmitting(true);
    try {
      await createManualCommission(beneficiary, form);
      setForm(emptyForm);
      setBeneficiary(null);
      setBeneficiaryQuery("");
      await refreshRecords();
      alert("手动佣金已创建");
    } catch (error) {
      alert(getErrorDetail(error));
    } finally {
      setSubmitting(false);
    }
  };
  return { form, beneficiaryQuery, staffOptions, loadingOptions, submitting, setField, setBeneficiaryQuery, selectBeneficiary, submitCreate };
}

export function useManualCommissionDialogs(refreshRecords: RefreshFn) {
  const [submittingAction, setSubmittingAction] = useState(false);
  const [adjustModal, setAdjustModal] = useState<AdjustModalState>(null);
  const [cancelModal, setCancelModal] = useState<CancelModalState>(null);
  const openAdjustModal = (record: ManualCommissionRecord) => setAdjustModal({ record, amount: String(record.amount), remark: "" });
  const openCancelModal = (record: ManualCommissionRecord) => setCancelModal({ record, remark: "" });
  const submitAdjust = async () => {
    if (!adjustModal || !adjustModal.amount || !adjustModal.remark.trim()) return;
    setSubmittingAction(true);
    try {
      await adjustManualCommission(adjustModal.record.id, adjustModal.amount, adjustModal.remark);
      setAdjustModal(null);
      await refreshRecords();
      alert("金额已调整");
    } catch (error) {
      alert(getErrorDetail(error));
    } finally {
      setSubmittingAction(false);
    }
  };
  const submitCancel = async () => {
    if (!cancelModal || !cancelModal.remark.trim()) return;
    setSubmittingAction(true);
    try {
      await cancelManualCommission(cancelModal.record.id, cancelModal.remark);
      setCancelModal(null);
      await refreshRecords();
      alert("佣金已取消");
    } catch (error) {
      alert(getErrorDetail(error));
    } finally {
      setSubmittingAction(false);
    }
  };
  return { adjustModal, cancelModal, submittingAction, openAdjustModal, openCancelModal, setAdjustModal, setCancelModal, submitAdjust, submitCancel };
}
