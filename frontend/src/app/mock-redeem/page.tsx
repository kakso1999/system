"use client";

import { useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import { copyToClipboard } from "@/lib/clipboard";
import { getPublicSettings, type PublicSettings } from "@/lib/public-settings";

export default function MockRedeemPage() {
  const searchParams = useSearchParams();
  const code = searchParams.get("code");
  const [publicSettings, setPublicSettings] = useState<PublicSettings | null>(null);
  const [name, setName] = useState("");
  const [message, setMessage] = useState("");

  useEffect(() => {
    let active = true;
    getPublicSettings().then((settings) => {
      if (active) setPublicSettings(settings);
    });
    return () => { active = false; };
  }, []);

  const handleSubmit = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    alert("Thanks for your feedback — this is a mock page.");
    setName("");
    setMessage("");
  };

  return (
    <div className="min-h-screen bg-surface">
      <header className="fixed top-0 w-full z-50 bg-white/70 backdrop-blur-md shadow-sm">
        <div className="flex justify-center items-center h-16">
          <h1 className="text-xl font-bold tracking-tighter text-primary font-[var(--font-headline)]">{publicSettings?.project_name || "GroundRewards"}</h1>
        </div>
      </header>

      <main className="pt-24 pb-12 px-6 max-w-md mx-auto space-y-4">
        <div className="bg-surface-container-lowest rounded-xl p-6 shadow-sm text-center">
          {!code ? (
            <p className="text-on-surface-variant">No reward code provided.</p>
          ) : (
            <>
              <h2 className="text-3xl font-[var(--font-headline)] font-extrabold tracking-tight mb-3">Congrats!</h2>
              <p className="text-on-surface-variant">
                Your reward code is <span className="font-bold text-on-surface">{code}</span>. Redeem at our shop by showing this.
              </p>
            </>
          )}
        </div>

        {code && (
          <>
            <div className="rounded-2xl border-2 border-primary bg-primary/10 p-5 text-center">
              <p className="text-xs font-extrabold text-primary uppercase tracking-[0.2em] mb-2">Your Reward Code</p>
              <p className="font-mono text-3xl font-extrabold text-primary tracking-wider">{code}</p>
              <button
                onClick={() => copyToClipboard(code)}
                className="mt-3 text-sm text-primary font-bold hover:underline"
              >
                Copy Code
              </button>
            </div>

            <form onSubmit={handleSubmit} className="bg-surface-container-lowest rounded-xl p-6 shadow-sm space-y-4">
              <div>
                <h3 className="font-bold text-lg mb-2">Send Feedback</h3>
                <p className="text-on-surface-variant text-sm">Optional: share a quick note about your redeem experience.</p>
              </div>
              <input
                value={name}
                onChange={(event) => setName(event.target.value)}
                placeholder="Your name"
                className="w-full rounded-xl border border-outline/30 bg-white px-4 py-3 text-sm outline-none"
              />
              <textarea
                value={message}
                onChange={(event) => setMessage(event.target.value)}
                placeholder="Your message"
                rows={4}
                className="w-full rounded-xl border border-outline/30 bg-white px-4 py-3 text-sm outline-none resize-none"
              />
              <button
                type="submit"
                className="inline-block w-full bg-gradient-to-r from-primary to-primary-dim text-white py-4 rounded-full font-bold shadow-lg shadow-primary/20 hover:shadow-xl transition-all"
              >
                Submit Feedback
              </button>
            </form>

            <p className="text-center text-sm text-on-surface-variant">
              This is a demo redeem page. In production, the merchant&apos;s system would validate this code.
            </p>
          </>
        )}
      </main>
    </div>
  );
}
