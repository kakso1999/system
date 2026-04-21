import { NextRequest, NextResponse } from "next/server";

const DEFAULT_BACKEND_URL = "http://localhost:3005";
const backendUrl = new URL(process.env.BACKEND_URL ?? DEFAULT_BACKEND_URL);

function pickClientIp(request: NextRequest): string {
  // Intentionally do NOT read x-forwarded-for or x-real-ip from the inbound
  // request — those are attacker-controlled at the edge. Rely on runtime
  // metadata exposed by the Next.js platform (request.ip when available).
  const runtimeIp = (request as NextRequest & { ip?: string }).ip;
  return (runtimeIp || "").trim();
}

function buildHeaders(request: NextRequest, clientIp: string): Headers {
  const headers = new Headers(request.headers);
  // Strip anything the caller tried to send — we own these header names.
  headers.delete("x-forwarded-for");
  headers.delete("x-real-ip");
  if (clientIp) {
    headers.set("x-forwarded-for", clientIp);
    headers.set("x-real-ip", clientIp);
  }
  return headers;
}

export function middleware(request: NextRequest) {
  const { pathname, search } = request.nextUrl;

  if (pathname.startsWith("/api/") || pathname.startsWith("/uploads/")) {
    const clientIp = pickClientIp(request);
    const headers = buildHeaders(request, clientIp);
    const target = new URL(`${pathname}${search}`, backendUrl);
    return NextResponse.rewrite(target, { request: { headers } });
  }

  return NextResponse.next();
}

export const config = {
  matcher: ["/api/:path*", "/uploads/:path*"],
};
