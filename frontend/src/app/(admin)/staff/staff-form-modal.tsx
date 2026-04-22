import { useEffect, useState, type FormEvent } from "react";
import api from "@/lib/api";
import type { Staff } from "@/types";

type StaffControlForm = {
  risk_frozen: boolean;
  daily_claim_limit: string;
  daily_redeem_limit: string;
  payout_method: string;
  payout_account_name: string;
  payout_account_number: string;
  payout_notes: string;
  can_generate_qr: boolean;
  can_use_signed_link: boolean;
  allow_static_link: boolean;
  must_start_work: boolean;
};

type TouchedControls = Partial<Record<keyof StaffControlForm, boolean>>;

type StaffWithControls = Staff & {
  risk_frozen?: boolean;
  daily_claim_limit?: number;
  daily_redeem_limit?: number;
  payout_method?: string;
  payout_account_name?: string;
  payout_account_number?: string;
  payout_notes?: string;
  can_generate_qr?: boolean;
  can_use_signed_link?: boolean;
  allow_static_link?: boolean;
  must_start_work?: boolean;
};

function createControlForm(staff: Staff | null): StaffControlForm {
  const editableStaff = staff as StaffWithControls | null;
  return {
    risk_frozen: editableStaff?.risk_frozen ?? false,
    daily_claim_limit: String(editableStaff?.daily_claim_limit ?? 0),
    daily_redeem_limit: String(editableStaff?.daily_redeem_limit ?? 0),
    payout_method: editableStaff?.payout_method ?? "",
    payout_account_name: editableStaff?.payout_account_name ?? "",
    payout_account_number: editableStaff?.payout_account_number ?? "",
    payout_notes: editableStaff?.payout_notes ?? "",
    can_generate_qr: editableStaff?.can_generate_qr ?? true,
    can_use_signed_link: editableStaff?.can_use_signed_link ?? true,
    allow_static_link: editableStaff?.allow_static_link ?? true,
    must_start_work: editableStaff?.must_start_work ?? false,
  };
}

function getErrorDetail(error: unknown, fallback: string) {
  const axiosErr = error as { response?: { data?: { detail?: string } } };
  return axiosErr.response?.data?.detail || fallback;
}

function parseLimit(value: string) {
  const parsed = Number.parseInt(value, 10);
  return Number.isNaN(parsed) ? 0 : parsed;
}

function buildEditPayload(
  form: StaffFormModalProps["form"],
  controls: StaffControlForm,
  touchedControls: TouchedControls,
) {
  const payload: Record<string, string | number | boolean> = {
    name: form.name,
    phone: form.phone,
  };
  if (touchedControls.risk_frozen) payload.risk_frozen = controls.risk_frozen;
  if (touchedControls.daily_claim_limit) payload.daily_claim_limit = parseLimit(controls.daily_claim_limit);
  if (touchedControls.daily_redeem_limit) payload.daily_redeem_limit = parseLimit(controls.daily_redeem_limit);
  if (touchedControls.payout_method) payload.payout_method = controls.payout_method;
  if (touchedControls.payout_account_name) payload.payout_account_name = controls.payout_account_name;
  if (touchedControls.payout_account_number) payload.payout_account_number = controls.payout_account_number;
  if (touchedControls.payout_notes) payload.payout_notes = controls.payout_notes;
  if (touchedControls.can_generate_qr) payload.can_generate_qr = controls.can_generate_qr;
  if (touchedControls.can_use_signed_link) payload.can_use_signed_link = controls.can_use_signed_link;
  if (touchedControls.allow_static_link) payload.allow_static_link = controls.allow_static_link;
  if (touchedControls.must_start_work) payload.must_start_work = controls.must_start_work;
  return payload;
}

interface StaffFormModalProps {
  editingStaff: Staff | null;
  form: {
    name: string;
    phone: string;
    username: string;
    password: string;
  };
  onFormChange: (next: { name: string; phone: string; username: string; password: string }) => void;
  onClose: () => void;
  onSubmit: (event: FormEvent) => void;
}

