import type { Dispatch, FormEvent, SetStateAction } from "react";
import type { PayoutAccount } from "@/types";
import type { AccountForm } from "./wallet-shared";

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

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-inverse-surface/40 backdrop-blur-sm px-4">
      <div className="w-full max-w-md rounded-2xl bg-surface-container-lowest p-6 shadow-2xl">
        <h3 className="text-xl font-extrabold font-[var(--font-headline)] mb-5">
          {editing ? "Edit Payout Account" : "Add Payout Account"}
        </h3>
        <form onSubmit={onSubmit} className="space-y-4">
          <select
            value={form.type}
            onChange={(e) => setForm((prev) => ({ ...prev, type: e.target.value as PayoutAccount["type"] }))}
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
            placeholder="Account Name"
            value={form.account_name}
            onChange={(e) => setForm((prev) => ({ ...prev, account_name: e.target.value }))}
            className="w-full bg-surface-container-low border-none rounded-xl py-3 px-4 text-sm"
            required
          />
          <input
            type="text"
            placeholder="Account Number"
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
