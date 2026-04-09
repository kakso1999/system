import type { FormEvent } from "react";
import type { Staff } from "@/types";

interface StaffFormModalProps {
  editingStaff: Staff | null;
  form: {
    name: string;
    phone: string;
    username: string;
    password: string;
  };
  onFormChange: (next: { name: string; phone: string; username: string; password: string }) => void;
  onClose: () => void;
  onSubmit: (event: FormEvent) => void;
}

export default function StaffFormModal(props: StaffFormModalProps) {
  const { editingStaff, form, onFormChange, onClose, onSubmit } = props;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-inverse-surface/40 backdrop-blur-sm">
      <div className="bg-surface-container-lowest rounded-2xl p-8 w-full max-w-md shadow-2xl">
        <h2 className="text-xl font-extrabold font-[var(--font-headline)] mb-6">
          {editingStaff ? "编辑地推员" : "新增地推员"}
        </h2>
        <form onSubmit={onSubmit} className="space-y-4">
          <div>
            <label className="text-sm font-bold text-on-surface-variant block mb-1">姓名</label>
            <input type="text" value={form.name} onChange={(e) => onFormChange({ ...form, name: e.target.value })}
              className="w-full bg-surface-container-low border-none rounded-xl py-3 px-4 text-sm focus:ring-2 focus:ring-primary/40" required />
          </div>
          <div>
            <label className="text-sm font-bold text-on-surface-variant block mb-1">手机号</label>
            <input type="text" value={form.phone} onChange={(e) => onFormChange({ ...form, phone: e.target.value })}
              className="w-full bg-surface-container-low border-none rounded-xl py-3 px-4 text-sm focus:ring-2 focus:ring-primary/40" required />
          </div>
          {editingStaff && (
            <div className="grid grid-cols-1 gap-2 rounded-xl bg-surface-container-low p-3 text-xs text-on-surface-variant">
              <p><span className="font-bold">邀请码：</span>{editingStaff.invite_code || "-"}</p>
              <p><span className="font-bold">上级ID：</span>{editingStaff.parent_id || "无"}</p>
            </div>
          )}
          {!editingStaff && (
            <>
              <div>
                <label className="text-sm font-bold text-on-surface-variant block mb-1">用户名</label>
                <input type="text" value={form.username} onChange={(e) => onFormChange({ ...form, username: e.target.value })}
                  className="w-full bg-surface-container-low border-none rounded-xl py-3 px-4 text-sm focus:ring-2 focus:ring-primary/40" required />
              </div>
              <div>
                <label className="text-sm font-bold text-on-surface-variant block mb-1">密码</label>
                <input type="password" value={form.password} onChange={(e) => onFormChange({ ...form, password: e.target.value })}
                  className="w-full bg-surface-container-low border-none rounded-xl py-3 px-4 text-sm focus:ring-2 focus:ring-primary/40" required />
              </div>
            </>
          )}
          <div className="flex gap-3 pt-4">
            <button type="button" onClick={onClose}
              className="flex-1 py-3 rounded-full border border-outline-variant text-on-surface-variant font-bold text-sm hover:bg-surface-container-low transition-all"
            >取消</button>
            <button type="submit"
              className="flex-1 bg-primary text-on-primary py-3 rounded-full font-bold text-sm shadow-md shadow-primary/20 hover:shadow-lg active:scale-[0.98] transition-all"
            >{editingStaff ? "保存" : "创建"}</button>
          </div>
        </form>
      </div>
    </div>
  );
}
