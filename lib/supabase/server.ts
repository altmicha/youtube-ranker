import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import type { Database } from "@/lib/types/database.types";

// Use this client in Server Components, Server Actions, and Route Handlers.
// Must be created fresh per-request (it reads the request's cookies).
export async function createClient() {
  const cookieStore = await cookies();

  return createServerClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return cookieStore.getAll();
        },
        setAll(cookiesToSet) {
          try {
            cookiesToSet.forEach(({ name, value, options }) =>
              cookieStore.set(name, value, options)
            );
          } catch {
            // Next.js only allows cookie writes from Server Actions
            // and Route Handlers, not plain Server Component renders
            // — this fires (and is safely ignored) whenever setAll is
            // called mid-render. There's no middleware to fall back
            // on for a global session refresh (deliberately — see
            // conversation); instead, getCurrentProfile() in
            // lib/auth/roles.ts is the single place that checks auth
            // and handles a stale/invalid session, and its
            // best-effort signOut() actually clears cookies whenever
            // it runs from a context that supports it (Server
            // Actions, Route Handlers).
          }
        },
      },
    }
  );
}

// Admin client — service-role key, bypasses RLS. Only import this from
// trusted server-side code (e.g. an internal cron or a verified webhook).
// The award_points() Postgres function is the primary safeguard for
// point awards, so this is rarely needed, but it's here for cases like
// backfills or admin tooling.
import { createClient as createSupabaseClient } from "@supabase/supabase-js";

export function createAdminClient() {
  return createSupabaseClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false } }
  );
}
