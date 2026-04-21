const PREFIX = "promo_session_token:";

export function readSessionToken(code: string): string | null {
  if (typeof window === "undefined") return null;
  try {
    return window.sessionStorage.getItem(PREFIX + code);
  } catch {
    return null;
  }
}

export function writeSessionToken(code: string, token: string): void {
  if (typeof window === "undefined") return;
  try {
    window.sessionStorage.setItem(PREFIX + code, token);
  } catch {
    // ignore quota / incognito errors
  }
}

export function clearSessionToken(code: string): void {
  if (typeof window === "undefined") return;
  try {
    window.sessionStorage.removeItem(PREFIX + code);
  } catch {
    // ignore
  }
}
