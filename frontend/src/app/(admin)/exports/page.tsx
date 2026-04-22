import type { LucideIcon } from "lucide-react";
import {
  BadgeDollarSign,
  FileSpreadsheet,
  Gift,
  ShieldAlert,
  Shuffle,
  Trophy,
  Users,
  Wallet,
} from "lucide-react";

type ReportCard = {
  title: string;
  description: string;
  csvPath: string;
  xlsxPath?: string;
  tag: string;
  icon: LucideIcon;
};

type ReportSection = {
  key: string;
  title: string;
  description: string;
  reports: ReportCard[];
};

const sections: ReportSection[] = [
  {
    key: "basic",
    title: "基础数据",
    description: "面向运营和活动管理的核心报表，覆盖人员、领取和激励数据。",
    reports: [
      { title: "地推员清单", description: "导出地推员基础信息、状态与累计业绩。", csvPath: "/api/admin/staff/export", xlsxPath: "/api/admin/exports/staff.xlsx", tag: "现有 CSV / 新增 Excel", icon: Users },
      { title: "领取记录", description: "导出用户领取明细、结算状态与奖励码。", csvPath: "/api/admin/claims/export", xlsxPath: "/api/admin/exports/claims.xlsx", tag: "现有 CSV / 新增 Excel", icon: Gift },
      { title: "奖励码", description: "导出奖励码状态、归属手机号与发放时间。", csvPath: "/api/admin/exports/reward-codes.csv", xlsxPath: "/api/admin/exports/reward-codes.xlsx", tag: "CSV / Excel", icon: FileSpreadsheet },
      { title: "VIP 升级记录", description: "导出 VIP 等级变更、升级原因与时间。", csvPath: "/api/admin/exports/vip-upgrades.csv", xlsxPath: "/api/admin/exports/vip-upgrades.xlsx", tag: "CSV / Excel", icon: Trophy },
      { title: "团队奖励", description: "导出团队里程碑奖励、金额与状态。", csvPath: "/api/admin/exports/team-rewards.csv", xlsxPath: "/api/admin/exports/team-rewards.xlsx", tag: "CSV / Excel", icon: BadgeDollarSign },
    ],
  },
  {
    key: "finance",
    title: "财务结算",
    description: "面向财务核对和付款执行的导出入口，集中管理佣金与批次数据。",
    reports: [
      { title: "佣金记录", description: "导出佣金编号、来源、层级和支付状态。", csvPath: "/api/admin/finance/export/commissions", xlsxPath: "/api/admin/exports/commissions.xlsx", tag: "现有 CSV / 新增 Excel", icon: Wallet },
      { title: "提现记录", description: "导出提现金额、状态与完成时间。", csvPath: "/api/admin/finance/export/withdrawals", xlsxPath: "/api/admin/exports/withdrawals.xlsx", tag: "现有 CSV / 新增 Excel", icon: Wallet },
      { title: "结算批次", description: "导出批次金额、状态、完成时间与创建人。", csvPath: "/api/admin/exports/settlement-batches.csv", xlsxPath: "/api/admin/exports/settlement-batches.xlsx", tag: "CSV / Excel", icon: FileSpreadsheet },
    ],
  },
  {
    key: "risk-reconciliation",
    title: "风控与对账",
    description: "用于排查异常、核对上下级关系以及识别佣金差异。",
    reports: [
      { title: "风控日志", description: "导出命中类型、设备信息与触发原因。", csvPath: "/api/admin/exports/risk-logs.csv", xlsxPath: "/api/admin/exports/risk-logs.xlsx", tag: "CSV / Excel", icon: ShieldAlert },
      { title: "上下级关系", description: "导出地推员与祖先关系链路和层级。", csvPath: "/api/admin/exports/staff-relations.csv", xlsxPath: "/api/admin/exports/staff-relations.xlsx", tag: "CSV / Excel", icon: Shuffle },
      { title: "对账报告", description: "导出佣金支付标记与差异原因，便于核对异常。", csvPath: "/api/admin/exports/reconciliation.csv", xlsxPath: "/api/admin/exports/reconciliation.xlsx", tag: "CSV / Excel", icon: FileSpreadsheet },
    ],
  },
];

function DownloadButton({ href, label }: { href?: string; label: string }) {
  const baseClass =
    "inline-flex items-center justify-center rounded-xl px-4 py-2 text-sm font-bold transition-colors";

  return (
    <a
      href={href || "#"}
      className={`${baseClass} bg-primary/10 text-primary hover:bg-primary/15`}
    >
      {label}
    </a>
  );
}

export default function ExportCenterPage() {
  return (
    <div className="space-y-8">
      <div className="flex flex-col gap-3 md:flex-row md:items-end md:justify-between">
        <div>
          <h1 className="text-3xl font-extrabold font-[var(--font-headline)] tracking-tight">导出中心</h1>
          <p className="mt-1 text-on-surface-variant">统一下载基础数据、财务结算、风控与对账报表。</p>
        </div>
        <div className="rounded-2xl bg-surface-container-low px-4 py-3 text-sm text-on-surface-variant">
          共 11 份报表，新增 7 组 CSV / Excel 导出
        </div>
      </div>

      {sections.map((section) => (
        <section key={section.key} className="space-y-4">
          <div>
            <h2 className="text-xl font-bold">{section.title}</h2>
            <p className="mt-1 text-sm text-on-surface-variant">{section.description}</p>
          </div>

          <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
            {section.reports.map((report) => {
              const Icon = report.icon;
              return (
                <article
                  key={report.title}
                  className="rounded-2xl bg-surface-container-lowest p-6 shadow-sm ring-1 ring-black/5"
                >
                  <div className="flex items-start justify-between gap-4">
                    <div className="flex gap-4">
                      <div className="rounded-2xl bg-primary/10 p-3 text-primary">
                        <Icon className="h-5 w-5" />
                      </div>
                      <div>
                        <h3 className="text-lg font-bold">{report.title}</h3>
                        <p className="mt-1 text-sm text-on-surface-variant">{report.description}</p>
                      </div>
                    </div>
                    <span className="rounded-full bg-surface-container-low px-3 py-1 text-xs font-bold text-on-surface-variant">
                      {report.tag}
                    </span>
                  </div>

                  <div className="mt-5 flex items-center gap-3">
                    <DownloadButton href={report.csvPath} label="CSV" />
                    <DownloadButton href={report.xlsxPath} label="Excel" />
                  </div>

                  <p className="mt-4 text-xs text-on-surface-variant">
                    {report.xlsxPath || report.csvPath}
                  </p>
                </article>
              );
            })}
          </div>
        </section>
      ))}
    </div>
  );
}
