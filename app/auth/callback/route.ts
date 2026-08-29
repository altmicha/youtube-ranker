import { type NextRequest, NextResponse } from "next/server";
import { createServerClient } from "@supabase/ssr";
import type { Database } from "@/lib/types/database.types";

// Handles the redirect back from Google OAuth and email confirmation
// links, exchanging the ?code= param for a session cookie.
//
// Deliberately does NOT reuse lib/supabase/server.ts's createClient()
// here. That client's cookie adapter writes through next/headers'
// ambient cookies() store, wrapped in a try/catch that's meant to
// safely no-op when called from a plain Server Component render
// (which genuinely can't write cookies at all) — but that same
// try/catch was also silently swallowing a real cookie-write failure
// when this route used it, so the OAuth exchange looked successful
// (200/307, nothing in the logs) while no session cookie ever
// actually got attached to the redirect response.
//
// Fix: build the response we're going to return FIRST, then give the
// Supabase client's cookie adapter a setAll() that writes directly
// onto that exact response object (response.cookies.set(...)) —
// never through the ambient next/headers store. That removes the
// failure mode entirely: there's no separate store that could get out
// of sync with what's actually sent to the browser. This never used
// redirect() from next/navigation (that throws to unwind the render
// tree — it isn't meaningful in a Route Handler at all); it's always
// been NextResponse.redirect, kept that way here too.
export async function GET(request: NextRequest) {
  const { searchParams, origin } = new URL(request.url);
  const code = searchParams.get("code");
  const next = searchParams.get("next") ?? "/";

  if (!code) {
    return NextResponse.redirect(`${origin}/login?error=Could not sign in`);
  }

  // Built before the exchange runs, so setAll() below always has a
  // concrete response to write onto.
  const response = NextResponse.redirect(`${origin}${next}`);

  const supabase = createServerClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value, options }) =>
            response.cookies.set(name, value, options)
          );
        },
      },
    }
  );

  const { error } = await supabase.auth.exchangeCodeForSession(code);

  if (error) {
    return NextResponse.redirect(`${origin}/login?error=Could not sign in`);
  }

  // The session cookies exchangeCodeForSession() triggered are
  // already on `response` via setAll() above.
  return response;
}
