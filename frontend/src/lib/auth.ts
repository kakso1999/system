import Cookies from "js-cookie";

export function setAuth(token: string, role: "admin" | "staff", refreshToken?: string) {
  Cookies.set("token", token, { expires: 7 });
  Cookies.set("role", role, { expires: 7 });
  if (refreshToken) {
    Cookies.set("refresh_token", refreshToken, { expires: 7 });
  }
}

export function clearAuth() {
  Cookies.remove("token");
  Cookies.remove("role");
  Cookies.remove("refresh_token");
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
