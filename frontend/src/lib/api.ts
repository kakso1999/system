import axios from "axios";
import Cookies from "js-cookie";

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

api.interceptors.response.use(
  (res) => res,
  (err) => {
    if (err.response?.status === 401) {
      const role = Cookies.get("role");
      Cookies.remove("token");
      Cookies.remove("role");
      if (typeof window !== "undefined" && !window.location.pathname.includes("login")) {
        window.location.href = role === "admin" ? "/admin-login" : "/staff-login";
      }
    }
    return Promise.reject(err);
  }
);

export default api;
