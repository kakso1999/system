import api from "@/lib/api";

export type PublicSettings = {
  project_name: string;
  activity_title: string;
  activity_desc: string;
  default_redirect_url: string;
  customer_service_enabled: boolean;
  customer_service_whatsapp: string;
  customer_service_telegram: string;
};

const DEFAULTS: PublicSettings = {
  project_name: "GroundRewards",
  activity_title: "Lucky Wheel",
  activity_desc: "",
  default_redirect_url: "",
  customer_service_enabled: false,
  customer_service_whatsapp: "",
  customer_service_telegram: "",
};

let cache: Promise<PublicSettings> | null = null;

export async function getPublicSettings(): Promise<PublicSettings> {
  if (!cache) {
    cache = api
      .get<PublicSettings>("/api/public/settings")
      .then((r) => ({ ...DEFAULTS, ...r.data }))
      .catch(() => DEFAULTS);
  }
  return cache;
}

export function clearPublicSettingsCache() {
  cache = null;
}
