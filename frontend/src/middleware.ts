import { NextRequest, NextResponse } from "next/server";

const DEFAULT_BACKEND_URL = "http://localhost:3005";
const backendUrl = new URL(process.env.BACKEND_URL ?? DEFAULT_BACKEND_URL);

export function middleware(request: NextRequest) {
  const { pathname, search } = request.nextUrl;

  if (pathname.startsWith("/api/") || pathname.startsWith("/uploads/")) {
    const target = new URL(`${pathname}${search}`, backendUrl);
    return NextResponse.rewrite(target);
  }

  return NextResponse.next();
}

export const config = {
  matcher: ["/api/:path*", "/uploads/:path*"],
};