export default function StaffFormModal(props: StaffFormModalProps) {
  const { editingStaff, form, onFormChange, onClose, onSubmit } = props;
  const [controls, setControls] = useState<StaffControlForm>(() => createControlForm(editingStaff));
  const [touchedControls, setTouchedControls] = useState<TouchedControls>({});
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    setControls(createControlForm(editingStaff));
    setTouchedControls({});
    setSubmitting(false);
  }, [editingStaff]);

  function updateControl<K extends keyof StaffControlForm>(field: K, value: StaffControlForm[K]) {
    setControls((current) => ({ ...current, [field]: value }));
    setTouchedControls((current) => ({ ...current, [field]: true }));
  }

  const handleFormSubmit = async (event: FormEvent) => {
    if (!editingStaff) {
      onSubmit(event);
      return;
    }
    event.preventDefault();
    setSubmitting(true);
    try {
      const payload = buildEditPayload(form, controls, touchedControls);
      await api.put(`/api/admin/staff/${editingStaff.id}`, payload);
      onClose();
      window.location.reload();
    } catch (error: unknown) {
      alert(getErrorDetail(error, "保存失败"));
      setSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-inverse-surface/40 backdrop-blur-sm">
      <div className="bg-surface-container-lowest rounded-2xl p-8 w-full max-w-md shadow-2xl">
        <h2 className="text-xl font-extrabold font-[var(--font-headline)] mb-6">
          {editingStaff ? "编辑地推员" : "新增地推员"}
        </h2>
        <form onSubmit={handleFormSubmit} className="space-y-4">
          <div>
            <label className="text-sm font-bold text-on-surface-variant block mb-1">姓名</label>
            <input type="text" value={form.name} onChange={(e) => onFormChange({ ...form, name: e.target.value })}
              className="w-full bg-surface-container-low border-none rounded-xl py-3 px-4 text-sm focus:ring-2 focus:ring-primary/40" required />
          </div>
          <div>
            <label className="text-sm font-bold text-on-surface-variant block mb-1">手机号</label>
            <input type="text" value={form.phone} onChange={(e) => onFormChange({ ...form, phone: e.target.value })}
              className="w-full bg-surface-container-low border-none rounded-xl py-3 px-4 text-sm focus:ring-2 focus:ring-primary/40" required />
          </div>
          {editingStaff && (
            <>
              <div className="grid grid-cols-1 gap-2 rounded-xl bg-surface-container-low p-3 text-xs text-on-surface-variant">
                <p><span className="font-bold">邀请码：</span>{editingStaff.invite_code || "-"}</p>
                <p><span className="font-bold">上级ID：</span>{editingStaff.parent_id || "无"}</p>
              </div>
              <details className="rounded-xl bg-surface-container-low p-4" open>
                <summary className="cursor-pointer text-sm font-bold text-on-surface">Controls</summary>
                <div className="mt-4 space-y-4">
                  <label className="flex items-center gap-3 text-sm text-on-surface">
                    <input
                      type="checkbox"
                      checked={controls.risk_frozen}
                      onChange={(e) => updateControl("risk_frozen", e.target.checked)}
                      className="h-4 w-4 rounded border-outline-variant text-primary focus:ring-primary/40"
                    />
                    <span>Freeze risk (invalidates live QRs)</span>
                  </label>
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="text-sm font-bold text-on-surface-variant block mb-1">Daily claim limit</label>
                      <input
                        type="number"
                        min={0}
                        value={controls.daily_claim_limit}
                        onChange={(e) => updateControl("daily_claim_limit", e.target.value)}
                        className="w-full bg-surface-container-lowest border-none rounded-xl py-3 px-4 text-sm focus:ring-2 focus:ring-primary/40"
                      />
                    </div>
                    <div>
                      <label className="text-sm font-bold text-on-surface-variant block mb-1">Daily redeem limit</label>
                      <input
                        type="number"
                        min={0}
                        value={controls.daily_redeem_limit}
                        onChange={(e) => updateControl("daily_redeem_limit", e.target.value)}
                        className="w-full bg-surface-container-lowest border-none rounded-xl py-3 px-4 text-sm focus:ring-2 focus:ring-primary/40"
                      />
                    </div>
                  </div>
                  <div>
                    <label className="text-sm font-bold text-on-surface-variant block mb-1">Payout method</label>
                    <input
                      type="text"
                      value={controls.payout_method}
                      onChange={(e) => updateControl("payout_method", e.target.value)}
                      placeholder="gcash / maya / bank / usdt"
                      className="w-full bg-surface-container-lowest border-none rounded-xl py-3 px-4 text-sm focus:ring-2 focus:ring-primary/40"
                    />
                  </div>
                  <div>
                    <label className="text-sm font-bold text-on-surface-variant block mb-1">Payout account name</label>
                    <input
                      type="text"
                      value={controls.payout_account_name}
                      onChange={(e) => updateControl("payout_account_name", e.target.value)}
                      className="w-full bg-surface-container-lowest border-none rounded-xl py-3 px-4 text-sm focus:ring-2 focus:ring-primary/40"
                    />
                  </div>
                  <div>
                    <label className="text-sm font-bold text-on-surface-variant block mb-1">Payout account number</label>
                    <input
                      type="text"
                      value={controls.payout_account_number}
                      onChange={(e) => updateControl("payout_account_number", e.target.value)}
                      className="w-full bg-surface-container-lowest border-none rounded-xl py-3 px-4 text-sm focus:ring-2 focus:ring-primary/40"
                    />
                  </div>
                  <div>
                    <label className="text-sm font-bold text-on-surface-variant block mb-1">Payout notes</label>
                    <input
                      type="text"
                      value={controls.payout_notes}
                      onChange={(e) => updateControl("payout_notes", e.target.value)}
                      className="w-full bg-surface-container-lowest border-none rounded-xl py-3 px-4 text-sm focus:ring-2 focus:ring-primary/40"
                    />
                  </div>
                  <div className="grid grid-cols-1 gap-2 rounded-xl bg-surface-container-lowest p-3">
                    <label className="flex items-center gap-3 text-sm text-on-surface">
                      <input type="checkbox" checked={controls.can_generate_qr}
                        onChange={(e) => updateControl("can_generate_qr", e.target.checked)}
                        className="h-4 w-4 rounded border-outline-variant text-primary focus:ring-primary/40" />
                      <span>Can generate live QR</span>
                    </label>
                    <label className="flex items-center gap-3 text-sm text-on-surface">
                      <input type="checkbox" checked={controls.can_use_signed_link}
                        onChange={(e) => updateControl("can_use_signed_link", e.target.checked)}
                        className="h-4 w-4 rounded border-outline-variant text-primary focus:ring-primary/40" />
                      <span>Can use signed link</span>
                    </label>
                    <label className="flex items-center gap-3 text-sm text-on-surface">
                      <input type="checkbox" checked={controls.allow_static_link}
                        onChange={(e) => updateControl("allow_static_link", e.target.checked)}
                        className="h-4 w-4 rounded border-outline-variant text-primary focus:ring-primary/40" />
                      <span>Allow static /welcome link</span>
                    </label>
                    <label className="flex items-center gap-3 text-sm text-on-surface">
                      <input type="checkbox" checked={controls.must_start_work}
                        onChange={(e) => updateControl("must_start_work", e.target.checked)}
                        className="h-4 w-4 rounded border-outline-variant text-primary focus:ring-primary/40" />
                      <span>Must start work before QR</span>
                    </label>
                  </div>
                </div>
              </details>
            </>
          )}
          {!editingStaff && (
            <>
              <div>
                <label className="text-sm font-bold text-on-surface-variant block mb-1">用户名</label>
                <input type="text" value={form.username} onChange={(e) => onFormChange({ ...form, username: e.target.value })}
                  className="w-full bg-surface-container-low border-none rounded-xl py-3 px-4 text-sm focus:ring-2 focus:ring-primary/40" required />
              </div>
              <div>
                <label className="text-sm font-bold text-on-surface-variant block mb-1">密码</label>
                <input type="password" value={form.password} onChange={(e) => onFormChange({ ...form, password: e.target.value })}
                  className="w-full bg-surface-container-low border-none rounded-xl py-3 px-4 text-sm focus:ring-2 focus:ring-primary/40" required />
              </div>
            </>
          )}
          <div className="flex gap-3 pt-4">
            <button type="button" onClick={onClose}
              className="flex-1 py-3 rounded-full border border-outline-variant text-on-surface-variant font-bold text-sm hover:bg-surface-container-low transition-all"
            >取消</button>
            <button type="submit" disabled={submitting}
              className="flex-1 bg-primary text-on-primary py-3 rounded-full font-bold text-sm shadow-md shadow-primary/20 hover:shadow-lg active:scale-[0.98] transition-all disabled:opacity-60"
            >{submitting ? "保存中..." : editingStaff ? "保存" : "创建"}</button>
          </div>
        </form>
      </div>
    </div>
  );
}
