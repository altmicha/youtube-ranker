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
            // setAll is called from a Server Component in some cases
            // (e.g. during a prefetch); this can be safely ignored
            // because middleware.ts refreshes the session on every
            // request anyway.
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
