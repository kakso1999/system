"use client";

import { useEffect, useState, useCallback } from "react";
import { Settings, Save } from "lucide-react";
import api from "@/lib/api";
import {
  SETTING_GROUP_LABELS,
  SETTING_LABELS,
  getGroupLabel,
  getSettingHelp,
  getSettingLabel,
  getSettingUnit,
} from "@/lib/settings-labels";

interface SystemSetting {
  key: string;
  value: string | number | boolean;
  group: string;
  description: string;
}

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
            {SETTING_GROUP_LABELS[group] ?? getGroupLabel(group)}
          </h2>
          <div className="space-y-4">
            {items.map((s) => {
              const meta = SETTING_LABELS[s.key];
              const original = String(s.value);
              const current = editValues[s.key] ?? original;
              const changed = current !== original;
              const isBoolean = meta?.type === "bool" || typeof s.value === "boolean";
              const label = meta?.label ?? getSettingLabel(s.key);
              const help = meta?.help ?? getSettingHelp(s.key, s.description);
              const unit = meta?.unit ?? getSettingUnit(s.key);
              return (
                <div key={s.key} className="flex items-center gap-4 py-3 px-4 rounded-xl hover:bg-surface-container-low/50 transition-colors">
                  <div className="flex-1 min-w-0">
                    <p className="font-semibold text-sm">{label}</p>
                    <p className="text-xs text-on-surface-variant mt-0.5">{help}</p>
                  </div>
                  <div className="flex items-center gap-2">
                    {isBoolean ? (
                      <button
                        onClick={() => {
                          setEditValues({ ...editValues, [s.key]: current === "true" ? "false" : "true" });
                        }}
                        className={`relative w-12 h-7 rounded-full transition-colors ${current === "true" ? "bg-primary" : "bg-outline/30"}`}
                      >
                        <span className={`absolute top-1 w-5 h-5 rounded-full bg-white shadow transition-transform ${current === "true" ? "left-6" : "left-1"}`} />
                      </button>
                    ) : (
                      <div className="flex items-center gap-2">
                        <input
                          type="text"
                          value={current}
                          onChange={(e) => setEditValues({ ...editValues, [s.key]: e.target.value })}
                          className="w-32 bg-surface-container-low border-none rounded-lg py-2 px-3 text-sm text-right focus:ring-2 focus:ring-primary/40"
                        />
                        {unit ? <span className="text-xs text-gray-500">{unit}</span> : null}
                      </div>
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
