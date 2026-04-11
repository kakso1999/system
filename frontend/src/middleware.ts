import { NextRequest, NextResponse } from "next/server";

const BACKEND = "http://localhost:3005";

export function middleware(request: NextRequest) {
  const { pathname, search } = request.nextUrl;

  if (pathname.startsWith("/api/") || pathname.startsWith("/uploads/")) {
    const target = new URL(pathname + search, BACKEND);
    return NextResponse.rewrite(target);
  }

  return NextResponse.next();
}

export const config = {
  matcher: ["/api/:path*", "/uploads/:path*"],
};
