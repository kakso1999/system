export type Lang = "en" | "zh" | "tl";

const DICTS: Record<Lang, Record<string, string>> = {
  en: {
    "welcome.title": "Welcome",
    "welcome.scan_to_claim": "Scan to claim your prize",
    "wheel.spin_now": "SPIN NOW",
    "wheel.spinning": "SPINNING...",
    "otp.send_code": "SEND VERIFICATION CODE",
    "otp.verify": "VERIFY CODE",
    "otp.change_number": "Change number",
    "otp.resend_in": "Resend in {s}s",
    "otp.resend": "Resend Code",
    "claim.success": "Prize claimed successfully!",
    "claim.failed": "Claim failed",
  },
  zh: {
    "welcome.title": "欢迎",
    "welcome.scan_to_claim": "扫码领取奖品",
    "wheel.spin_now": "立即抽奖",
    "wheel.spinning": "抽奖中...",
    "otp.send_code": "发送验证码",
    "otp.verify": "验证",
    "otp.change_number": "更换号码",
    "otp.resend_in": "{s}秒后重发",
    "otp.resend": "重发验证码",
    "claim.success": "奖品领取成功！",
    "claim.failed": "领取失败",
  },
  tl: {
    "welcome.title": "Maligayang pagdating",
    "welcome.scan_to_claim": "I-scan upang i-claim ang iyong premyo",
    "wheel.spin_now": "IKOT NA",
    "wheel.spinning": "UMIIKOT...",
    "otp.send_code": "IPADALA ANG CODE",
    "otp.verify": "BERIPIKAHIN",
    "otp.change_number": "Palitan ang numero",
    "otp.resend_in": "I-resend sa {s}s",
    "otp.resend": "Ipadala Muli",
    "claim.success": "Matagumpay ang pag-claim!",
    "claim.failed": "Nabigo ang pag-claim",
  },
};

const LANG_KEY = "gr_lang";

export function detectLang(): Lang {
  if (typeof window === "undefined") return "en";
  const stored = window.localStorage.getItem(LANG_KEY) as Lang | null;
  if (stored && DICTS[stored]) return stored;
  const nav = (window.navigator.language || "").toLowerCase();
  if (nav.startsWith("zh")) return "zh";
  if (nav.startsWith("tl") || nav.startsWith("fil")) return "tl";
  return "en";
}

export function setLang(lang: Lang) {
  if (typeof window !== "undefined") window.localStorage.setItem(LANG_KEY, lang);
}

export function t(key: string, vars: Record<string, string | number> = {}, lang?: Lang): string {
  const currentLang = lang || detectLang();
  let text = DICTS[currentLang][key] || DICTS.en[key] || key;
  for (const [name, value] of Object.entries(vars)) text = text.replace(`{${name}}`, String(value));
  return text;
}

export const LANGS: { value: Lang; label: string }[] = [
  { value: "en", label: "English" },
  { value: "zh", label: "中文" },
  { value: "tl", label: "Tagalog" },
];
