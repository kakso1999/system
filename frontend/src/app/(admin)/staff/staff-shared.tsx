export function statusBadge(status: string) {
  const styles: Record<string, string> = {
    active: "bg-green-100 text-green-700",
    disabled: "bg-red-100 text-red-700",
    pending_review: "bg-yellow-100 text-yellow-700",
  };
  const labels: Record<string, string> = {
    active: "活跃",
    disabled: "禁用",
    pending_review: "待审核",
  };
  return (
    <span className={`px-2 py-1 rounded-full text-xs font-bold ${styles[status] || "bg-gray-100 text-gray-600"}`}>
      {labels[status] || status}
    </span>
  );
}


export function vipLabel(level: number) {
  const labels = ["普通", "VIP1", "VIP2", "VIP3", "超级VIP"];
  return labels[level] || `VIP${level}`;
}
