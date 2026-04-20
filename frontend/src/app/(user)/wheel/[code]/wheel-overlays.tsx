import { LockOpen } from "lucide-react";

export function DemoCodeModal({
  demoCode,
  onClose,
}: {
  demoCode: string | null;
  onClose: () => void;
}) {
  if (!demoCode) return null;
  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/50 backdrop-blur-sm">
      <div className="mx-6 w-full max-w-sm rounded-2xl bg-surface-container-lowest p-8 text-center shadow-2xl">
        <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-primary/10">
          <LockOpen className="h-8 w-8 text-primary" />
        </div>
        <h3 className="mb-2 font-[var(--font-headline)] text-xl font-extrabold text-on-surface">
          Test Verification Code
        </h3>
        <p className="mb-6 text-sm text-on-surface-variant">Enter this code below to continue</p>
        <div className="mb-6 rounded-xl bg-primary/5 px-6 py-4">
          <p className="font-mono text-4xl font-extrabold tracking-[0.3em] text-primary">{demoCode}</p>
        </div>
        <button
          onClick={onClose}
          className="w-full rounded-xl bg-primary py-4 font-[var(--font-headline)] font-bold text-white transition-all hover:bg-primary-dim active:scale-[0.98]"
        >
          Got it
        </button>
      </div>
    </div>
  );
}
