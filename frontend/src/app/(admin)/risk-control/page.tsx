"use client";

import { useEffect, useState, useCallback } from "react";
import { Shield, AlertTriangle } from "lucide-react";
import api from "@/lib/api";

interface RiskSetting {
  key: string;
  value: boolean;
  description: string;
}

interface RiskLog {
  id: string;
  type: string;
  phone?: string;
  ip?: string;
  reason: string;
  created_at: string;
}

export default function RiskControlPage() {
  const [settings, setSettings] = useState<RiskSetting[]>([]);
  const [logs, setLogs] = useState<RiskLog[]>([]);
  const [logTotal, setLogTotal] = useState(0);
  const [logPage, setLogPage] = useState(1);
  const [loading, setLoading] = useState(true);

  const loadSettings = useCallback(async () => {
    try {
      const res = await api.get("/api/admin/risk-control/");
      setSettings(res.data.settings);
    } catch {
      setSettings([]);
    }
  }, []);

  const loadLogs = useCallback(async () => {
    try {
      const res = await api.get("/api/admin/risk-control/logs", { params: { page: logPage, page_size: 20 } });
      setLogs(res.data.items);
      setLogTotal(res.data.total);
    } catch {
      setLogs([]);
    }
  }, [logPage]);

  useEffect(() => {
    Promise.all([loadSettings(), loadLogs()]).finally(() => setLoading(false));
  }, [loadSettings, loadLogs]);

  const toggleSetting = async (key: string, currentValue: boolean) => {
    try {
      await api.put("/api/admin/risk-control/", { key, value: !currentValue });
      loadSettings();
    } catch {
      alert("Failed to update setting");
    }
  };

  const logTotalPages = Math.ceil(logTotal / 20);

  const settingLabels: Record<string, string> = {
    risk_phone_unique: "手机号唯一限制",
    risk_ip_unique: "IP 地址唯一限制",
    risk_device_unique: "设备指纹唯一限制",
    sms_verification: "短信验证码验证",
  };

  if (loading) {
    return <div className="flex items-center justify-center h-64 text-on-surface-variant">加载中...</div>;
  }

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-3xl font-extrabold font-[var(--font-headline)] tracking-tight">风控设置</h1>
        <p className="text-on-surface-variant mt-1">管理风控规则与查看拦截日志</p>
      </div>

      {/* Settings */}
      <div className="bg-surface-container-lowest rounded-xl shadow-sm p-6">
        <h2 className="text-lg font-bold mb-4 flex items-center gap-2">
          <Shield className="w-5 h-5 text-primary" />
          风控开关
        </h2>
        <div className="space-y-4">
          {settings.map((s) => (
            <div key={s.key} className="flex items-center justify-between py-3 px-4 rounded-xl hover:bg-surface-container-low/50 transition-colors">
              <div>
                <p className="font-semibold text-sm">{settingLabels[s.key] || s.key}</p>
                <p className="text-xs text-on-surface-variant mt-0.5">{s.description}</p>
              </div>
              <button
                onClick={() => toggleSetting(s.key, s.value)}
                className={`relative w-12 h-7 rounded-full transition-colors ${s.value ? "bg-primary" : "bg-outline/30"}`}
              >
                <span className={`absolute top-1 w-5 h-5 rounded-full bg-white shadow transition-transform ${s.value ? "left-6" : "left-1"}`} />
              </button>
            </div>
          ))}
        </div>
      </div>

      {/* Logs */}
      <div className="bg-surface-container-lowest rounded-xl shadow-sm">
        <div className="p-6 border-b border-surface-container-high">
          <h2 className="text-lg font-bold flex items-center gap-2">
            <AlertTriangle className="w-5 h-5 text-error" />
            拦截日志
            <span className="text-sm font-normal text-on-surface-variant ml-2">共 {logTotal} 条</span>
          </h2>
        </div>
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-surface-container-high">
              {["时间", "类型", "手机号", "IP", "原因"].map((h) => (
                <th key={h} className="text-left px-6 py-4 font-bold text-on-surface-variant text-xs uppercase tracking-wider">{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {logs.length === 0 ? (
              <tr><td colSpan={5} className="px-6 py-8 text-center text-on-surface-variant">暂无拦截记录</td></tr>
            ) : (
              logs.map((log, i) => (
                <tr key={log.id || i} className="border-b border-surface-container-high/50 hover:bg-surface-container-low/50 transition-colors">
                  <td className="px-6 py-4 text-xs text-on-surface-variant">{new Date(log.created_at).toLocaleString()}</td>
                  <td className="px-6 py-4">
                    <span className="px-2 py-1 rounded-full text-xs font-bold bg-error-container/20 text-error">{log.type}</span>
                  </td>
                  <td className="px-6 py-4 font-mono text-xs">{log.phone || "-"}</td>
                  <td className="px-6 py-4 font-mono text-xs">{log.ip || "-"}</td>
                  <td className="px-6 py-4 text-xs">{log.reason}</td>
                </tr>
              ))
            )}
          </tbody>
        </table>

        {logTotalPages > 1 && (
          <div className="flex items-center justify-center gap-2 p-4 border-t border-surface-container-high">
            <button onClick={() => setLogPage(Math.max(1, logPage - 1))} disabled={logPage === 1}
              className="px-4 py-2 rounded-lg text-sm font-semibold text-on-surface-variant hover:bg-surface-container-low disabled:opacity-40">上一页</button>
            <span className="text-sm text-on-surface-variant px-4">{logPage} / {logTotalPages}</span>
            <button onClick={() => setLogPage(Math.min(logTotalPages, logPage + 1))} disabled={logPage === logTotalPages}
              className="px-4 py-2 rounded-lg text-sm font-semibold text-on-surface-variant hover:bg-surface-container-low disabled:opacity-40">下一页</button>
          </div>
        )}
      </div>
    </div>
  );
}
