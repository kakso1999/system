"use client";

import { useCallback, useEffect, useState } from "react";
import api from "@/lib/api";
import type { PageResponse, Staff } from "@/types";
import { Users, Copy, UserPlus } from "lucide-react";

type TeamTab = "all" | "1" | "2" | "3";

const tabs: Array<{ key: TeamTab; label: string }> = [
  { key: "all", label: "All" },
  { key: "1", label: "Level 1" },
  { key: "2", label: "Level 2" },
  { key: "3", label: "Level 3" },
];

const VIP_LABELS = ["Regular", "VIP 1", "VIP 2", "VIP 3", "Super VIP"];

function statusBadge(status: string) {
  const styleMap: Record<string, string> = {
    active: "bg-green-100 text-green-700",
    disabled: "bg-red-100 text-red-700",
    pending_review: "bg-yellow-100 text-yellow-700",
  };
  const labelMap: Record<string, string> = {
    active: "Active",
    disabled: "Disabled",
    pending_review: "Pending",
  };
  const style = styleMap[status] || "bg-slate-100 text-slate-600";
  const label = labelMap[status] || status;
  return <span className={`rounded-full px-2 py-1 text-xs font-bold ${style}`}>{label}</span>;
}

export default function TeamPage() {
  const [activeTab, setActiveTab] = useState<TeamTab>("all");
  const [members, setMembers] = useState<Staff[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(true);
  const [inviteCode, setInviteCode] = useState("");

  useEffect(() => {
    api.get("/api/promoter/qrcode").then(res => setInviteCode(res.data.invite_code)).catch(() => {});
  }, []);

  const loadTeam = useCallback(async () => {
    setLoading(true);
    try {
      const params: Record<string, number> = { page, page_size: 10 };
      if (activeTab !== "all") params.level = Number(activeTab);
      const res = await api.get<PageResponse<Staff>>("/api/promoter/team", { params });
      setMembers(res.data.items || []);
      setTotal(res.data.total || 0);
    } catch {
      setMembers([]);
      setTotal(0);
    } finally {
      setLoading(false);
    }
  }, [activeTab, page]);

  useEffect(() => { loadTeam(); }, [loadTeam]);

  const totalPages = Math.max(1, Math.ceil(total / 10));

  return (
    <div className="mx-auto max-w-lg px-4 pt-8 pb-8 space-y-5">
      <section className="space-y-1">
        <h1 className="text-3xl font-extrabold font-[var(--font-headline)] tracking-tight">My Team</h1>
        <p className="text-sm text-on-surface-variant">Total Members: {total}</p>
      </section>

      {/* Invite Section */}
      {inviteCode && (
        <section className="bg-secondary-container/30 rounded-xl p-5 shadow-sm">
          <div className="flex items-center gap-3 mb-3">
            <div className="bg-secondary/10 p-2 rounded-full">
              <UserPlus className="w-5 h-5 text-secondary" />
            </div>
            <div>
              <h3 className="font-bold text-sm">Invite New Promoter</h3>
              <p className="text-xs text-on-surface-variant">Share this link to grow your team</p>
            </div>
          </div>
          <div className="p-3 bg-surface-container-low rounded-lg mb-3">
            <p className="text-xs text-on-surface-variant break-all">
              {typeof window !== "undefined" ? `${window.location.origin}/staff-register?invite=${inviteCode}` : ""}
            </p>
          </div>
          <button
            onClick={() => {
              navigator.clipboard.writeText(`${window.location.origin}/staff-register?invite=${inviteCode}`);
              alert("Invite link copied!");
            }}
            className="w-full bg-secondary text-on-secondary py-2.5 rounded-full font-bold text-sm flex items-center justify-center gap-2 shadow-sm hover:shadow-md active:scale-[0.98] transition-all"
          >
            <Copy className="w-4 h-4" />
            Copy Invite Link
          </button>
        </section>
      )}

      <section className="bg-surface-container-lowest rounded-xl p-2 shadow-sm">
        <div className="grid grid-cols-4 gap-2">
          {tabs.map((tab) => (
            <button
              key={tab.key}
              onClick={() => { setActiveTab(tab.key); setPage(1); }}
              className={`rounded-full px-2 py-2 text-xs font-bold transition-colors ${
                activeTab === tab.key ? "bg-primary text-on-primary" : "text-on-surface-variant hover:bg-surface-container-low"
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>
      </section>

      <section className="space-y-3">
        {loading ? (
          <div className="bg-surface-container-lowest rounded-xl p-6 text-center text-on-surface-variant">Loading...</div>
        ) : members.length === 0 ? (
          <div className="bg-surface-container-lowest rounded-xl p-6 text-center text-on-surface-variant">No team members found.</div>
        ) : (
          members.map((member) => (
            <article key={member.id} className="bg-surface-container-lowest rounded-xl p-5 shadow-sm">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <h2 className="text-lg font-extrabold font-[var(--font-headline)]">{member.name}</h2>
                  <p className="text-xs text-on-surface-variant mt-1">Staff No: {member.staff_no}</p>
                </div>
                {statusBadge(member.status)}
              </div>
              <div className="mt-4 grid grid-cols-2 gap-3 text-sm">
                <div>
                  <p className="text-xs uppercase tracking-wider text-on-surface-variant font-bold">Phone</p>
                  <p className="font-semibold">{member.phone || "-"}</p>
                </div>
                <div>
                  <p className="text-xs uppercase tracking-wider text-on-surface-variant font-bold">VIP</p>
                  <p className="font-semibold text-primary">{VIP_LABELS[member.vip_level] ?? `VIP ${member.vip_level}`}</p>
                </div>
                <div>
                  <p className="text-xs uppercase tracking-wider text-on-surface-variant font-bold">Valid Claims</p>
                  <p className="font-semibold">{member.stats?.total_valid ?? 0}</p>
                </div>
                <div>
                  <p className="text-xs uppercase tracking-wider text-on-surface-variant font-bold">Join Date</p>
                  <p className="font-semibold">{new Date(member.created_at).toLocaleDateString()}</p>
                </div>
              </div>
            </article>
          ))
        )}
      </section>

      <section className="flex items-center justify-between bg-surface-container-lowest rounded-xl p-4 shadow-sm">
        <button
          onClick={() => setPage((prev) => Math.max(1, prev - 1))}
          disabled={page === 1}
          className="rounded-full border border-outline-variant px-4 py-2 text-sm font-bold text-on-surface-variant disabled:opacity-40"
        >
          Previous
        </button>
        <p className="text-sm text-on-surface-variant flex items-center gap-2">
          <Users className="h-4 w-4" />
          {page} / {totalPages}
        </p>
        <button
          onClick={() => setPage((prev) => Math.min(totalPages, prev + 1))}
          disabled={page === totalPages}
          className="rounded-full bg-primary px-4 py-2 text-sm font-bold text-on-primary disabled:opacity-40"
        >
          Next
        </button>
      </section>
    </div>
  );
}
