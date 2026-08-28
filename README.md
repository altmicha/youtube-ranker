# YouTube Ranker

A Next.js 15 + Supabase app where users submit YouTube videos, videos rank by
submission count, users upvote, and "content creators" award points to
submitters of videos they select.

## What's included in this scaffold

- Next.js 15 App Router + TypeScript + Tailwind
- Supabase Auth (email/password + Google OAuth) with cookie-based SSR sessions
- Full Postgres schema with Row Level Security (`supabase/schema.sql`)
- Role system (`user` / `creator`) enforced both in the DB (RLS) and in a
  server-side helper (`lib/auth/roles.ts`)
- Login page, OAuth callback route, auth server actions
- Typed Supabase client using generated-style types (`lib/types/database.types.ts`)

## What's stubbed / left for you to build next

- The ranked video list UI, submission form, upvote button, and the
  creator's "award points" UI are not built yet — this scaffold stops at
  your requested 4 setup steps (project structure, auth, schema, roles).
- YouTube Data API v3 fetch helper (title/thumbnail/channel) — the DB
  columns exist (`title`, `thumbnail_url`, `channel_name`), but the fetch
  call itself isn't wired in yet.
- shadcn/ui components aren't installed yet (see setup below) — Tailwind is
  configured and ready for them.

## 1. Create the project

This scaffold gives you the files; run these once to get a real installable
project (a fresh `create-next-app` scaffold has some generated boilerplate
—`.gitignore`, `next-env.d.ts`, lockfile — that isn't useful to hand you as
static files):

```bash
npx create-next-app@latest youtube-ranker --typescript --tailwind --eslint --app --src-dir=false --import-alias "@/*"
cd youtube-ranker
```

Then copy every file from this scaffold into that folder, overwriting
`app/layout.tsx`, `app/page.tsx`, `app/globals.css`, `tailwind.config.ts`.

## 2. Install dependencies

```bash
npm install @supabase/supabase-js @supabase/ssr
npx shadcn@latest init   # pick: TypeScript, Tailwind, CSS variables = yes
npx shadcn@latest add button card avatar badge dialog input label separator
```

## 3. Create a Supabase project

1. Go to https://supabase.com/dashboard → New Project.
2. In **SQL Editor**, paste and run `supabase/schema.sql` (creates tables,
   RLS policies, triggers).
3. In **Authentication → Providers**, enable **Email** and **Google**.
   - For Google: create OAuth credentials in Google Cloud Console, set the
     authorized redirect URI to
     `https://<your-project-ref>.supabase.co/auth/v1/callback`, then paste
     the Client ID/Secret into Supabase's Google provider settings.
4. In **Authentication → URL Configuration**, add
   `http://localhost:3000/auth/callback` (and your prod URL later) as a
   redirect URL.

## 4. Environment variables

Copy `.env.local.example` to `.env.local` and fill in:

```
NEXT_PUBLIC_SUPABASE_URL=
NEXT_PUBLIC_SUPABASE_ANON_KEY=
SUPABASE_SERVICE_ROLE_KEY=       # server-only, used for point-award writes
YOUTUBE_API_KEY=                 # for later: fetching video metadata
```

## 5. Make yourself a creator

New signups default to role `user` (enforced by a DB trigger, so nobody can
elevate themselves via the client). To promote an account, run in the SQL
editor:

```sql
update public.profiles set role = 'creator' where email = 'you@example.com';
```

## 6. Run it

```bash
npm run dev
```

## Project structure

```
app/
  layout.tsx              root layout, wraps app in auth-aware shell
  page.tsx                placeholder home page (ranked list goes here)
  login/page.tsx           email + Google sign-in/up form
  auth/callback/route.ts  OAuth + magic-link code exchange
  auth/actions.ts         server actions: signInWithEmail, signUpWithEmail, signInWithGoogle, signOut
  creator/                (placeholder) creator-only award-points dashboard
  api/videos/             (placeholder) submit/list videos
  api/submissions/        (placeholder) create submission
  api/votes/              (placeholder) toggle upvote
  api/points/             (placeholder) award points (creator-only)
lib/
  supabase/client.ts      browser Supabase client
  supabase/server.ts      server Supabase client (Server Components/Actions)
  supabase/middleware.ts  session refresh helper used by middleware.ts
  auth/roles.ts           getCurrentProfile(), requireCreator() guards
  types/database.types.ts hand-written types matching schema.sql
middleware.ts             refreshes Supabase session cookies on every request
supabase/schema.sql       full DB schema + RLS policies + triggers
.env.local.example
```
