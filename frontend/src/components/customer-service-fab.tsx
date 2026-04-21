"use client";

import { useEffect, useState, type ReactNode } from "react";
import { MessageCircle, Phone, Send, X } from "lucide-react";
import { getPublicSettings, type PublicSettings } from "@/lib/public-settings";

function hasChannels(settings: PublicSettings | null) {
  if (!settings) return false;
  return Boolean(settings.customer_service_whatsapp.trim() || settings.customer_service_telegram.trim());
}

function ChannelLink(props: { href: string; title: string; icon: ReactNode }) {
  return (
    <a
      href={props.href}
      target="_blank"
      rel="noreferrer"
      className="flex h-11 w-11 items-center justify-center rounded-full bg-surface-container-low text-primary transition-colors hover:bg-primary/10"
      title={props.title}
    >
      {props.icon}
    </a>
  );
}

function FabPanel({ settings }: { settings: PublicSettings }) {
  const whatsapp = settings.customer_service_whatsapp.trim();
  const telegram = settings.customer_service_telegram.trim();

  return (
    <div className="rounded-2xl bg-surface-container-lowest p-3 shadow-xl">
      <div className="flex items-center gap-2">
        {whatsapp && <ChannelLink href={whatsapp} title="WhatsApp" icon={<Phone className="h-5 w-5" />} />}
        {telegram && <ChannelLink href={telegram} title="Telegram" icon={<Send className="h-5 w-5" />} />}
      </div>
    </div>
  );
}

export default function CustomerServiceFab() {
  const [settings, setSettings] = useState<PublicSettings | null>(null);
  const [open, setOpen] = useState(false);

  useEffect(() => {
    let active = true;
    getPublicSettings().then((data) => {
      if (active) setSettings(data);
    });
    return () => {
      active = false;
    };
  }, []);

  if (!settings || !settings.customer_service_enabled || !hasChannels(settings)) {
    return null;
  }

  return (
    <div className="fixed bottom-6 right-6 z-50 flex flex-col items-end gap-3">
      {open && <FabPanel settings={settings} />}
      <button
        type="button"
        onClick={() => setOpen((current) => !current)}
        className="bg-primary text-on-primary rounded-full w-14 h-14 shadow-lg transition-transform hover:scale-[1.03]"
        aria-label="Customer service"
      >
        <span className="flex items-center justify-center">
          {open ? <X className="h-6 w-6" /> : <MessageCircle className="h-6 w-6" />}
        </span>
      </button>
    </div>
  );
}
