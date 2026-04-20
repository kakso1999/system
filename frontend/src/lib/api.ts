import axios from "axios";
import { type AuthRole, clearAuth, getAdminToken, getRefreshToken, getStaffToken, setAuth } from "@/lib/auth";

type RetryRequestConfig = {
  _retry?: boolean;
  url?: string;
  headers?: Record<string, string>;
};

type QueueItem = {
  resolve: (token: string) => void;
  reject: (error: unknown) => void;
};

type RefreshState = {
  isRefreshing: boolean;
  failedQueue: QueueItem[];
};

const FALLBACK_API_URL = "";
const baseURL = (process.env.NEXT_PUBLIC_API_URL ?? FALLBACK_API_URL).replace(/\/+$/, "");

export function resolveApiUrl(path?: string | null) {
  if (!path) {
    return "";
  }
  if (/^https?:\/\//i.test(path)) {
    return path;
  }
  const normalizedPath = path.startsWith("/") ? path : `/${path}`;
  return `${baseURL}${normalizedPath}`;
}

const api = axios.create({
  baseURL,
  headers: { "Content-Type": "application/json" },
});

const refreshClient = axios.create({
  baseURL,
  headers: { "Content-Type": "application/json" },
});

const refreshState: Record<AuthRole, RefreshState> = {
  admin: { isRefreshing: false, failedQueue: [] },
  staff: { isRefreshing: false, failedQueue: [] },
};

function isAdminRequest(url: string) {
  return url.includes("/api/admin/") || url.includes("/api/auth/admin/");
}

function isStaffRequest(url: string) {
  return url.includes("/api/promoter/") || url.includes("/api/auth/staff/");
}

function isLoginCall(url: string) {
  return url.includes("/api/auth/admin/login") || url.includes("/api/auth/staff/login");
}

function isRefreshCall(url: string) {
  return url.includes("/api/auth/admin/refresh") || url.includes("/api/auth/staff/refresh");
}

function getRequestRole(url: string): AuthRole | undefined {
  if (isAdminRequest(url)) {
    return "admin";
  }
  if (isStaffRequest(url)) {
    return "staff";
  }
  return undefined;
}

function getTokenForRequest(url: string) {
  const role = getRequestRole(url);
  if (role === "admin") {
    return getAdminToken();
  }
  if (role === "staff") {
    return getStaffToken();
  }
  return getAdminToken() || getStaffToken();
}

function getRoleFromHeader(authorization?: string): AuthRole | undefined {
  if (!authorization?.startsWith("Bearer ")) {
    return undefined;
  }
  const token = authorization.slice("Bearer ".length);
  if (token && token === getAdminToken()) {
    return "admin";
  }
  if (token && token === getStaffToken()) {
    return "staff";
  }
  return undefined;
}

function inferRoleFromPath(pathname: string): AuthRole | undefined {
  const adminPaths = ["/dashboard", "/staff", "/admins", "/campaigns", "/claims", "/finance", "/risk-control", "/settings"];
  if (adminPaths.some((path) => pathname.startsWith(path))) {
    return "admin";
  }

  const staffPaths = ["/home", "/qrcode", "/team", "/commission", "/wallet"];
  if (staffPaths.some((path) => pathname.startsWith(path))) {
    return "staff";
  }

  return undefined;
}

function getRoleForFailedRequest(url: string, authorization?: string): AuthRole | undefined {
  return getRequestRole(url) || getRoleFromHeader(authorization);
}

function getLoginPath(role?: AuthRole) {
  return role === "admin" ? "/admin-login" : "/staff-login";
}

function redirectToLogin(role?: AuthRole) {
  if (typeof window === "undefined" || window.location.pathname.includes("login")) {
    return;
  }
  const resolvedRole = role || inferRoleFromPath(window.location.pathname);
  window.location.replace(getLoginPath(resolvedRole));
}

function handleAuthFailure(role?: AuthRole) {
  const resolvedRole =
    role || (typeof window !== "undefined" ? inferRoleFromPath(window.location.pathname) : undefined);

  if (resolvedRole) {
    clearAuth(resolvedRole);
  } else {
    clearAuth();
  }
  redirectToLogin(resolvedRole);
}

function processQueue(role: AuthRole, error: unknown, token: string | null) {
  refreshState[role].failedQueue.forEach((request) => {
    if (token) {
      request.resolve(token);
      return;
    }
    request.reject(error);
  });
  refreshState[role].failedQueue = [];
}

function setAuthorizationHeader(config: RetryRequestConfig, token: string) {
  config.headers = config.headers || {};
  config.headers.Authorization = `Bearer ${token}`;
}

function queueRequest(role: AuthRole, originalRequest: RetryRequestConfig) {
  return new Promise((resolve, reject) => {
    refreshState[role].failedQueue.push({
      resolve: (token: string) => {
        setAuthorizationHeader(originalRequest, token);
        resolve(api(originalRequest));
      },
      reject,
    });
  });
}

async function refreshAccessToken(role: AuthRole, refreshToken: string) {
  const refreshUrl = role === "admin" ? "/api/auth/admin/refresh" : "/api/auth/staff/refresh";
  const response = await refreshClient.post(refreshUrl, { refresh_token: refreshToken });
  const nextToken = response.data.access_token;
  setAuth(nextToken, role, response.data.refresh_token);
  return nextToken;
}

async function retryWithRefresh(role: AuthRole, refreshToken: string, originalRequest: RetryRequestConfig) {
  if (refreshState[role].isRefreshing) {
    return queueRequest(role, originalRequest);
  }

  originalRequest._retry = true;
  refreshState[role].isRefreshing = true;
  try {
    const nextToken = await refreshAccessToken(role, refreshToken);
    processQueue(role, null, nextToken);
    setAuthorizationHeader(originalRequest, nextToken);
    return api(originalRequest);
  } catch (error) {
    processQueue(role, error, null);
    handleAuthFailure(role);
    return Promise.reject(error);
  } finally {
    refreshState[role].isRefreshing = false;
  }
}

async function handleResponseError(error: unknown) {
  const axiosError = error as { response?: { status?: number }; config?: RetryRequestConfig };
  const originalRequest = axiosError.config;

  if (axiosError.response?.status !== 401 || !originalRequest) {
    return Promise.reject(error);
  }

  const url = String(originalRequest.url || "");
  if (isLoginCall(url)) {
    return Promise.reject(error);
  }

  const role = getRoleForFailedRequest(url, originalRequest.headers?.Authorization);
  if (isRefreshCall(url) || originalRequest._retry) {
    handleAuthFailure(role);
    return Promise.reject(error);
  }

  const refreshToken = role ? getRefreshToken(role) : undefined;
  if (!role || !refreshToken) {
    handleAuthFailure(role);
    return Promise.reject(error);
  }

  return retryWithRefresh(role, refreshToken, originalRequest);
}

api.interceptors.request.use((config) => {
  const url = String(config.url || "");
  if (isLoginCall(url) || isRefreshCall(url)) {
    return config;
  }

  const token = getTokenForRequest(url);
  if (token) {
    config.headers = config.headers || {};
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

api.interceptors.response.use((response) => response, handleResponseError);

export default api;
