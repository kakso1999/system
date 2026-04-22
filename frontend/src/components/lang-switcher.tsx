"use client";

import { useEffect, useState } from "react";
import { LANGS, type Lang, detectLang, setLang } from "@/lib/i18n";

export default function LangSwitcher() {
  const [lang, setSelectedLang] = useState<Lang>("en");

  useEffect(() => {
    setSelectedLang(detectLang());
  }, []);

  return (
    <select
      aria-label="Language"
      className="rounded-lg border border-outline-variant/30 bg-white/90 px-3 py-1.5 text-xs font-semibold text-on-surface shadow-sm outline-none transition focus:border-primary"
      value={lang}
      onChange={(event) => {
        const nextLang = event.target.value as Lang;
        setSelectedLang(nextLang);
        setLang(nextLang);
        window.location.reload();
      }}
    >
      {LANGS.map((item) => (
        <option key={item.value} value={item.value}>
          {item.label}
        </option>
      ))}
    </select>
  );
}
