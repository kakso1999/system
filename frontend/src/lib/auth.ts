import Cookies from "js-cookie";

const COOKIE_OPTS = { expires: 7, path: "/", sameSite: "lax" as const };

export function setAuth(token: string, role: "admin" | "staff", refreshToken?: string) {
  Cookies.set("token", token, COOKIE_OPTS);
  Cookies.set("role", role, COOKIE_OPTS);
  if (refreshToken) {
    Cookies.set("refresh_token", refreshToken, COOKIE_OPTS);
  }
}

export function clearAuth() {
  Cookies.remove("token", { path: "/" });
  Cookies.remove("role", { path: "/" });
  Cookies.remove("refresh_token", { path: "/" });
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
