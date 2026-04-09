interface ManualSettleModalProps {
  staffName: string;
  staffNo: string;
  amount: string;
  remark: string;
  settling: boolean;
  onAmountChange: (value: string) => void;
  onRemarkChange: (value: string) => void;
  onCancel: () => void;
  onConfirm: () => void;
}

export default function ManualSettleModal(props: ManualSettleModalProps) {
  const { staffName, staffNo, amount, remark, settling, onAmountChange, onRemarkChange, onCancel, onConfirm } = props;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-inverse-surface/40 backdrop-blur-sm px-4">
      <div className="w-full max-w-md rounded-2xl bg-surface-container-lowest p-8 shadow-2xl">
        <h2 className="text-xl font-extrabold font-[var(--font-headline)] mb-2">手动结算</h2>
        <p className="text-on-surface-variant text-sm mb-6">地推员：{staffName}（{staffNo}）</p>
        <div className="space-y-4">
          <input
            type="number"
            step="0.01"
            value={amount}
            onChange={(e) => onAmountChange(e.target.value)}
            placeholder="结算金额"
            className="w-full bg-surface-container-low border-none rounded-xl py-3 px-4 text-sm"
          />
          <input
            type="text"
            value={remark}
            onChange={(e) => onRemarkChange(e.target.value)}
            placeholder="备注"
            className="w-full bg-surface-container-low border-none rounded-xl py-3 px-4 text-sm"
          />
          <div className="flex gap-3 pt-2">
            <button
              onClick={onCancel}
              className="flex-1 rounded-full border border-outline-variant py-3 text-sm font-bold text-on-surface-variant"
            >
              取消
            </button>
            <button
              onClick={onConfirm}
              disabled={settling}
              className="flex-1 rounded-full bg-primary py-3 text-sm font-bold text-on-primary disabled:opacity-60"
            >
              {settling ? "处理中..." : "确认结算"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
