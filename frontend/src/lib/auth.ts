// Auth state helper — post-HttpOnly-cookie migration.
// Tokens live in HttpOnly cookies set by the backend. This module only stores
// non-sensitive UI hints (role, must_change_password) in localStorage.

export type AuthRole = "admin" | "staff";

const AUTH_ROLES: AuthRole[] = ["admin", "staff"];

function roleKey(role: AuthRole) {
  return `gr_${role}_role`;
}

function mustChangeKey(role: AuthRole) {
  return `gr_${role}_must_change_password`;
}

function safeLocalStorage(): Storage | null {
  if (typeof window === "undefined") return null;
  try {
    return window.localStorage;
  } catch {
    return null;
  }
}

export function setAuth(role: AuthRole, mustChangePassword?: boolean) {
  const store = safeLocalStorage();
  if (!store) return;
  store.setItem(roleKey(role), role);
  if (mustChangePassword !== undefined) {
    store.setItem(mustChangeKey(role), mustChangePassword ? "1" : "0");
  }
}

export function clearAuth(role?: AuthRole) {
  const store = safeLocalStorage();
  if (!store) return;
  const prefixes: AuthRole[] = role ? [role] : AUTH_ROLES;
  prefixes.forEach((prefix) => {
    store.removeItem(roleKey(prefix));
    store.removeItem(mustChangeKey(prefix));
  });
}

export function getRole(): AuthRole | undefined {
  const store = safeLocalStorage();
  if (!store) return undefined;
  if (store.getItem(roleKey("admin"))) return "admin";
  if (store.getItem(roleKey("staff"))) return "staff";
  return undefined;
}

export function isAuthenticated(role?: AuthRole): boolean {
  const store = safeLocalStorage();
  if (!store) return false;
  if (role) return store.getItem(roleKey(role)) === role;
  return !!(store.getItem(roleKey("admin")) || store.getItem(roleKey("staff")));
}

// Compat shims — tokens live in HttpOnly cookies now; these exist so api.ts's
// existing request interceptor naturally skips attaching Authorization headers.
export function getAdminToken(): string | undefined {
  return undefined;
}

export function getStaffToken(): string | undefined {
  return undefined;
}

export function getToken(_role?: AuthRole): string | undefined {
  return undefined;
}

export function getRefreshToken(_role?: AuthRole): string | undefined {
  return undefined;
}
