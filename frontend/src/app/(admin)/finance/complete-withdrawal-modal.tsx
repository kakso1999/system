interface CompleteWithdrawalModalProps {
  title: string;
  transactionNo: string;
  remark: string;
  submitting: boolean;
  onTransactionNoChange: (value: string) => void;
  onRemarkChange: (value: string) => void;
  onCancel: () => void;
  onConfirm: () => void;
}

export default function CompleteWithdrawalModal(props: CompleteWithdrawalModalProps) {
  const {
    title,
    transactionNo,
    remark,
    submitting,
    onTransactionNoChange,
    onRemarkChange,
    onCancel,
    onConfirm,
  } = props;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-inverse-surface/40 backdrop-blur-sm px-4">
      <div className="w-full max-w-md rounded-2xl bg-surface-container-lowest p-6 shadow-2xl">
        <h2 className="text-xl font-extrabold font-[var(--font-headline)]">完成打款</h2>
        <p className="mt-1 text-sm text-on-surface-variant">{title}</p>
        <div className="mt-4 space-y-4">
          <input
            type="text"
            value={transactionNo}
            onChange={(e) => onTransactionNoChange(e.target.value)}
            placeholder="请输入打款流水号"
            className="w-full rounded-xl border-none bg-surface-container-low px-4 py-3 text-sm"
          />
          <textarea
            value={remark}
            onChange={(e) => onRemarkChange(e.target.value)}
            rows={4}
            placeholder="备注（可选）"
            className="w-full resize-none rounded-xl border-none bg-surface-container-low px-4 py-3 text-sm"
          />
          <div className="flex gap-3">
            <button
              onClick={onCancel}
              className="flex-1 rounded-full border border-outline-variant py-3 text-sm font-bold text-on-surface-variant"
            >
              取消
            </button>
            <button
              onClick={onConfirm}
              disabled={!transactionNo.trim() || submitting}
              className="flex-1 rounded-full bg-primary py-3 text-sm font-bold text-on-primary disabled:opacity-60"
            >
              {submitting ? "处理中..." : "确认完成"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
