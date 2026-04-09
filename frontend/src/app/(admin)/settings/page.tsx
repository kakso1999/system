"use client";

import { useEffect, useState, useCallback } from "react";
import { Settings, Save } from "lucide-react";
import api from "@/lib/api";

interface SystemSetting {
  key: string;
  value: string | number | boolean;
  group: string;
  description: string;
}

const groupLabels: Record<string, string> = {
  risk_control: "风控设置",
  commission: "佣金配置",
  general: "通用设置",
};

const settingLabels: Record<string, string> = {
  risk_phone_unique: "手机号唯一限制",
  risk_ip_unique: "IP 唯一限制",
  risk_device_unique: "设备指纹唯一",
  sms_verification: "短信验证",
  commission_level1_default: "一级佣金（默认）",
  commission_level2: "二级佣金",
  commission_level3: "三级佣金",
  commission_vip1: "VIP1 一级佣金",
  commission_vip2: "VIP2 一级佣金",
  commission_vip3: "VIP3 一级佣金",
  commission_svip: "超级VIP 一级佣金",
  default_currency: "默认货币",
};

export default function SettingsPage() {
  const [settings, setSettings] = useState<SystemSetting[]>([]);
  const [loading, setLoading] = useState(true);
  const [editValues, setEditValues] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState<string | null>(null);

  const loadSettings = useCallback(async () => {
    setLoading(true);
    try {
      const res = await api.get("/api/admin/settings/");
      setSettings(res.data);
      const values: Record<string, string> = {};
      for (const s of res.data) {
        values[s.key] = String(s.value);
      }
      setEditValues(values);
    } catch {
      setSettings([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { loadSettings(); }, [loadSettings]);

  const handleSave = async (key: string) => {
    setSaving(key);
    try {
      const raw = editValues[key];
      let value: string | number | boolean = raw;
      if (raw === "true") value = true;
      else if (raw === "false") value = false;
      else if (!isNaN(Number(raw)) && raw.trim() !== "") value = Number(raw);
      await api.put(`/api/admin/settings/${key}`, { value });
      loadSettings();
    } catch {
      alert("保存失败");
    } finally {
      setSaving(null);
    }
  };

  const grouped = settings.reduce<Record<string, SystemSetting[]>>((acc, s) => {
    const g = s.group || "general";
    if (!acc[g]) acc[g] = [];
    acc[g].push(s);
    return acc;
  }, {});

  if (loading) {
    return <div className="flex items-center justify-center h-64 text-on-surface-variant">加载中...</div>;
  }

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-3xl font-extrabold font-[var(--font-headline)] tracking-tight">系统设置</h1>
        <p className="text-on-surface-variant mt-1">管理系统参数配置</p>
      </div>

      {Object.entries(grouped).map(([group, items]) => (
        <div key={group} className="bg-surface-container-lowest rounded-xl shadow-sm p-6">
          <h2 className="text-lg font-bold mb-4 flex items-center gap-2">
            <Settings className="w-5 h-5 text-primary" />
            {groupLabels[group] || group}
          </h2>
          <div className="space-y-4">
            {items.map((s) => {
              const original = String(s.value);
              const current = editValues[s.key] ?? original;
              const changed = current !== original;
              return (
                <div key={s.key} className="flex items-center gap-4 py-3 px-4 rounded-xl hover:bg-surface-container-low/50 transition-colors">
                  <div className="flex-1 min-w-0">
                    <p className="font-semibold text-sm">{settingLabels[s.key] || s.key}</p>
                    <p className="text-xs text-on-surface-variant mt-0.5">{s.description}</p>
                  </div>
                  <div className="flex items-center gap-2">
                    {typeof s.value === "boolean" ? (
                      <button
                        onClick={() => {
                          setEditValues({ ...editValues, [s.key]: current === "true" ? "false" : "true" });
                        }}
                        className={`relative w-12 h-7 rounded-full transition-colors ${current === "true" ? "bg-primary" : "bg-outline/30"}`}
                      >
                        <span className={`absolute top-1 w-5 h-5 rounded-full bg-white shadow transition-transform ${current === "true" ? "left-6" : "left-1"}`} />
                      </button>
                    ) : (
                      <input
                        type="text"
                        value={current}
                        onChange={(e) => setEditValues({ ...editValues, [s.key]: e.target.value })}
                        className="w-32 bg-surface-container-low border-none rounded-lg py-2 px-3 text-sm text-right focus:ring-2 focus:ring-primary/40"
                      />
                    )}
                    {changed && (
                      <button
                        onClick={() => handleSave(s.key)}
                        disabled={saving === s.key}
                        className="bg-primary text-on-primary px-3 py-1.5 rounded-lg text-xs font-bold flex items-center gap-1 shadow-sm hover:shadow-md active:scale-[0.97] transition-all disabled:opacity-50"
                      >
                        <Save className="w-3.5 h-3.5" />
                        {saving === s.key ? "..." : "保存"}
                      </button>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      ))}
    </div>
  );
}
