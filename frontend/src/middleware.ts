import { NextRequest, NextResponse } from "next/server";

const DEFAULT_BACKEND_URL = "http://localhost:3005";
const backendUrl = new URL(process.env.BACKEND_URL ?? DEFAULT_BACKEND_URL);

function pickClientIp(request: NextRequest): string {
  const forwarded = request.headers.get("x-forwarded-for");
  if (forwarded) return forwarded.split(",")[0].trim();
  const real = request.headers.get("x-real-ip");
  if (real) return real.trim();
  return (request as NextRequest & { ip?: string }).ip || "";
}

export function middleware(request: NextRequest) {
  const { pathname, search } = request.nextUrl;

  if (pathname.startsWith("/api/") || pathname.startsWith("/uploads/")) {
    const clientIp = pickClientIp(request);
    const headers = new Headers(request.headers);
    const existingXff = request.headers.get("x-forwarded-for");
    const newXff =
      existingXff && clientIp
        ? `${existingXff}, ${clientIp}`
        : clientIp || existingXff || "";
    if (newXff) headers.set("x-forwarded-for", newXff);
    if (clientIp) headers.set("x-real-ip", clientIp);

    const target = new URL(`${pathname}${search}`, backendUrl);
    return NextResponse.rewrite(target, { request: { headers } });
  }

  return NextResponse.next();
}

export const config = {
  matcher: ["/api/:path*", "/uploads/:path*"],
};
