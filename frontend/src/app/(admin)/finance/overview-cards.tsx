import type { FinanceOverview } from "./finance-types";
import { toPoints } from "./finance-types";

interface OverviewCardsProps {
  overview: FinanceOverview;
}

export default function OverviewCards({ overview }: OverviewCardsProps) {
  const cards = [
    { label: "总佣金", value: overview.total_commission, tone: "text-primary" },
    { label: "待审核", value: overview.pending, tone: "text-yellow-700" },
    { label: "已审核", value: overview.approved, tone: "text-green-700" },
    { label: "已打款", value: overview.paid, tone: "text-primary" },
    { label: "已冻结", value: overview.frozen, tone: "text-red-700" },
  ];

  return (
    <section className="grid grid-cols-2 xl:grid-cols-5 gap-4">
      {cards.map((item) => (
        <article key={item.label} className="bg-surface-container-lowest rounded-xl shadow-sm p-6">
          <p className="text-xs font-bold uppercase tracking-wider text-on-surface-variant">{item.label}</p>
          <p className={`text-2xl font-extrabold font-[var(--font-headline)] mt-2 ${item.tone}`}>{toPoints(item.value)}</p>
        </article>
      ))}
    </section>
  );
}
