import { FormEvent, useCallback, useEffect, useState } from "react";
import { ArrowUpRight } from "lucide-react";
import api from "@/lib/api";
import type { PageResponse, PayoutAccount, WithdrawalRequest } from "@/types";
import WithdrawalModal from "./withdrawal-modal";
import { statusBadge, toPoints, type WithdrawalBalanceSummary } from "./wallet-shared";

interface WithdrawalSectionProps {
  accounts: PayoutAccount[];
}

const emptyBalance: WithdrawalBalanceSummary = {
  total_approved: 0,
  total_withdrawn: 0,
  available: 0,
  pending_withdrawals: 0,
};

export default function WithdrawalSection(props: WithdrawalSectionProps) {
  const { accounts } = props;
  const [balance, setBalance] = useState<WithdrawalBalanceSummary>(emptyBalance);
  const [requests, setRequests] = useState<WithdrawalRequest[]>([]);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [amount, setAmount] = useState("");
  const [payoutAccountId, setPayoutAccountId] = useState("");

  const loadData = useCallback(async () => {
    setLoading(true);
    try {
      const [balanceRes, requestsRes] = await Promise.all([
        api.get<WithdrawalBalanceSummary>("/api/promoter/withdrawal-balance"),
        api.get<PageResponse<WithdrawalRequest>>("/api/promoter/withdrawal-requests", {
          params: { page: 1, page_size: 20 },
        }),
      ]);
      setBalance(balanceRes.data);
      setRequests(requestsRes.data.items || []);
    } catch {
      setBalance(emptyBalance);
      setRequests([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadData();
  }, [loadData]);

  useEffect(() => {
    const defaultAccount = accounts.find((account) => account.is_default) || accounts[0];
    if (!defaultAccount) {
      setPayoutAccountId("");
      return;
    }
    setPayoutAccountId((current) => {
      if (current && accounts.some((account) => account.id === current)) {
        return current;
      }
      return defaultAccount.id;
    });
  }, [accounts]);

  const closeModal = () => {
    setShowModal(false);
    setAmount("");
  };

  const submitWithdrawal = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const numericAmount = Number(amount);
    if (!numericAmount || numericAmount <= 0) {
      alert("Please enter a valid amount.");
      return;
    }
    if (numericAmount > balance.available) {
      alert("Amount exceeds available balance.");
      return;
    }
    if (!payoutAccountId) {
      alert("Please select a payout account.");
      return;
    }
    setSubmitting(true);
    try {
      await api.post("/api/promoter/withdrawal-requests", {
        amount: numericAmount,
        payout_account_id: payoutAccountId,
      });
      closeModal();
      await loadData();
    } catch (error: unknown) {
      const axiosErr = error as { response?: { data?: { detail?: string } } };
      alert(axiosErr.response?.data?.detail || "Failed to submit withdrawal request");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <section className="space-y-3">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-extrabold font-[var(--font-headline)]">Withdrawal</h2>
          <p className="text-xs text-on-surface-variant">Available balance: {toPoints(balance.available)}</p>
        </div>
        <button
          onClick={() => setShowModal(true)}
          disabled={accounts.length === 0 || balance.available <= 0}
          className="rounded-full bg-primary px-4 py-2 text-sm font-bold text-on-primary disabled:opacity-60"
        >
          Apply for Withdrawal
        </button>
      </div>

      <article className="rounded-xl bg-surface-container-lowest p-5 shadow-sm">
        <div className="flex items-start justify-between gap-3">
          <div>
            <p className="text-xs font-bold uppercase tracking-wider text-on-surface-variant">Available</p>
            <p className="mt-1 text-3xl font-extrabold font-[var(--font-headline)] text-primary">{toPoints(balance.available)}</p>
          </div>
          <div className="rounded-full bg-primary/10 p-2">
            <ArrowUpRight className="h-5 w-5 text-primary" />
          </div>
        </div>
        <div className="mt-4 grid grid-cols-2 gap-3 text-sm">
          <div className="rounded-xl bg-surface-container-low p-3">
            <p className="text-xs font-bold uppercase tracking-wider text-on-surface-variant">Approved</p>
            <p className="mt-1 font-bold">{toPoints(balance.total_approved)}</p>
          </div>
          <div className="rounded-xl bg-surface-container-low p-3">
            <p className="text-xs font-bold uppercase tracking-wider text-on-surface-variant">Pending</p>
            <p className="mt-1 font-bold">{toPoints(balance.pending_withdrawals)}</p>
          </div>
        </div>
      </article>

      {loading ? (
        <div className="rounded-xl bg-surface-container-lowest p-6 text-center text-on-surface-variant">Loading withdrawals...</div>
      ) : requests.length === 0 ? (
        <div className="rounded-xl bg-surface-container-lowest p-6 text-center text-on-surface-variant">No withdrawal requests yet.</div>
      ) : (
        requests.map((request) => (
          <article key={request.id} className="rounded-xl bg-surface-container-lowest p-5 shadow-sm space-y-3">
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="text-xs text-on-surface-variant">{new Date(request.created_at).toLocaleString()}</p>
                <p className="mt-1 text-lg font-extrabold font-[var(--font-headline)] text-primary">{toPoints(request.amount)}</p>
                <p className="mt-1 text-xs font-mono text-on-surface-variant">{request.withdrawal_no}</p>
              </div>
              {statusBadge(request.status)}
            </div>
            {request.transaction_no && (
              <p className="text-sm text-on-surface-variant">Transaction No: {request.transaction_no}</p>
            )}
            {request.reject_reason && (
              <p className="text-sm text-red-700">Reason: {request.reject_reason}</p>
            )}
          </article>
        ))
      )}

      {showModal && (
        <WithdrawalModal
          accounts={accounts}
          available={balance.available}
          amount={amount}
          payoutAccountId={payoutAccountId}
          submitting={submitting}
          onAmountChange={setAmount}
          onPayoutAccountChange={setPayoutAccountId}
          onClose={closeModal}
          onSubmit={submitWithdrawal}
        />
      )}
    </section>
  );
}
