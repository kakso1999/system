interface RejectModalProps {
  heading?: string;
  title: string;
  reason: string;
  submitting: boolean;
  placeholder?: string;
  confirmLabel?: string;
  onReasonChange: (value: string) => void;
  onCancel: () => void;
  onConfirm: () => void;
}

export default function RejectModal(props: RejectModalProps) {
  const {
    heading = "驳回佣金",
    title,
    reason,
    submitting,
    placeholder = "请输入驳回原因",
    confirmLabel = "确认驳回",
    onReasonChange,
    onCancel,
    onConfirm,
  } = props;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-inverse-surface/40 backdrop-blur-sm px-4">
      <div className="w-full max-w-md rounded-2xl bg-surface-container-lowest p-6 shadow-2xl">
        <h2 className="text-xl font-extrabold font-[var(--font-headline)]">{heading}</h2>
        <p className="mt-1 text-sm text-on-surface-variant">{title}</p>
        <textarea
          value={reason}
          onChange={(e) => onReasonChange(e.target.value)}
          rows={4}
          placeholder={placeholder}
          className="mt-4 w-full resize-none bg-surface-container-low border-none rounded-xl py-3 px-4 text-sm"
        />
        <div className="mt-4 flex gap-3">
          <button
            onClick={onCancel}
            className="flex-1 rounded-full border border-outline-variant py-3 text-sm font-bold text-on-surface-variant"
          >
            取消
          </button>
          <button
            onClick={onConfirm}
            disabled={!reason.trim() || submitting}
            className="flex-1 rounded-full bg-error py-3 text-sm font-bold text-on-error disabled:opacity-60"
          >
            {submitting ? "提交中..." : confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}
