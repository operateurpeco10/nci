import { type NextRequest, NextResponse } from "next/server";
import { updateSession } from "@/lib/supabase/middleware";

export async function middleware(request: NextRequest) {
  if (request.nextUrl.pathname.startsWith("/admin")) {
    return updateSession(request);
  }
  return NextResponse.next();
}

export const config = {
  matcher: ["/admin/:path*"],
};
