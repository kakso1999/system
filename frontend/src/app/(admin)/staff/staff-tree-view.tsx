import type { ReactNode } from "react";
import { ChevronDown, ChevronRight } from "lucide-react";
import type { Staff } from "@/types";
import { statusBadge, vipLabel } from "./staff-shared";

interface StaffTreeViewProps {
  loading: boolean;
  roots: Staff[];
  expandedIds: Set<string>;
  childrenData: Record<string, Staff[]>;
  loadingIds: Set<string>;
  onToggle: (staff: Staff) => void;
}

function moneyLabel(value: number) {
  return `${Number(value || 0).toFixed(2)}P`;
}

export default function StaffTreeView(props: StaffTreeViewProps) {
  const { loading, roots, expandedIds, childrenData, loadingIds, onToggle } = props;

  const renderNodes = (nodes: Staff[], level: number): ReactNode[] => {
    return nodes.flatMap((staff) => {
      const hasChildren = (staff.children_count ?? 0) > 0;
      const expanded = expandedIds.has(staff.id);
      const children = childrenData[staff.id] || [];
      const padding = `${level * 2 + 0.5}rem`;

      return [
        <div key={staff.id} className="grid min-w-[980px] grid-cols-[minmax(280px,2fr)_repeat(6,minmax(0,1fr))] items-center border-b border-surface-container-high/60 text-sm hover:bg-surface-container-low/40">
          <div className="px-6 py-4" style={{ paddingLeft: padding }}>
            <div className="flex items-center gap-2">
              {hasChildren ? (
                <button
                  type="button"
                  onClick={() => onToggle(staff)}
                  className="rounded-md p-1 text-on-surface-variant hover:bg-surface-container-low"
                >
                  {expanded ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
                </button>
              ) : (
                <span className="block w-6" />
              )}
              <div className="flex min-w-0 items-center gap-2">
                <span className="truncate font-semibold">{staff.name}</span>
                {hasChildren && (
                  <span className="rounded-full bg-primary/10 px-2 py-1 text-[11px] font-bold text-primary">
                    {staff.children_count} members
                  </span>
                )}
              </div>
            </div>
          </div>
          <div className="px-6 py-4 text-on-surface-variant">{staff.phone}</div>
          <div className="px-6 py-4 font-mono text-xs text-on-surface-variant">{staff.invite_code || "-"}</div>
          <div className="px-6 py-4 text-xs font-bold text-primary">{vipLabel(staff.vip_level)}</div>
          <div className="px-6 py-4 font-bold">{staff.stats?.total_valid ?? 0}</div>
          <div className="px-6 py-4 font-bold text-secondary">{moneyLabel(staff.stats?.total_commission ?? 0)}</div>
          <div className="px-6 py-4">{statusBadge(staff.status)}</div>
        </div>,
        expanded && loadingIds.has(staff.id)
          ? (
            <div key={`${staff.id}-loading`} className="min-w-[980px] border-b border-surface-container-high/60 px-6 py-4 text-sm text-on-surface-variant" style={{ paddingLeft: `${(level + 1) * 2 + 2}rem` }}>
              加载下级成员中...
            </div>
          )
          : null,
        expanded && children.length > 0 ? renderNodes(children, level + 1) : null,
      ];
    });
  };

  return (
    <div className="space-y-3">
      <div className="rounded-xl bg-primary/5 px-4 py-3 text-sm text-on-surface-variant">
        树状模式展示上下级关系，展开节点时按需加载直属下级成员。
      </div>
      <div className="overflow-x-auto rounded-xl bg-surface-container-lowest shadow-sm">
        <div className="grid min-w-[980px] grid-cols-[minmax(280px,2fr)_repeat(6,minmax(0,1fr))] border-b border-surface-container-high bg-surface-container-lowest text-xs font-bold uppercase tracking-wider text-on-surface-variant">
          {["姓名", "手机号", "邀请码", "VIP", "有效量", "佣金", "状态"].map((title) => (
            <div key={title} className="px-6 py-4">{title}</div>
          ))}
        </div>
        {loading ? (
          <div className="min-w-[980px] px-6 py-8 text-center text-sm text-on-surface-variant">加载中...</div>
        ) : roots.length === 0 ? (
          <div className="min-w-[980px] px-6 py-8 text-center text-sm text-on-surface-variant">暂无成员树数据</div>
        ) : (
          renderNodes(roots, 0)
        )}
      </div>
    </div>
  );
}
