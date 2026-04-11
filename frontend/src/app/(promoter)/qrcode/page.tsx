"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { ArrowLeft, Copy } from "lucide-react";
import { QRCodeSVG } from "qrcode.react";
import api from "@/lib/api";
import { copyToClipboard } from "@/lib/clipboard";

export default function QRCodePage() {
  const router = useRouter();
  const [qrData, setQrData] = useState<{ qr_data: string; invite_code: string; staff_no: string } | null>(null);

  useEffect(() => { loadQR(); }, []);

  const loadQR = async () => {
    try {
      const res = await api.get("/api/promoter/qrcode");
      setQrData(res.data);
    } catch {
      router.push("/staff-login");
    }
  };

  const qrUrl = qrData && typeof window !== "undefined" ? `${window.location.origin}${qrData.qr_data}` : "";

  const copyLink = async () => {
    await copyToClipboard(qrUrl);
    alert("Link copied!");
  };

  if (!qrData) {
    return <div className="min-h-screen flex items-center justify-center bg-surface text-on-surface-variant">Loading...</div>;
  }

  return (
    <div className="min-h-screen bg-surface pb-24">
      <header className="fixed top-0 w-full z-50 bg-white/70 backdrop-blur-md shadow-sm">
        <div className="flex justify-between items-center px-6 h-16 max-w-7xl mx-auto">
          <button onClick={() => router.back()} className="p-2 rounded-full hover:bg-primary/5">
            <ArrowLeft className="w-5 h-5 text-primary" />
          </button>
          <h1 className="text-xl font-bold tracking-tighter text-primary font-[var(--font-headline)]">My QR Code</h1>
          <div className="w-10" />
        </div>
      </header>

      <main className="pt-24 px-6 max-w-md mx-auto">
        <div className="text-center mb-8">
          <h2 className="text-2xl font-extrabold font-[var(--font-headline)] tracking-tight">Your Promotion Code</h2>
          <p className="text-on-surface-variant mt-2 text-sm">Share this QR code or link with potential leads</p>
        </div>

        <div className="bg-surface-container-lowest rounded-2xl p-8 shadow-sm text-center">
          {/* QR Code display */}
          <div className="bg-white p-6 rounded-2xl inline-block mb-6 shadow-inner">
            <QRCodeSVG value={qrUrl || " "} size={192} bgColor="#ffffff" fgColor="#0d47a1" level="M" includeMargin />
          </div>

          <div className="space-y-3">
            <div>
              <p className="text-xs font-bold text-on-surface-variant uppercase tracking-wider">Invite Code</p>
              <p className="text-2xl font-extrabold font-[var(--font-headline)] text-primary tracking-wider">{qrData.invite_code}</p>
            </div>
            <div>
              <p className="text-xs font-bold text-on-surface-variant uppercase tracking-wider">Staff No</p>
              <p className="text-sm font-semibold font-mono">{qrData.staff_no}</p>
            </div>
          </div>

          <div className="mt-6 space-y-3">
            <button onClick={copyLink}
              className="w-full bg-primary text-on-primary py-3 rounded-full font-bold text-sm flex items-center justify-center gap-2 shadow-md shadow-primary/20 hover:shadow-lg active:scale-[0.98] transition-all"
            >
              <Copy className="w-[18px] h-[18px]" />
              Copy Promotion Link
            </button>
          </div>

          <div className="mt-6 p-3 bg-surface-container-low rounded-xl">
            <p className="text-xs text-on-surface-variant break-all">{qrUrl}</p>
          </div>
        </div>
      </main>
    </div>
  );
}
