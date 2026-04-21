import { useEffect, type Dispatch, type FormEvent, type SetStateAction } from "react";
import type { PayoutAccount } from "@/types";
import { USDT_NETWORKS, type AccountForm } from "./wallet-shared";

interface AccountModalProps {
  editing: PayoutAccount | null;
  form: AccountForm;
  setForm: Dispatch<SetStateAction<AccountForm>>;
  submitting: boolean;
  onClose: () => void;
  onSubmit: (event: FormEvent<HTMLFormElement>) => void;
}

export default function AccountModal(props: AccountModalProps) {
  const { editing, form, setForm, submitting, onClose, onSubmit } = props;
  const labelsFor = (type: PayoutAccount["type"]) => {
    if (type === "usdt") return { accountName: "Wallet Label", accountNumber: "Wallet Address" };
    if (type === "bank") return { accountName: "Account Name", accountNumber: "Account Number" };
    return { accountName: "Account Name", accountNumber: "Phone / Account Number" };
  };
  const labels = labelsFor(form.type);

  useEffect(() => {
    if (form.type !== "usdt") return;
    if (USDT_NETWORKS.includes(form.bank_name as typeof USDT_NETWORKS[number])) return;
    setForm((prev) => ({ ...prev, bank_name: USDT_NETWORKS[0] }));
  }, [form.type, form.bank_name, setForm]);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-inverse-surface/40 backdrop-blur-sm px-4">
      <div className="w-full max-w-md rounded-2xl bg-surface-container-lowest p-6 shadow-2xl">
        <h3 className="text-xl font-extrabold font-[var(--font-headline)] mb-5">
          {editing ? "Edit Payout Account" : "Add Payout Account"}
        </h3>
        <form onSubmit={onSubmit} className="space-y-4">
          <select
            value={form.type}
            onChange={(e) => setForm((prev) => ({
              ...prev,
              type: e.target.value as PayoutAccount["type"],
              bank_name: e.target.value === "usdt" && !USDT_NETWORKS.includes(prev.bank_name as typeof USDT_NETWORKS[number]) ? USDT_NETWORKS[0] : prev.bank_name,
            }))}
            className="w-full bg-surface-container-low border-none rounded-xl py-3 px-4 text-sm"
          >
            <option value="gcash">GCash</option>
            <option value="maya">Maya</option>
            <option value="bank">Bank</option>
            <option value="usdt">USDT</option>
            <option value="other">Other</option>
          </select>
          <input
            type="text"
            placeholder={labels.accountName}
            value={form.account_name}
            onChange={(e) => setForm((prev) => ({ ...prev, account_name: e.target.value }))}
            className="w-full bg-surface-container-low border-none rounded-xl py-3 px-4 text-sm"
            required={form.type !== "usdt"}
          />
          {form.type === "usdt" && (
            <label className="block">
              <span className="mb-1 block text-sm font-medium text-on-surface-variant">Network</span>
              <select
                value={form.bank_name || USDT_NETWORKS[0]}
                onChange={(e) => setForm((prev) => ({ ...prev, bank_name: e.target.value }))}
                className="w-full bg-surface-container-low border-none rounded-xl py-3 px-4 text-sm"
                required
              >
                {USDT_NETWORKS.map((network) => (
                  <option key={network} value={network}>{network}</option>
                ))}
              </select>
            </label>
          )}
          <input
            type="text"
            placeholder={labels.accountNumber}
            value={form.account_number}
            onChange={(e) => setForm((prev) => ({ ...prev, account_number: e.target.value }))}
            className="w-full bg-surface-container-low border-none rounded-xl py-3 px-4 text-sm"
            required
          />
          {form.type === "bank" && (
            <input
              type="text"
              placeholder="Bank Name"
              value={form.bank_name}
              onChange={(e) => setForm((prev) => ({ ...prev, bank_name: e.target.value }))}
              className="w-full bg-surface-container-low border-none rounded-xl py-3 px-4 text-sm"
              required
            />
          )}
          <div className="flex items-center gap-3 pt-2">
            <button
              type="button"
              onClick={onClose}
              className="flex-1 rounded-full border border-outline-variant py-3 text-sm font-bold text-on-surface-variant"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={submitting}
              className="flex-1 rounded-full bg-primary py-3 text-sm font-bold text-on-primary disabled:opacity-60"
            >
              {submitting ? "Saving..." : editing ? "Save Changes" : "Create Account"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
