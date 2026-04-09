"use client";

import { FormEvent, useCallback, useEffect, useState } from "react";
import { Pencil, Plus, Trash2, Wallet } from "lucide-react";
import api from "@/lib/api";
import type { PageResponse, PayoutAccount } from "@/types";
import AccountModal from "./account-modal";
import {
  AccountForm,
  SettlementRecord,
  accountIcon,
  accountTypeLabels,
  emptyForm,
  maskNumber,
  statusBadge,
  toPoints,
} from "./wallet-shared";

export default function WalletPage() {
  const [accounts, setAccounts] = useState<PayoutAccount[]>([]);
  const [settlements, setSettlements] = useState<SettlementRecord[]>([]);
  const [loadingAccounts, setLoadingAccounts] = useState(true);
  const [loadingSettlements, setLoadingSettlements] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [editing, setEditing] = useState<PayoutAccount | null>(null);
  const [form, setForm] = useState<AccountForm>(emptyForm);
  const [submitting, setSubmitting] = useState(false);

  const loadAccounts = useCallback(async () => {
    setLoadingAccounts(true);
    try {
      const res = await api.get<PayoutAccount[] | PageResponse<PayoutAccount>>("/api/promoter/payout-accounts");
      setAccounts(Array.isArray(res.data) ? res.data : (res.data.items || []));
    } catch {
      setAccounts([]);
    } finally {
      setLoadingAccounts(false);
    }
  }, []);

  const loadSettlements = useCallback(async () => {
    setLoadingSettlements(true);
    try {
      const res = await api.get<SettlementRecord[] | PageResponse<SettlementRecord>>("/api/promoter/settlement");
      setSettlements(Array.isArray(res.data) ? res.data : (res.data.items || []));
    } catch {
      setSettlements([]);
    } finally {
      setLoadingSettlements(false);
    }
  }, []);

  useEffect(() => {
    loadAccounts();
    loadSettlements();
  }, [loadAccounts, loadSettlements]);

  const openCreate = () => {
    setEditing(null);
    setForm(emptyForm);
    setShowModal(true);
  };

  const openEdit = (account: PayoutAccount) => {
    setEditing(account);
    setForm({
      type: account.type,
      account_name: account.account_name,
      account_number: account.account_number,
      bank_name: account.bank_name || "",
    });
    setShowModal(true);
  };

  const closeModal = () => {
    setShowModal(false);
    setEditing(null);
    setForm(emptyForm);
  };

  const submitAccount = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setSubmitting(true);
    try {
      if (editing) await api.put(`/api/promoter/payout-accounts/${editing.id}`, form);
      else await api.post("/api/promoter/payout-accounts", form);
      closeModal();
      loadAccounts();
    } catch (error: unknown) {
      const axiosErr = error as { response?: { data?: { detail?: string } } };
      alert(axiosErr.response?.data?.detail || "Failed to save account");
    } finally {
      setSubmitting(false);
    }
  };

  const deleteAccount = async (account: PayoutAccount) => {
    if (!window.confirm(`Delete payout account "${account.account_name}"?`)) return;
    try {
      await api.delete(`/api/promoter/payout-accounts/${account.id}`);
      loadAccounts();
    } catch {
      alert("Failed to delete account");
    }
  };

  const setDefault = async (account: PayoutAccount) => {
    try {
      await api.put(`/api/promoter/payout-accounts/${account.id}`, { is_default: true });
      loadAccounts();
    } catch {
      alert("Failed to set default account");
    }
  };

  return (
    <div className="mx-auto max-w-lg px-4 pt-8 pb-8 space-y-6">
      <section className="space-y-1">
        <h1 className="text-3xl font-extrabold font-[var(--font-headline)] tracking-tight">My Wallet</h1>
        <p className="text-sm text-on-surface-variant">Manage payout methods and settlement records.</p>
      </section>

      <section className="space-y-3">
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-extrabold font-[var(--font-headline)]">Payout Accounts</h2>
          <button onClick={openCreate} className="rounded-full bg-primary px-4 py-2 text-sm font-bold text-on-primary flex items-center gap-2">
            <Plus className="h-4 w-4" />
            Add Account
          </button>
        </div>

        {loadingAccounts ? (
          <div className="bg-surface-container-lowest rounded-xl p-6 text-center text-on-surface-variant">Loading accounts...</div>
        ) : accounts.length === 0 ? (
          <div className="bg-surface-container-lowest rounded-xl p-6 text-center text-on-surface-variant">No payout accounts yet.</div>
        ) : (
          accounts.map((account) => {
            const Icon = accountIcon(account.type);
            return (
              <article key={account.id} className="bg-surface-container-lowest rounded-xl p-5 shadow-sm space-y-3">
                <div className="flex items-start justify-between gap-3">
                  <div className="flex items-center gap-3">
                    <div className="rounded-full bg-primary/10 p-2">
                      <Icon className="h-5 w-5 text-primary" />
                    </div>
                    <div>
                      <p className="font-bold">{account.account_name}</p>
                      <p className="text-xs text-on-surface-variant">
                        {accountTypeLabels[account.type]} - {maskNumber(account.account_number)}
                      </p>
                    </div>
                  </div>
                  {account.is_default && <span className="rounded-full bg-green-100 px-2 py-1 text-xs font-bold text-green-700">Default</span>}
                </div>

                <div className="flex flex-wrap items-center gap-2">
                  {!account.is_default && (
                    <button onClick={() => setDefault(account)} className="rounded-full bg-surface-container-low px-3 py-1.5 text-xs font-bold text-primary">
                      Set Default
                    </button>
                  )}
                  <button onClick={() => openEdit(account)} className="rounded-full bg-surface-container-low px-3 py-1.5 text-xs font-bold text-on-surface-variant flex items-center gap-1.5">
                    <Pencil className="h-3.5 w-3.5" />
                    Edit
                  </button>
                  <button onClick={() => deleteAccount(account)} className="rounded-full bg-red-100 px-3 py-1.5 text-xs font-bold text-red-700 flex items-center gap-1.5">
                    <Trash2 className="h-3.5 w-3.5" />
                    Delete
                  </button>
                </div>
              </article>
            );
          })
        )}
      </section>

      <section className="space-y-3">
        <h2 className="text-lg font-extrabold font-[var(--font-headline)]">Settlement Records</h2>
        {loadingSettlements ? (
          <div className="bg-surface-container-lowest rounded-xl p-6 text-center text-on-surface-variant">Loading settlements...</div>
        ) : settlements.length === 0 ? (
          <div className="bg-surface-container-lowest rounded-xl p-6 text-center text-on-surface-variant">No settlement records.</div>
        ) : (
          settlements.map((item) => (
            <article key={item.id} className="bg-surface-container-lowest rounded-xl p-5 shadow-sm">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="text-xs text-on-surface-variant">{new Date(item.created_at).toLocaleString()}</p>
                  <p className="text-xl font-extrabold font-[var(--font-headline)] text-primary mt-1">{toPoints(Number(item.amount || 0))}</p>
                </div>
                <div className="flex items-center gap-2">
                  <Wallet className="h-4 w-4 text-on-surface-variant" />
                  {statusBadge(item.status)}
                </div>
              </div>
            </article>
          ))
        )}
      </section>

      {showModal && (
        <AccountModal
          editing={editing}
          form={form}
          setForm={setForm}
          submitting={submitting}
          onClose={closeModal}
          onSubmit={submitAccount}
        />
      )}
    </div>
  );
}
