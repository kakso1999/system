import { Suspense } from "react";
import StaffManagementContent from "./staff-management-content";

export default function StaffManagementPage() {
  return (
    <Suspense fallback={<div className="flex items-center justify-center py-20 text-on-surface-variant">加载中...</div>}>
      <StaffManagementContent />
    </Suspense>
  );
}
