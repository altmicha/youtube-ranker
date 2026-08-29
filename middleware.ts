import { type NextRequest, NextResponse } from "next/server";
import { updateSession } from "@/lib/supabase/middleware";

export async function middleware(request: NextRequest) {
  try {
    return await updateSession(request);
  } catch {
    // updateSession() already fails open internally (see
    // lib/supabase/middleware.ts), but this is a second, outer
    // safety net: if anything above it throws for any other reason,
    // middleware must never be the cause of a broken request — just
    // let it through unmodified rather than 500/504ing.
    return NextResponse.next();
  }
}

export const config = {
  matcher: [
    /*
     * Match all request paths except static assets, image
     * optimization files, and common static file extensions
     * (images, css, js) — requirement 6 — so the session-refresh
     * work in updateSession() never runs against a static file, only
     * actual pages (/, /category/*, /videos, /login, /creator, etc.)
     * and API routes.
     */
    "/((?!_next/static|_next/image|favicon\\.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico|css|js)$).*)",
  ],
};
