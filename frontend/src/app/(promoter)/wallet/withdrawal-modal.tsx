import type { FormEvent } from "react";
import type { PayoutAccount } from "@/types";
import { accountTypeLabels, toPoints } from "./wallet-shared";

interface WithdrawalModalProps {
  accounts: PayoutAccount[];
  available: number;
  amount: string;
  payoutAccountId: string;
  submitting: boolean;
  onAmountChange: (value: string) => void;
  onPayoutAccountChange: (value: string) => void;
  onClose: () => void;
  onSubmit: (event: FormEvent<HTMLFormElement>) => void;
}

export default function WithdrawalModal(props: WithdrawalModalProps) {
  const {
    accounts,
    available,
    amount,
    payoutAccountId,
    submitting,
    onAmountChange,
    onPayoutAccountChange,
    onClose,
    onSubmit,
  } = props;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-inverse-surface/40 px-4 backdrop-blur-sm">
      <div className="w-full max-w-md rounded-2xl bg-surface-container-lowest p-6 shadow-2xl">
        <h3 className="text-xl font-extrabold font-[var(--font-headline)]">Apply for Withdrawal</h3>
        <p className="mt-1 text-sm text-on-surface-variant">Available balance: {toPoints(available)}</p>
        <form onSubmit={onSubmit} className="mt-5 space-y-4">
          <div>
            <label className="mb-1 block text-sm font-bold text-on-surface-variant">Amount</label>
            <input
              type="number"
              step="0.01"
              min="0"
              max={available}
              value={amount}
              onChange={(e) => onAmountChange(e.target.value)}
              placeholder="Enter amount"
              className="w-full rounded-xl border-none bg-surface-container-low px-4 py-3 text-sm"
              required
            />
            <p className="mt-1 text-xs text-on-surface-variant">Max withdrawal: {toPoints(available)}</p>
          </div>
          <div>
            <label className="mb-1 block text-sm font-bold text-on-surface-variant">Payout Account</label>
            <select
              value={payoutAccountId}
              onChange={(e) => onPayoutAccountChange(e.target.value)}
              className="w-full rounded-xl border-none bg-surface-container-low px-4 py-3 text-sm"
              required
            >
              <option value="">Select an account</option>
              {accounts.map((account) => (
                <option key={account.id} value={account.id}>
                  {account.account_name} · {accountTypeLabels[account.type]} · {account.account_number}
                </option>
              ))}
            </select>
          </div>
          <div className="flex gap-3 pt-2">
            <button
              type="button"
              onClick={onClose}
              className="flex-1 rounded-full border border-outline-variant py-3 text-sm font-bold text-on-surface-variant"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={submitting || accounts.length === 0}
              className="flex-1 rounded-full bg-primary py-3 text-sm font-bold text-on-primary disabled:opacity-60"
            >
              {submitting ? "Submitting..." : "Submit Request"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
