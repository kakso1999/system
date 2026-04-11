import axios from "axios";
import { clearAuth, getRefreshToken, getRole, getToken, setAuth } from "@/lib/auth";

const FALLBACK_API_URL = "http://localhost:3005";
const baseURL = (process.env.NEXT_PUBLIC_API_URL || FALLBACK_API_URL).replace(/\/+$/, "");

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

api.interceptors.request.use((config) => {
  const token = getToken();
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

let isRefreshing = false;
let failedQueue: Array<{ resolve: (token: string) => void; reject: (err: unknown) => void }> = [];

function processQueue(error: unknown, token: string | null) {
  failedQueue.forEach((p) => {
    if (token) p.resolve(token);
    else p.reject(error);
  });
  failedQueue = [];
}

function redirectToLogin(role?: string) {
  if (typeof window !== "undefined" && !window.location.pathname.includes("login")) {
    window.location.replace(role === "admin" ? "/admin-login" : "/staff-login");
  }
}

function isLoginCall(url: string) {
  return url.includes("/api/auth/admin/login") || url.includes("/api/auth/staff/login");
}

api.interceptors.response.use(
  (res) => res,
  async (err) => {
    const originalRequest = err.config as {
      _retry?: boolean;
      url?: string;
      headers?: Record<string, string>;
    } | undefined;
    const role = getRole();

    if (err.response?.status !== 401 || !originalRequest) {
      return Promise.reject(err);
    }

    const url = String(originalRequest.url || "");
    if (isLoginCall(url)) {
      return Promise.reject(err);
    }

    const isRefreshCall = url.includes("/api/auth/admin/refresh") || url.includes("/api/auth/staff/refresh");
    if (isRefreshCall || originalRequest._retry) {
      clearAuth();
      redirectToLogin(role);
      return Promise.reject(err);
    }

    const refreshToken = getRefreshToken();
    if (refreshToken && role) {
      if (isRefreshing) {
        return new Promise((resolve, reject) => {
          failedQueue.push({
            resolve: (token: string) => {
              originalRequest.headers = originalRequest.headers || {};
              originalRequest.headers.Authorization = `Bearer ${token}`;
              resolve(api(originalRequest));
            },
            reject,
          });
        });
      }

      originalRequest._retry = true;
      isRefreshing = true;
      try {
        const refreshUrl = role === "admin" ? "/api/auth/admin/refresh" : "/api/auth/staff/refresh";
        const res = await refreshClient.post(refreshUrl, { refresh_token: refreshToken });
        const newToken = res.data.access_token;
        setAuth(newToken, role as "admin" | "staff", res.data.refresh_token);
        processQueue(null, newToken);
        originalRequest.headers = originalRequest.headers || {};
        originalRequest.headers.Authorization = `Bearer ${newToken}`;
        return api(originalRequest);
      } catch (refreshErr) {
        processQueue(refreshErr, null);
        clearAuth();
        redirectToLogin(role);
        return Promise.reject(refreshErr);
      } finally {
        isRefreshing = false;
      }
    }

    clearAuth();
    redirectToLogin(role);
    return Promise.reject(err);
  }
);

export default api;
