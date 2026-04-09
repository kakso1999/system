import axios from "axios";
import Cookies from "js-cookie";
import { setAuth, clearAuth } from "@/lib/auth";

const api = axios.create({
  baseURL: process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000",
  headers: { "Content-Type": "application/json" },
});

api.interceptors.request.use((config) => {
  const token = Cookies.get("token");
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

api.interceptors.response.use(
  (res) => res,
  async (err) => {
    const originalRequest = err.config;
    if (err.response?.status === 401 && !originalRequest._retry) {
      const refreshToken = Cookies.get("refresh_token");
      const role = Cookies.get("role");
      if (refreshToken && role) {
        if (isRefreshing) {
          return new Promise((resolve, reject) => {
            failedQueue.push({
              resolve: (token: string) => {
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
          const res = await api.post(refreshUrl, { refresh_token: refreshToken });
          const newToken = res.data.access_token;
          setAuth(newToken, role as "admin" | "staff", res.data.refresh_token);
          processQueue(null, newToken);
          originalRequest.headers.Authorization = `Bearer ${newToken}`;
          return api(originalRequest);
        } catch (refreshErr) {
          processQueue(refreshErr, null);
          clearAuth();
          if (typeof window !== "undefined" && !window.location.pathname.includes("login")) {
            window.location.href = role === "admin" ? "/admin-login" : "/staff-login";
          }
          return Promise.reject(refreshErr);
        } finally {
          isRefreshing = false;
        }
      }
      clearAuth();
      if (typeof window !== "undefined" && !window.location.pathname.includes("login")) {
        window.location.href = role === "admin" ? "/admin-login" : "/staff-login";
      }
    }
    return Promise.reject(err);
  }
);

export default api;
