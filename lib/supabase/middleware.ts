import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
import type { Database } from "@/lib/types/database.types";

// Requirement 1/3: keep this fast and never let a slow or
// unreachable Supabase Auth endpoint hang the whole request. This is
// the actual fix for the 504 MIDDLEWARE_INVOCATION_TIMEOUT — the
// getUser() call below previously had no timeout at all, so it could
// hang indefinitely and take every matched route (including the
// homepage) down with it.
const AUTH_CHECK_TIMEOUT_MS = 2500;

// Refreshes the Supabase auth session cookie on every request so that
// Server Components see an up-to-date session. Called from
// middleware.ts at the project root. Fails open: if the auth check
// doesn't come back within AUTH_CHECK_TIMEOUT_MS, this gives up on
// refreshing the cookie for this one request and lets it through
// unmodified rather than blocking. Real auth/role enforcement lives
// in the page-level checks (lib/auth/roles.ts's getCurrentProfile/
// requireCreator), which run independently — this is purely a
// best-effort cookie refresh, never a gate.
export async function updateSession(request: NextRequest) {
  let response = NextResponse.next({ request });

  const supabase = createServerClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value }) =>
            request.cookies.set(name, value)
          );
          response = NextResponse.next({ request });
          cookiesToSet.forEach(({ name, value, options }) =>
            response.cookies.set(name, value, options)
          );
        },
      },
    }
  );

  try {
    // getUser() (not getSession()) validates the token against the
    // Supabase server rather than trusting the cookie alone — kept
    // as-is, just bounded by a timeout now. If Supabase answers in
    // time, cookies are refreshed as before; if not, we move on.
    await Promise.race([
      supabase.auth.getUser(),
      new Promise((_, reject) =>
        setTimeout(
          () => reject(new Error("auth check timed out")),
          AUTH_CHECK_TIMEOUT_MS
        )
      ),
    ]);
  } catch {
    // Timed out, or Supabase Auth errored — fail open. The request
    // proceeds with whatever session cookie it already had; the page
    // itself will do its own (separate, unbounded-by-this-timeout)
    // auth check when it renders.
  }

  return response;
}
