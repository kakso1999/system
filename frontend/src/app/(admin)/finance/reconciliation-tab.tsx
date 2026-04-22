"use client";

import { useCallback, useEffect, useState } from "react";
import api from "@/lib/api";
import type { ReconciliationSummary } from "./finance-types";
import { toPoints } from "./finance-types";

const emptyState: ReconciliationSummary = {
  payable_cents: 0,
  paid_cents: 0,
  frozen_cents: 0,
  bonus_pending_count: 0,
  anomaly_count: 0,
  anomaly_sample: [],
};

export default function ReconciliationTab() {
  const [summary, setSummary] = useState<ReconciliationSummary>(emptyState);
  const [loading, setLoading] = useState(true);

  const loadSummary = useCallback(async () => {
    setLoading(true);
    try {
      const res = await api.get<ReconciliationSummary>("/api/admin/finance/reconciliation");
      setSummary({
        payable_cents: Number(res.data.payable_cents || 0),
        paid_cents: Number(res.data.paid_cents || 0),
        frozen_cents: Number(res.data.frozen_cents || 0),
        bonus_pending_count: Number(res.data.bonus_pending_count || 0),
        anomaly_count: Number(res.data.anomaly_count || 0),
        anomaly_sample: res.data.anomaly_sample || [],
      });
    } catch {
      setSummary(emptyState);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadSummary();
  }, [loadSummary]);

  const cards = [
    { label: "待支付佣金", value: toPoints(summary.payable_cents / 100), tone: "text-blue-700" },
    { label: "已支付佣金", value: toPoints(summary.paid_cents / 100), tone: "text-green-700" },
    { label: "冻结佣金", value: toPoints(summary.frozen_cents / 100), tone: "text-red-700" },
    { label: "待结算 Bonus", value: String(summary.bonus_pending_count), tone: "text-amber-700" },
    { label: "异常记录", value: String(summary.anomaly_count), tone: "text-rose-700" },
  ];

  return (
    <section className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-extrabold font-[var(--font-headline)]">对账总览</h2>
          <p className="text-sm text-on-surface-variant">对比佣金状态、bonus 待结算数量和缺失佣金日志的异常记录。</p>
        </div>
        <button
          onClick={() => void loadSummary()}
          className="rounded-xl bg-surface-container-low px-4 py-2 text-sm font-bold text-on-surface"
        >
          刷新
        </button>
      </div>

      <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-5">
        {cards.map((card) => (
          <article key={card.label} className="rounded-xl bg-surface-container-lowest p-5 shadow-sm">
            <p className="text-xs font-bold uppercase tracking-wider text-on-surface-variant">{card.label}</p>
            <p className={`mt-2 text-2xl font-extrabold font-[var(--font-headline)] ${card.tone}`}>{card.value}</p>
          </article>
        ))}
      </div>

      <div className="rounded-xl bg-surface-container-lowest p-5 shadow-sm">
        <div className="flex items-center justify-between">
          <div>
            <h3 className="text-base font-bold">异常样本</h3>
            <p className="text-sm text-on-surface-variant">成功领取但缺少佣金日志的 claim_id 样本。</p>
          </div>
          {loading ? <span className="text-sm text-on-surface-variant">加载中...</span> : null}
        </div>

        {!loading && summary.anomaly_sample.length === 0 ? (
          <div className="mt-4 rounded-xl bg-surface-container-low px-4 py-6 text-sm text-on-surface-variant">
            当前没有异常样本。
          </div>
        ) : null}

        {!loading && summary.anomaly_sample.length > 0 ? (
          <ul className="mt-4 space-y-2">
            {summary.anomaly_sample.map((item) => (
              <li key={item} className="rounded-xl bg-surface-container-low px-4 py-3 font-mono text-sm text-on-surface">
                {item}
              </li>
            ))}
          </ul>
        ) : null}
      </div>
    </section>
  );
}
