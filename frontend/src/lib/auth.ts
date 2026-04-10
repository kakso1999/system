import Cookies from "js-cookie";

function isSecureContext() {
  return typeof window !== "undefined" && window.location.protocol === "https:";
}

function getCookieOptions() {
  return {
    expires: 7,
    path: "/",
    sameSite: "lax" as const,
    secure: isSecureContext(),
  };
}

function getCookieRemovalOptions() {
  return {
    path: "/",
    sameSite: "lax" as const,
    secure: isSecureContext(),
  };
}

export function setAuth(token: string, role: "admin" | "staff", refreshToken?: string) {
  const options = getCookieOptions();
  Cookies.set("token", token, options);
  Cookies.set("role", role, options);
  if (refreshToken) {
    Cookies.set("refresh_token", refreshToken, options);
    return;
  }
  Cookies.remove("refresh_token", getCookieRemovalOptions());
}

export function clearAuth() {
  const options = getCookieRemovalOptions();
  Cookies.remove("token", options);
  Cookies.remove("role", options);
  Cookies.remove("refresh_token", options);
}

export function getRole(): string | undefined {
  return Cookies.get("role");
}

export function getToken(): string | undefined {
  return Cookies.get("token");
}

export function getRefreshToken(): string | undefined {
  return Cookies.get("refresh_token");
}

export function isAuthenticated(): boolean {
  return !!Cookies.get("token");
}
