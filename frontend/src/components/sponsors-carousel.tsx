"use client";

import { useEffect, useState } from "react";
import api from "@/lib/api";

type SponsorPublic = {
  id: string;
  name: string;
  logo_url: string;
  link_url: string;
  sort_order: number;
};

type SponsorsCarouselProps = {
  variant?: "auth" | "wheel" | "compact";
};

const variantClasses: Record<NonNullable<SponsorsCarouselProps["variant"]>, string> = {
  auth: "rounded-2xl bg-surface-container-lowest px-4 py-3 shadow-sm",
  wheel: "mt-8 rounded-2xl bg-surface-container-lowest px-4 py-3 shadow-sm",
  compact: "rounded-2xl bg-surface-container-lowest px-4 py-3 shadow-sm",
};

function SponsorCard({ item }: { item: SponsorPublic }) {
  return (
    <a href={item.link_url || undefined} target={item.link_url ? "_blank" : undefined} rel={item.link_url ? "noreferrer" : undefined} className="flex min-w-[140px] shrink-0 items-center justify-center rounded-xl bg-surface-container-low px-4 py-3">
      <img src={item.logo_url} alt={item.name} className="h-12 w-auto object-contain" />
    </a>
  );
}

function useSponsors() {
  const [items, setItems] = useState<SponsorPublic[]>([]);
  useEffect(() => {
    let active = true;
    api.get<SponsorPublic[]>("/api/sponsors/active")
      .then((res) => {
        if (active) setItems(res.data || []);
      })
      .catch(() => {
        if (active) setItems([]);
      });
    return () => {
      active = false;
    };
  }, []);
  return items;
}

function Track({ items }: { items: SponsorPublic[] }) {
  const [activeIndex, setActiveIndex] = useState(0);
  const ordered = items.length > 1 ? items.map((_, index) => items[(activeIndex + index) % items.length]) : items;

  useEffect(() => {
    if (items.length <= 1) return;
    const timer = window.setInterval(() => setActiveIndex((current) => (current + 1) % items.length), 3000);
    return () => window.clearInterval(timer);
  }, [items]);

  return <div className="flex items-center gap-6">{ordered.map((item) => <SponsorCard key={item.id} item={item} />)}</div>;
}

export default function SponsorsCarousel({ variant = "compact" }: SponsorsCarouselProps) {
  const items = useSponsors();

  if (items.length === 0) return null;

  return (
    <div className={variantClasses[variant]}>
      <div className="mb-2 text-center text-xs font-bold uppercase tracking-[0.2em] text-on-surface-variant">Sponsors</div>
      <div className="overflow-hidden"><Track items={items} /></div>
    </div>
  );
}
