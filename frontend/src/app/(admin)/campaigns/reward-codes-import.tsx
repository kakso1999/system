"use client";

import { useEffect, useRef, useState, type ChangeEvent } from "react";
import { ClipboardPaste, FileText } from "lucide-react";
import api from "@/lib/api";
import type { WheelItem } from "@/types";

interface RewardCodeStats {
  total: number;
  unused: number;
  assigned_today: number;
  redeemed_today: number;
}

interface RewardCodesImportProps {
  campaignId: string;
  wheelItemId?: string;
  wheelItems: WheelItem[];
}

const EMPTY_STATS: RewardCodeStats = {
  total: 0,
  unused: 0,
  assigned_today: 0,
  redeemed_today: 0,
};

function getErrorMessage(error: unknown): string {
  const detail = (error as { response?: { data?: { detail?: string } } })?.response?.data?.detail;
  return detail || "导入失败";
}

function isTextFile(file: File): boolean {
  return file.name.toLowerCase().endsWith(".txt") || file.type.startsWith("text/plain");
}

export default function RewardCodesImport({
  campaignId,
  wheelItemId,
  wheelItems,
}: RewardCodesImportProps) {
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const [tab, setTab] = useState<"upload" | "paste">("upload");
  const [stats, setStats] = useState<RewardCodeStats>(EMPTY_STATS);
  const [statsLoading, setStatsLoading] = useState(true);
  const [selectedWheelItemId, setSelectedWheelItemId] = useState(wheelItemId || "");
  const [codesText, setCodesText] = useState("");
  const [uploading, setUploading] = useState(false);
  const [pasting, setPasting] = useState(false);
  const [refreshToken, setRefreshToken] = useState(0);

  useEffect(() => {
    if (wheelItemId) {
      setSelectedWheelItemId(wheelItemId);
      return;
    }
    setSelectedWheelItemId((current) => {
      if (wheelItems.some((item) => item.id === current)) {
        return current;
      }
      return wheelItems[0]?.id || "";
    });
  }, [wheelItemId, wheelItems]);

  useEffect(() => {
    let active = true;

    async function loadStats() {
      setStatsLoading(true);
      try {
        const res = await api.get<RewardCodeStats>("/api/admin/reward-codes/stats", {
          params: { campaign_id: campaignId },
        });
        if (active) {
          setStats(res.data);
        }
      } catch {
        if (active) {
          setStats(EMPTY_STATS);
        }
      } finally {
        if (active) {
          setStatsLoading(false);
        }
      }
    }

    loadStats();
    return () => {
      active = false;
    };
  }, [campaignId, refreshToken]);

  const handleFileImport = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;
    if (isTextFile(file) && !selectedWheelItemId) {
      alert("请选择一个奖项后再导入 TXT");
      event.target.value = "";
      return;
    }

    const formData = new FormData();
    formData.append("file", file);
    if (isTextFile(file)) {
      formData.append("campaign_id", campaignId);
      formData.append("wheel_item_id", selectedWheelItemId);
      formData.append("pool_type", "imported");
    }

    setUploading(true);
    try {
      const res = await api.post<{ message: string }>("/api/admin/reward-codes/import", formData, {
        headers: { "Content-Type": "multipart/form-data" },
      });
      alert(res.data.message);
      setRefreshToken((value) => value + 1);
    } catch (error: unknown) {
      alert(getErrorMessage(error));
    } finally {
      setUploading(false);
      event.target.value = "";
    }
  };

  const handlePasteImport = async () => {
    if (!selectedWheelItemId) {
      alert("请选择一个奖项");
      return;
    }
    if (!codesText.trim()) {
      alert("请先粘贴兑换码");
      return;
    }

    setPasting(true);
    try {
      const res = await api.post<{ message: string }>("/api/admin/reward-codes/import-paste", {
        codes_text: codesText,
        campaign_id: campaignId,
        wheel_item_id: selectedWheelItemId,
        pool_type: "paste",
      });
      setCodesText("");
      alert(res.data.message);
      setRefreshToken((value) => value + 1);
    } catch (error: unknown) {
      alert(getErrorMessage(error));
    } finally {
      setPasting(false);
    }
  };

  const statCards = [
    { label: "Total", value: stats.total },
    { label: "Unused", value: stats.unused },
    { label: "Assigned today", value: stats.assigned_today },
    { label: "Redeemed today", value: stats.redeemed_today },
  ];

  return (
    <div className="border-t border-outline-variant/20 pt-6">
      <div className="mb-4 grid grid-cols-2 gap-3 md:grid-cols-4">
        {statCards.map((card) => (
          <div key={card.label} className="rounded-xl bg-surface-container-low p-3 md:p-4">
            <p className="text-xs font-bold uppercase tracking-wider text-on-surface-variant">{card.label}</p>
            <p className="mt-2 text-2xl font-bold text-on-surface">{statsLoading ? "..." : card.value}</p>
          </div>
        ))}
      </div>

      <div className="rounded-2xl bg-surface-container-low p-4">
        <div className="mb-4 flex flex-wrap gap-2">
          <button
            type="button"
            onClick={() => setTab("upload")}
            className={`inline-flex items-center gap-2 rounded-full px-4 py-2 text-sm font-bold transition-colors ${
              tab === "upload" ? "bg-primary text-on-primary" : "bg-surface-container text-on-surface-variant"
            }`}
          >
            <FileText className="h-4 w-4" />
            Upload CSV
          </button>
          <button
            type="button"
            onClick={() => setTab("paste")}
            className={`inline-flex items-center gap-2 rounded-full px-4 py-2 text-sm font-bold transition-colors ${
              tab === "paste" ? "bg-primary text-on-primary" : "bg-surface-container text-on-surface-variant"
            }`}
          >
            <ClipboardPaste className="h-4 w-4" />
            Paste codes
          </button>
        </div>

        <div className="mb-4">
          <label className="mb-1 block text-xs font-bold text-outline">Wheel item</label>
          <select
            value={selectedWheelItemId}
            onChange={(event) => setSelectedWheelItemId(event.target.value)}
            className="w-full rounded-xl border-none bg-surface-container px-3 py-2.5 text-sm focus:ring-2 focus:ring-primary/40"
          >
            {wheelItems.length === 0 && <option value="">暂无奖项可选</option>}
            {wheelItems.map((item) => (
              <option key={item.id} value={item.id}>
                {item.display_name}
              </option>
            ))}
          </select>
        </div>

        {tab === "upload" ? (
          <div className="space-y-3">
            <p className="text-sm text-on-surface-variant">
              CSV 继续使用表头 `code,campaign_id,wheel_item_id,pool_type`，同时也支持每行一个兑换码的 `.txt` 文件。
            </p>
            <input
              ref={fileInputRef}
              type="file"
              accept=".csv,text/csv,.txt,text/plain"
              className="hidden"
              onChange={handleFileImport}
            />
            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              disabled={uploading}
              className="inline-flex items-center gap-2 rounded-full bg-primary px-5 py-2.5 text-sm font-bold text-on-primary shadow-md shadow-primary/20 disabled:cursor-not-allowed disabled:opacity-60"
            >
              <FileText className="h-4 w-4" />
              {uploading ? "Importing..." : "Upload CSV / TXT"}
            </button>
          </div>
        ) : (
          <div className="space-y-3">
            <div>
              <label className="mb-1 block text-xs font-bold text-outline">Paste one code per line</label>
              <textarea
                value={codesText}
                onChange={(event) => setCodesText(event.target.value)}
                className="h-40 w-full rounded-xl border-none bg-surface-container px-3 py-3 text-sm focus:ring-2 focus:ring-primary/40"
                placeholder={"CODE-001\nCODE-002\nCODE-003"}
              />
            </div>
            <button
              type="button"
              onClick={handlePasteImport}
              disabled={pasting || wheelItems.length === 0}
              className="inline-flex items-center gap-2 rounded-full bg-primary px-5 py-2.5 text-sm font-bold text-on-primary shadow-md shadow-primary/20 disabled:cursor-not-allowed disabled:opacity-60"
            >
              <ClipboardPaste className="h-4 w-4" />
              {pasting ? "Importing..." : "Import pasted codes"}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
