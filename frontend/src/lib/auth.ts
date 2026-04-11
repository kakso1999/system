import Cookies from "js-cookie";

export type AuthRole = "admin" | "staff";

const AUTH_ROLES: AuthRole[] = ["admin", "staff"];

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

function getCookieName(prefix: string, name: "token" | "role" | "refresh_token") {
  return `${prefix}_${name}`;
}

export function setAuth(token: string, role: AuthRole, refreshToken?: string) {
  const options = getCookieOptions();
  Cookies.set(getCookieName(role, "token"), token, options);
  Cookies.set(getCookieName(role, "role"), role, options);
  if (refreshToken) {
    Cookies.set(getCookieName(role, "refresh_token"), refreshToken, options);
    return;
  }
  Cookies.remove(getCookieName(role, "refresh_token"), getCookieRemovalOptions());
}

export function clearAuth(role?: string) {
  const options = getCookieRemovalOptions();
  const prefixes = role ? [role] : AUTH_ROLES;
  prefixes.forEach((prefix) => {
    Cookies.remove(getCookieName(prefix, "token"), options);
    Cookies.remove(getCookieName(prefix, "role"), options);
    Cookies.remove(getCookieName(prefix, "refresh_token"), options);
  });
}

export function getRole(): string | undefined {
  if (Cookies.get(getCookieName("admin", "token"))) {
    return "admin";
  }
  if (Cookies.get(getCookieName("staff", "token"))) {
    return "staff";
  }
  return undefined;
}

export function getToken(role?: string): string | undefined {
  if (role) {
    return Cookies.get(getCookieName(role, "token"));
  }
  return getAdminToken() || getStaffToken();
}

export function getRefreshToken(role?: string): string | undefined {
  if (role) {
    return Cookies.get(getCookieName(role, "refresh_token"));
  }
  const currentRole = getRole();
  return currentRole ? Cookies.get(getCookieName(currentRole, "refresh_token")) : undefined;
}

export function isAuthenticated(role?: string): boolean {
  if (role) {
    return !!Cookies.get(getCookieName(role, "token"));
  }
  return !!getAdminToken() || !!getStaffToken();
}

export function getAdminToken(): string | undefined {
  return Cookies.get(getCookieName("admin", "token"));
}

export function getStaffToken(): string | undefined {
  return Cookies.get(getCookieName("staff", "token"));
}
