import { type NextRequest, NextResponse } from "next/server";
import { createServerClient } from "@supabase/ssr";
import type { Database } from "@/lib/types/database.types";

// Same bound used by lib/auth/roles.ts's getCurrentProfile() — a
// previous version of this app removed middleware entirely after
// an unbounded getUser() call there caused mobile hangs on a
// stale/invalid refresh token. Reintroducing middleware here uses the
// identical timeout + fail-open guard for that exact reason.
const AUTH_CHECK_TIMEOUT_MS = 2500;

// Requirement: do not call getUser() on /, /login, /auth/callback,
// /youtube, /twitch, /streamer. This isn't just "don't write code
// that checks those paths" — the matcher below means Next.js never
// invokes this function at all for anything outside /creator and
// /admin, so there's no code path here that could touch those routes
// even by mistake.
export async function middleware(request: NextRequest) {
  const response = NextResponse.next({ request });

  const supabase = createServerClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet) {
          // Standard refresh-token rotation pattern: if getUser()
          // below refreshes an expiring session, the new cookies get
          // written onto both the outgoing request (so the rest of
          // this request sees them) and the response (so the browser
          // does). This never deletes a cookie — only ever sets one.
          cookiesToSet.forEach(({ name, value, options }) => {
            request.cookies.set(name, value);
            response.cookies.set(name, value, options);
          });
        },
      },
    }
  );

  let signedIn = false;
  try {
    const result = await Promise.race([
      supabase.auth.getUser(),
      new Promise<never>((_, reject) =>
        setTimeout(() => reject(new Error("auth check timed out")), AUTH_CHECK_TIMEOUT_MS)
      ),
    ]);
    signedIn = !result.error && !!result.data.user;
  } catch {
    // Timed out, or getUser() itself threw (e.g. malformed cookie) —
    // fail open the same way getCurrentProfile() does: treat as
    // signed out rather than hang the request. Requirement: this
    // never deletes the sb- cookies itself either way — it just
    // redirects. Any actual bad-cookie cleanup is still handled by
    // getCurrentProfile() (server-side) and components/session-guard.tsx
    // (client-side), unchanged.
    signedIn = false;
  }

  if (!signedIn) {
    return NextResponse.redirect(new URL("/login", request.url));
  }

  // Note: this only confirms the visitor is signed in — the actual
  // creator/streamer role check still happens in
  // requireCreatorOrStreamer() / requireCreator() at the page level
  // (lib/auth/roles.ts), unchanged. Keeping middleware to an auth-only
  // check (no profiles query) keeps it fast and avoids adding a DB
  // round trip to every /creator or /admin request.
  return response;
}

// Only these two path prefixes ever invoke middleware() above — every
// other route (/, /login, /auth/callback, /youtube, /twitch,
// /streamer, /videos, etc.) is completely untouched by this file.
export const config = {
  matcher: ["/creator/:path*", "/admin/:path*"],
};
