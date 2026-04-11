import { Suspense } from "react";
import StaffManagementContent from "./staff-management-content";

function LoadingFallback() {
  return <div className="flex items-center justify-center py-20 text-on-surface-variant">加载中...</div>;
}

export default function StaffManagementPage() {
  return (
    <Suspense fallback={<LoadingFallback />}>
      <StaffManagementContent />
    </Suspense>
  );
}

export default function StaffManagementPage() {
  return (
    <Suspense fallback={<div className="flex items-center justify-center py-20 text-on-surface-variant">加载中...</div>}>
      <StaffManagementContent />
    </Suspense>
  );
}
