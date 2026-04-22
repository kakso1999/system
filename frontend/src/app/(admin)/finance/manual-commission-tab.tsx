"use client";

import ManualCommissionForm from "./manual-commission-form";
import ManualCommissionRecords from "./manual-commission-records";
import { AdjustCommissionDialog, CancelCommissionDialog } from "./manual-commission-dialogs";
import { useManualCommissionCreate, useManualCommissionDialogs } from "./manual-commission-actions";
import { useManualCommissionRecords } from "./manual-commission-hooks";

export default function ManualCommissionTab() {
  const recordsState = useManualCommissionRecords();
  const createState = useManualCommissionCreate(recordsState.refreshRecords);
  const dialogState = useManualCommissionDialogs(recordsState.refreshRecords);
  return <section className="space-y-4"><ManualCommissionForm form={createState.form} beneficiaryQuery={createState.beneficiaryQuery} staffOptions={createState.staffOptions} loadingOptions={createState.loadingOptions} submitting={createState.submitting} onFieldChange={createState.setField} onBeneficiaryQueryChange={createState.setBeneficiaryQuery} onSelectBeneficiary={createState.selectBeneficiary} onSubmit={() => void createState.submitCreate()} /><ManualCommissionRecords records={recordsState.records} staffMap={recordsState.staffMap} loadingRecords={recordsState.loadingRecords} onRefresh={() => void recordsState.refreshRecords()} onAdjust={dialogState.openAdjustModal} onCancel={dialogState.openCancelModal} /><AdjustCommissionDialog modal={dialogState.adjustModal} submitting={dialogState.submittingAction} onChange={(amount, remark) => dialogState.setAdjustModal((current) => current ? { ...current, amount, remark } : current)} onCancel={() => dialogState.setAdjustModal(null)} onConfirm={() => void dialogState.submitAdjust()} /><CancelCommissionDialog modal={dialogState.cancelModal} submitting={dialogState.submittingAction} onChange={(remark) => dialogState.setCancelModal((current) => current ? { ...current, remark } : current)} onCancel={() => dialogState.setCancelModal(null)} onConfirm={() => void dialogState.submitCancel()} /></section>;
}
