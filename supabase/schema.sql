-- =========================================================
-- YouTube Ranker — full schema, RLS policies, and triggers
-- Run this in the Supabase SQL editor on a fresh project.
-- =========================================================

-- ---------------------------------------------------------
-- 1. PROFILES  (one row per auth.users row; holds role + points)
-- ---------------------------------------------------------
create type public.user_role as enum ('user', 'creator');

create table public.profiles (
  id          uuid primary key references auth.users(id) on delete cascade,
  email       text not null,
  display_name text,
  avatar_url  text,
  role        public.user_role not null default 'user',
  points      integer not null default 0,
  created_at  timestamptz not null default now()
);

alter table public.profiles enable row level security;

-- Everyone (incl. anonymous) can read profiles — needed to show
-- submitter names, points balances, and the ranked list's authors.
create policy "profiles are publicly readable"
  on public.profiles for select
  using (true);

-- Users can update only their own display_name/avatar_url — NOT role
-- or points (those are locked down below).
create policy "users can update their own basic info"
  on public.profiles for update
  using (auth.uid() = id)
  with check (
    auth.uid() = id
    and role = (select role from public.profiles where id = auth.uid())
    and points = (select points from public.profiles where id = auth.uid())
  );

-- No direct insert policy for profiles: rows are created only by the
-- handle_new_user trigger below (running as the table owner), so a
-- client can never insert its own profile with an arbitrary role.

-- Auto-create a profile row whenever someone signs up via Supabase Auth.
create function public.handle_new_user()
returns trigger
language plpgsql
security definer set search_path = public
as $$
begin
  insert into public.profiles (id, email, display_name, avatar_url, role)
  values (
    new.id,
    new.email,
    coalesce(new.raw_user_meta_data->>'full_name', new.raw_user_meta_data->>'name'),
    new.raw_user_meta_data->>'avatar_url',
    'user'
  );
  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();


-- ---------------------------------------------------------
-- 2. VIDEOS  (one row per unique YouTube video)
-- ---------------------------------------------------------
create type public.video_category as enum (
  'Gaming', 'Funny', 'LSF', 'Cop Slop', 'React', 'IRL', 'Slots',
  'Sports', 'Horror', 'Variety', 'Music', 'Just Chatting'
);
-- NOTE: "All", "Just Chatting", "IRL", "Slots", and "Variety" are no
-- longer offered as browsable/selectable categories in the app (see
-- lib/types/database.types.ts's SELECTABLE_CATEGORIES). This enum
-- type intentionally still contains all 12 values rather than having
-- 4 removed — shrinking a Postgres enum requires recreating the type
-- and re-pointing every dependent column/function, which is a much
-- riskier migration than just hiding values in the UI. "Variety"
-- doubles as the hidden fallback bucket: see the one-time data
-- migration below, which moves any video that was in a since-removed
-- category into 'Variety' so it keeps showing on /videos (unfiltered)
-- without a category tile/route of its own.

create type public.video_source as enum ('youtube', 'twitch');

create table public.videos (
  id                uuid primary key default gen_random_uuid(),
  source            public.video_source not null default 'youtube',
  youtube_id        text unique,      -- e.g. "dQw4w9WgXcQ"; null for Twitch rows
  twitch_clip_slug  text unique,      -- e.g. "AwkwardHelplessSalamanderSwiftRage"; null for YouTube rows
  title             text,
  thumbnail_url     text,
  channel_name      text,      -- YouTube channel name; null for Twitch rows
  broadcaster_name  text,      -- Twitch broadcaster name; null for YouTube rows
  category          public.video_category not null default 'Variety',
  view_count        bigint,    -- from YouTube Data API or Twitch Helix; null if never fetched successfully
  like_count        bigint,    -- YouTube only — Twitch's Get Clips response has no like count
  dislike_count     bigint,    -- almost always null — YouTube hid this publicly in Dec 2021;
                                -- only ever set from a real API value, never faked
  published_at      timestamptz, -- YouTube's snippet.publishedAt, or Twitch's clip created_at
  submission_count  integer not null default 0, -- denormalized, kept in sync by trigger
  vote_count        integer not null default 0, -- denormalized, kept in sync by trigger
  is_removed        boolean not null default false, -- soft-delete flag; see remove_video()
  created_at        timestamptz not null default now(),
  constraint videos_source_id_check check (
    (source = 'youtube' and youtube_id is not null and twitch_clip_slug is null)
    or
    (source = 'twitch' and twitch_clip_slug is not null and youtube_id is null)
  )
);

alter table public.videos enable row level security;

-- One-time data migration: move any existing video that was in a
-- category removed from the UI ("Just Chatting", "IRL", "Slots")
-- into "Variety", the hidden fallback bucket. "Variety" itself needs
-- no migration (it stays "Variety"); "All" was never a stored value.
-- Safe to run more than once — it only ever touches rows still in
-- one of those three categories.
update public.videos
  set category = 'Variety'
  where category in ('Just Chatting', 'IRL', 'Slots');

create policy "videos are publicly readable"
  on public.videos for select
  using (true);

-- Videos are only ever created through the submissions flow (see below),
-- so there's no public insert/update policy here; writes happen via a
-- SECURITY DEFINER function that also records the submission atomically.


-- ---------------------------------------------------------
-- 3. SUBMISSIONS  (who submitted which video, and when)
-- ---------------------------------------------------------
create table public.submissions (
  id          uuid primary key default gen_random_uuid(),
  video_id    uuid not null references public.videos(id) on delete cascade,
  user_id     uuid not null references public.profiles(id) on delete cascade,
  created_at  timestamptz not null default now(),
  -- one submission per user per video (resubmitting the same link twice
  -- shouldn't count twice toward ranking)
  unique (video_id, user_id)
);

alter table public.submissions enable row level security;

create policy "submissions are publicly readable"
  on public.submissions for select
  using (true);

create policy "users can submit as themselves"
  on public.submissions for insert
  with check (auth.uid() = user_id);

-- Keep videos.submission_count in sync automatically.
create function public.handle_submission_change()
returns trigger
language plpgsql
security definer set search_path = public
as $$
begin
  if tg_op = 'INSERT' then
    update public.videos
      set submission_count = submission_count + 1
      where id = new.video_id;
    return new;
  elsif tg_op = 'DELETE' then
    update public.videos
      set submission_count = greatest(submission_count - 1, 0)
      where id = old.video_id;
    return old;
  end if;
  return null;
end;
$$;

create trigger on_submission_change
  after insert or delete on public.submissions
  for each row execute function public.handle_submission_change();


-- ---------------------------------------------------------
-- 4. VOTES  (one upvote per user per video)
-- ---------------------------------------------------------
create table public.votes (
  id          uuid primary key default gen_random_uuid(),
  video_id    uuid not null references public.videos(id) on delete cascade,
  user_id     uuid not null references public.profiles(id) on delete cascade,
  created_at  timestamptz not null default now(),
  unique (video_id, user_id)  -- enforces "one vote per user per video"
);

alter table public.votes enable row level security;

create policy "votes are publicly readable"
  on public.votes for select
  using (true);

create policy "users can vote as themselves"
  on public.votes for insert
  with check (auth.uid() = user_id);

create policy "users can remove their own vote"
  on public.votes for delete
  using (auth.uid() = user_id);

create function public.handle_vote_change()
returns trigger
language plpgsql
security definer set search_path = public
as $$
begin
  if tg_op = 'INSERT' then
    update public.videos set vote_count = vote_count + 1 where id = new.video_id;
    return new;
  elsif tg_op = 'DELETE' then
    update public.videos set vote_count = greatest(vote_count - 1, 0) where id = old.video_id;
    return old;
  end if;
  return null;
end;
$$;

create trigger on_vote_change
  after insert or delete on public.votes
  for each row execute function public.handle_vote_change();


-- ---------------------------------------------------------
-- 5. POINT AWARDS  (audit log; creator -> submitter grants)
-- ---------------------------------------------------------
create table public.point_awards (
  id             uuid primary key default gen_random_uuid(),
  video_id       uuid not null references public.videos(id) on delete cascade,
  submission_id  uuid not null references public.submissions(id) on delete cascade,
  recipient_id   uuid not null references public.profiles(id) on delete cascade,
  creator_id     uuid not null references public.profiles(id) on delete cascade,
  points         integer not null check (points > 0),
  created_at     timestamptz not null default now()
);

alter table public.point_awards enable row level security;

create policy "point awards are publicly readable"
  on public.point_awards for select
  using (true);

-- No direct insert policy: awards must go through award_points() or
-- award_points_for_video() below, which check the caller is a creator
-- AND increment the recipient's balance atomically. This prevents a
-- client from inserting an award row and separately patching
-- profiles.points out of sync (or at all, since profiles.points has
-- no public update policy).
--
-- award_points() awards a single submission and is kept as a
-- lower-level primitive. The Creator Dashboard's "Select & Award
-- Points" button uses award_points_for_video() (defined below, after
-- this table's policies) instead, since it also needs to enforce
-- "once per creator per video" across every submitter it pays.
create function public.award_points(
  p_submission_id uuid,
  p_points int
)
returns public.point_awards
language plpgsql
security definer set search_path = public
as $$
declare
  v_caller_role public.user_role;
  v_video_id uuid;
  v_recipient_id uuid;
  v_award public.point_awards;
begin
  select role into v_caller_role from public.profiles where id = auth.uid();
  if v_caller_role is distinct from 'creator' then
    raise exception 'Only creators can award points';
  end if;

  if p_points <= 0 then
    raise exception 'Points must be positive';
  end if;

  select video_id, user_id into v_video_id, v_recipient_id
    from public.submissions where id = p_submission_id;

  if v_recipient_id is null then
    raise exception 'Submission not found';
  end if;

  insert into public.point_awards (video_id, submission_id, recipient_id, creator_id, points)
  values (v_video_id, p_submission_id, v_recipient_id, auth.uid(), p_points)
  returning * into v_award;

  update public.profiles
    set points = points + p_points
    where id = v_recipient_id;

  return v_award;
end;
$$;


-- ---------------------------------------------------------
-- 5b. Enforce "a creator can award points for a video only once".
--
-- One creator "award" click pays out every unique submitter of a
-- video (multiple point_awards rows, one per submitter), so a unique
-- constraint on point_awards itself can't express "only once" — it
-- would block paying the 2nd, 3rd, etc. submitter in the same batch.
-- Instead, this claim table holds exactly one row per (video, creator)
-- pair: award_points_for_video() inserts into it FIRST, so a repeat
-- attempt — even a near-simultaneous double click — fails on this
-- table's primary key before any points are paid out twice.
-- ---------------------------------------------------------
create table public.video_creator_awards (
  video_id    uuid not null references public.videos(id) on delete cascade,
  creator_id  uuid not null references public.profiles(id) on delete cascade,
  awarded_at  timestamptz not null default now(),
  primary key (video_id, creator_id)
);

alter table public.video_creator_awards enable row level security;

create policy "video creator awards are publicly readable"
  on public.video_creator_awards for select
  using (true);

-- No public insert policy: rows are only ever created inside
-- award_points_for_video() below.

-- Awards p_points to every unique submitter of p_video_id, but only if
-- this creator hasn't already awarded this video. This is what the
-- "Select & Award Points" button calls.
create function public.award_points_for_video(
  p_video_id uuid,
  p_points int default 10
)
returns integer
language plpgsql
security definer set search_path = public
as $$
declare
  v_caller_role public.user_role;
  v_awarded_count integer := 0;
  r record;
begin
  select role into v_caller_role from public.profiles where id = auth.uid();
  if v_caller_role is distinct from 'creator' then
    raise exception 'Only creators can award points';
  end if;

  if p_points <= 0 then
    raise exception 'Points must be positive';
  end if;

  -- Atomic claim. If this creator already awarded this video, this
  -- insert raises a unique_violation (23505) and nothing below runs —
  -- no partial/double payout is possible, including under a race.
  insert into public.video_creator_awards (video_id, creator_id)
  values (p_video_id, auth.uid());

  -- One payout per unique submitter (first submission if someone
  -- somehow submitted the same video more than once).
  for r in
    select distinct on (user_id) id as submission_id, user_id
    from public.submissions
    where video_id = p_video_id
    order by user_id, created_at asc
  loop
    insert into public.point_awards (video_id, submission_id, recipient_id, creator_id, points)
    values (p_video_id, r.submission_id, r.user_id, auth.uid(), p_points);

    update public.profiles set points = points + p_points where id = r.user_id;

    v_awarded_count := v_awarded_count + 1;
  end loop;

  return v_awarded_count;
end;
$$;

-- Reverses award_points_for_video(): removes this creator's claim on
-- the video, deletes the point_awards rows it created, and deducts
-- those points back off each recipient's balance — all atomically, so
-- a partial undo (points removed but claim still blocking a re-award,
-- or vice versa) isn't possible.
create function public.undo_award_for_video(p_video_id uuid)
returns integer
language plpgsql
security definer set search_path = public
as $$
declare
  v_caller_role public.user_role;
  v_undone_count integer := 0;
  r record;
begin
  select role into v_caller_role from public.profiles where id = auth.uid();
  if v_caller_role is distinct from 'creator' then
    raise exception 'Only creators can undo awards';
  end if;

  if not exists (
    select 1 from public.video_creator_awards
    where video_id = p_video_id and creator_id = auth.uid()
  ) then
    raise exception 'You have not awarded points for this video';
  end if;

  for r in
    select recipient_id, points from public.point_awards
    where video_id = p_video_id and creator_id = auth.uid()
  loop
    update public.profiles
      set points = greatest(points - r.points, 0)
      where id = r.recipient_id;
    v_undone_count := v_undone_count + 1;
  end loop;

  delete from public.point_awards
    where video_id = p_video_id and creator_id = auth.uid();

  delete from public.video_creator_awards
    where video_id = p_video_id and creator_id = auth.uid();

  return v_undone_count;
end;
$$;

-- Soft-deletes a video: sets is_removed = true so it drops out of the
-- homepage and creator dashboard lists (both filter on
-- is_removed = false), without touching submissions, votes,
-- point_awards, or video_creator_awards rows — so points already
-- awarded stay awarded, and the one-award-per-creator-per-video rule
-- (enforced by video_creator_awards' primary key) is unaffected. This
-- is the only way a video's is_removed flag can be set: there's no
-- public update policy on videos for clients, so this function —
-- which independently re-checks the caller is a creator — is the
-- actual enforcement, not just the UI hiding a button.
create function public.remove_video(p_video_id uuid)
returns void
language plpgsql
security definer set search_path = public
as $$
declare
  v_caller_role public.user_role;
begin
  select role into v_caller_role from public.profiles where id = auth.uid();
  if v_caller_role is distinct from 'creator' then
    raise exception 'Only creators can remove videos';
  end if;

  update public.videos set is_removed = true where id = p_video_id;

  if not found then
    raise exception 'Video not found';
  end if;
end;
$$;


-- ---------------------------------------------------------
-- 6. Helper: submit a video (creates the video row if new, then the
--    submission) as one atomic call from the client.
-- ---------------------------------------------------------
-- Adding p_view_count/p_like_count/p_dislike_count/p_published_at
-- changes this function's argument list each time, so Postgres would
-- otherwise keep the old version around as a separate overload
-- (ambiguous for PostgREST) instead of replacing it — drop the prior
-- signature explicitly first.
drop function if exists public.submit_video(text, text, text, text, public.video_category);
drop function if exists public.submit_video(text, text, text, text, public.video_category, bigint, bigint, bigint);

create function public.submit_video(
  p_youtube_id text,
  p_title text,
  p_thumbnail_url text,
  p_channel_name text,
  p_category public.video_category,
  p_view_count bigint default null,
  p_like_count bigint default null,
  p_dislike_count bigint default null,
  p_published_at timestamptz default null
)
returns public.submissions
language plpgsql
security definer set search_path = public
as $$
declare
  v_video_id uuid;
  v_was_removed boolean;
  v_submission public.submissions;
begin
  select id, is_removed into v_video_id, v_was_removed
    from public.videos where youtube_id = p_youtube_id;

  if v_video_id is not null and v_was_removed then
    -- Reviving a previously-removed listing (a video row can't just
    -- be re-inserted — youtube_id is unique — so this is the only
    -- way to let the same YouTube video be submitted again). Wipe
    -- its old submission/vote/award history so it behaves like a
    -- brand new listing:
    --   - deleting submissions cascades to point_awards (FK:
    --     point_awards.submission_id -> submissions.id on delete
    --     cascade), clearing old awards tied to this listing
    --   - video_creator_awards is keyed by video_id, not
    --     submission_id, so it needs an explicit delete too —
    --     otherwise its (video_id, creator_id) primary key would
    --     still "remember" a creator already awarded this video and
    --     block them from awarding the revived listing
    --   - submission_count/vote_count are kept in sync by the
    --     existing per-row triggers as these rows are deleted,
    --     landing back at 0, then the fresh insert below takes it to 1
    -- Already-awarded points on a user's profile are NOT clawed back
    -- — those were real payouts, not part of "the listing"'s state.
    delete from public.submissions where video_id = v_video_id;
    delete from public.votes where video_id = v_video_id;
    delete from public.video_creator_awards where video_id = v_video_id;

    update public.videos
      set is_removed = false,
          title = p_title,
          thumbnail_url = p_thumbnail_url,
          channel_name = p_channel_name,
          category = p_category,
          view_count = p_view_count,
          like_count = p_like_count,
          dislike_count = p_dislike_count,
          published_at = p_published_at
      where id = v_video_id;

  elsif v_video_id is null then
    -- Brand new video.
    insert into public.videos (
      youtube_id, title, thumbnail_url, channel_name, category,
      view_count, like_count, dislike_count, published_at
    )
    values (
      p_youtube_id, p_title, p_thumbnail_url, p_channel_name, p_category,
      p_view_count, p_like_count, p_dislike_count, p_published_at
    )
    returning id into v_video_id;

  else
    -- Existing, still-active (not removed) video: same backfill-only
    -- behavior as before. category/title/thumbnail/channel are
    -- per-video and don't get overwritten by a later submitter;
    -- stats always take the freshest fetch. The submissions insert
    -- below still enforces "can't submit the same active video
    -- twice" via unique(video_id, user_id).
    update public.videos
      set title = coalesce(title, p_title),
          thumbnail_url = coalesce(thumbnail_url, p_thumbnail_url),
          channel_name = coalesce(channel_name, p_channel_name),
          view_count = coalesce(p_view_count, view_count),
          like_count = coalesce(p_like_count, like_count),
          dislike_count = coalesce(p_dislike_count, dislike_count),
          published_at = coalesce(published_at, p_published_at)
      where id = v_video_id;
  end if;

  insert into public.submissions (video_id, user_id)
  values (v_video_id, auth.uid())
  returning * into v_submission;

  return v_submission;
end;
$$;


-- ---------------------------------------------------------
-- 6a2. Twitch clip submission — deliberately a separate function
-- from submit_video() rather than merging the two, so adding Twitch
-- support cannot change YouTube's existing, working behavior at all.
-- Mirrors submit_video()'s revive-if-removed / backfill-if-active /
-- insert-if-new branching exactly, just keyed by twitch_clip_slug
-- instead of youtube_id, and without like_count/dislike_count (Get
-- Clips has no such fields).
-- ---------------------------------------------------------
create function public.submit_twitch_clip(
  p_slug text,
  p_title text,
  p_thumbnail_url text,
  p_broadcaster_name text,
  p_category public.video_category,
  p_view_count bigint default null,
  p_published_at timestamptz default null
)
returns public.submissions
language plpgsql
security definer set search_path = public
as $$
declare
  v_video_id uuid;
  v_was_removed boolean;
  v_submission public.submissions;
begin
  select id, is_removed into v_video_id, v_was_removed
    from public.videos where twitch_clip_slug = p_slug;

  if v_video_id is not null and v_was_removed then
    delete from public.submissions where video_id = v_video_id;
    delete from public.votes where video_id = v_video_id;
    delete from public.video_creator_awards where video_id = v_video_id;

    update public.videos
      set is_removed = false,
          title = p_title,
          thumbnail_url = p_thumbnail_url,
          broadcaster_name = p_broadcaster_name,
          category = p_category,
          view_count = p_view_count,
          published_at = p_published_at
      where id = v_video_id;

  elsif v_video_id is null then
    insert into public.videos (
      source, twitch_clip_slug, title, thumbnail_url, broadcaster_name,
      category, view_count, published_at
    )
    values (
      'twitch', p_slug, p_title, p_thumbnail_url, p_broadcaster_name,
      p_category, p_view_count, p_published_at
    )
    returning id into v_video_id;

  else
    -- Existing, still-active clip: backfill-only, same pattern as
    -- submit_video()'s equivalent branch.
    update public.videos
      set title = coalesce(title, p_title),
          thumbnail_url = coalesce(thumbnail_url, p_thumbnail_url),
          broadcaster_name = coalesce(broadcaster_name, p_broadcaster_name),
          view_count = coalesce(p_view_count, view_count),
          published_at = coalesce(published_at, p_published_at)
      where id = v_video_id;
  end if;

  insert into public.submissions (video_id, user_id)
  values (v_video_id, auth.uid())
  returning * into v_submission;

  return v_submission;
end;
$$;


-- ---------------------------------------------------------
-- 6b. Time-windowed category ranking.
--
-- Ranks videos in a category by how many submissions they got within
-- a time window, not their all-time submission_count. p_since = null
-- means "all time" (equivalent to the old plain query, and every
-- video with at least one submission qualifies — trivially true).
-- For a real window (daily/weekly/monthly), a video with zero
-- submissions in that window is excluded entirely rather than shown
-- at the bottom with a 0 — this is meant to answer "what's trending
-- in the last day/week/month", not "list everything, mostly zeros".
-- vote_count returned is still the video's all-time vote count
-- (upvotes aren't windowed — see conversation requirement 6).
-- ---------------------------------------------------------
-- Adding p_source (and the source/twitch_clip_slug/broadcaster_name
-- return columns) changes this function's signature and return type,
-- which create-or-replace can't do — drop the prior version first.
drop function if exists public.videos_ranked_by_category(public.video_category, timestamptz);

create function public.videos_ranked_by_category(
  p_category public.video_category,
  p_source public.video_source,
  p_since timestamptz default null
)
returns table (
  id uuid,
  source public.video_source,
  youtube_id text,
  twitch_clip_slug text,
  title text,
  thumbnail_url text,
  channel_name text,
  broadcaster_name text,
  category public.video_category,
  view_count bigint,
  like_count bigint,
  dislike_count bigint,
  published_at timestamptz,
  submission_count integer,
  vote_count integer,
  is_removed boolean,
  created_at timestamptz,
  window_submission_count bigint
)
language sql
stable
as $$
  select
    v.id, v.source, v.youtube_id, v.twitch_clip_slug,
    v.title, v.thumbnail_url, v.channel_name, v.broadcaster_name, v.category,
    v.view_count, v.like_count, v.dislike_count, v.published_at,
    v.submission_count, v.vote_count, v.is_removed, v.created_at,
    count(s.id) filter (
      where p_since is null or s.created_at >= p_since
    ) as window_submission_count
  from public.videos v
  left join public.submissions s on s.video_id = v.id
  where v.category = p_category
    and v.source = p_source
    and v.is_removed = false
  group by v.id
  having p_since is null
      or count(s.id) filter (where s.created_at >= p_since) > 0
  order by window_submission_count desc, v.submission_count desc
  limit 50;
$$;


-- ---------------------------------------------------------
-- 7. Helpful indexes
-- ---------------------------------------------------------
create index videos_submission_count_idx on public.videos (submission_count desc);
create index videos_is_removed_idx on public.videos (is_removed);
create index videos_category_idx on public.videos (category);
create index videos_twitch_clip_slug_idx on public.videos (twitch_clip_slug);
create index submissions_video_id_idx on public.submissions (video_id);
create index submissions_user_id_idx on public.submissions (user_id);
create index submissions_created_at_idx on public.submissions (created_at);
create index votes_video_id_idx on public.votes (video_id);
create index point_awards_recipient_id_idx on public.point_awards (recipient_id);
create index video_creator_awards_creator_id_idx on public.video_creator_awards (creator_id);


-- =========================================================
-- 8. DYNAMIC, CREATOR-MANAGED CATEGORIES
--
-- Replaces the fixed video_category enum as the thing videos are
-- actually categorized by. The enum/column stay in place above
-- (harmless, vestigial) rather than being dropped — safer than an
-- irreversible column drop, and every new row still gets a default
-- 'Variety' there for free. Everything going forward reads/writes
-- videos.category_id instead.
-- =========================================================

create table if not exists public.categories (
  id          uuid primary key default gen_random_uuid(),
  platform    public.video_source not null,
  name        text not null,
  slug        text not null,
  -- Object path within the "category-covers" Storage bucket (see
  -- below). Null = no custom image uploaded yet; the app falls back
  -- to a color gradient in that case.
  image_path  text,
  created_at  timestamptz not null default now(),
  -- YouTube and Twitch are separate lists (requirement) — "LSF" can
  -- exist once per platform, as two distinct rows, not one shared row.
  unique (platform, slug)
);

alter table public.categories enable row level security;

-- drop-then-create makes this block safely re-runnable if a policy
-- was created wrong, missing, or only partially applied — matters
-- here specifically because a botched or absent insert policy is the
-- most common cause of "creating a category fails" (Postgres returns
-- a 42501 row-level-security error, not a helpful message, if the
-- INSERT is rejected by RLS).
drop policy if exists "categories are publicly readable" on public.categories;
create policy "categories are publicly readable"
  on public.categories for select
  using (true);

-- Every write policy checks the caller's own profile role — same
-- creator-only pattern used everywhere else in this schema, just via
-- RLS directly rather than a SECURITY DEFINER function, since plain
-- category CRUD has no other atomic side effects that need one (the
-- one exception, "removing a category moves its videos to
-- Uncategorized", is handled by the ON DELETE SET NULL foreign key
-- below, not application code).
drop policy if exists "creators can insert categories" on public.categories;
create policy "creators can insert categories"
  on public.categories for insert
  with check (
    exists (select 1 from public.profiles where id = auth.uid() and role = 'creator')
  );

drop policy if exists "creators can update categories" on public.categories;
create policy "creators can update categories"
  on public.categories for update
  using (
    exists (select 1 from public.profiles where id = auth.uid() and role = 'creator')
  )
  with check (
    exists (select 1 from public.profiles where id = auth.uid() and role = 'creator')
  );

drop policy if exists "creators can delete categories" on public.categories;
create policy "creators can delete categories"
  on public.categories for delete
  using (
    exists (select 1 from public.profiles where id = auth.uid() and role = 'creator')
  );

-- Seed: matches the categories that existed as hardcoded lists in the
-- app before this migration. Safe to run more than once.
insert into public.categories (platform, name, slug) values
  ('youtube', 'Gaming', 'gaming'),
  ('youtube', 'Funny', 'funny'),
  ('youtube', 'LSF', 'lsf'),
  ('youtube', 'Cop Slop', 'cop-slop'),
  ('youtube', 'React', 'react'),
  ('youtube', 'Sports', 'sports'),
  ('youtube', 'Horror', 'horror'),
  ('youtube', 'Music', 'music'),
  ('twitch', 'LSF', 'lsf'),
  ('twitch', 'Funny', 'funny')
on conflict (platform, slug) do nothing;

alter table public.videos
  add column category_id uuid references public.categories(id) on delete set null;
-- ON DELETE SET NULL is what satisfies "removing a category should
-- not delete videos" — deleting a categories row automatically clears
-- category_id on every video that referenced it (no app code, no
-- explicit UPDATE needed), and a null category_id IS "Uncategorized":
-- such a video simply has no category tile/page of its own anymore,
-- but keeps showing on /videos (unfiltered) exactly like the old
-- 'Variety' hidden-bucket videos always did.

-- Backfill: map each video's old enum category (+ its source
-- platform) to the matching new categories row. The old hidden
-- fallback bucket, 'Variety', maps to NULL (Uncategorized) — which is
-- exactly what it always functionally was. Safe to run more than
-- once — it only ever touches rows that don't have a category_id yet.
update public.videos v
set category_id = c.id
from public.categories c
where c.platform = v.source
  and c.name = v.category::text
  and v.category is distinct from 'Variety'
  and v.category_id is null;

create index videos_category_id_idx on public.videos (category_id);
create index categories_platform_idx on public.categories (platform);


-- ---------------------------------------------------------
-- 8a. submit_video() / submit_twitch_clip(), updated to take
-- p_category_id instead of the old enum p_category. Each validates
-- the category exists AND belongs to the right platform before
-- writing anything — defense in depth alongside the app-level check
-- in app/actions/videos.ts.
-- ---------------------------------------------------------
drop function if exists public.submit_video(text, text, text, text, public.video_category, bigint, bigint, bigint, timestamptz);

create function public.submit_video(
  p_youtube_id text,
  p_title text,
  p_thumbnail_url text,
  p_channel_name text,
  p_category_id uuid,
  p_view_count bigint default null,
  p_like_count bigint default null,
  p_dislike_count bigint default null,
  p_published_at timestamptz default null
)
returns public.submissions
language plpgsql
security definer set search_path = public
as $$
declare
  v_video_id uuid;
  v_was_removed boolean;
  v_submission public.submissions;
begin
  if not exists (
    select 1 from public.categories where id = p_category_id and platform = 'youtube'
  ) then
    raise exception 'Invalid category for YouTube';
  end if;

  select id, is_removed into v_video_id, v_was_removed
    from public.videos where youtube_id = p_youtube_id;

  if v_video_id is not null and v_was_removed then
    delete from public.submissions where video_id = v_video_id;
    delete from public.votes where video_id = v_video_id;
    delete from public.video_creator_awards where video_id = v_video_id;

    update public.videos
      set is_removed = false,
          title = p_title,
          thumbnail_url = p_thumbnail_url,
          channel_name = p_channel_name,
          category_id = p_category_id,
          view_count = p_view_count,
          like_count = p_like_count,
          dislike_count = p_dislike_count,
          published_at = p_published_at
      where id = v_video_id;

  elsif v_video_id is null then
    insert into public.videos (
      youtube_id, title, thumbnail_url, channel_name, category_id,
      view_count, like_count, dislike_count, published_at
    )
    values (
      p_youtube_id, p_title, p_thumbnail_url, p_channel_name, p_category_id,
      p_view_count, p_like_count, p_dislike_count, p_published_at
    )
    returning id into v_video_id;

  else
    -- Existing, still-active video: backfill-only, category_id
    -- untouched — same rule as before (first submitter's choice
    -- sticks; renaming that category later still keeps this video
    -- since it's linked by id, not name).
    update public.videos
      set title = coalesce(title, p_title),
          thumbnail_url = coalesce(thumbnail_url, p_thumbnail_url),
          channel_name = coalesce(channel_name, p_channel_name),
          view_count = coalesce(p_view_count, view_count),
          like_count = coalesce(p_like_count, like_count),
          dislike_count = coalesce(p_dislike_count, dislike_count),
          published_at = coalesce(published_at, p_published_at)
      where id = v_video_id;
  end if;

  insert into public.submissions (video_id, user_id)
  values (v_video_id, auth.uid())
  returning * into v_submission;

  return v_submission;
end;
$$;

drop function if exists public.submit_twitch_clip(text, text, text, text, public.video_category, bigint, timestamptz);

create function public.submit_twitch_clip(
  p_slug text,
  p_title text,
  p_thumbnail_url text,
  p_broadcaster_name text,
  p_category_id uuid,
  p_view_count bigint default null,
  p_published_at timestamptz default null
)
returns public.submissions
language plpgsql
security definer set search_path = public
as $$
declare
  v_video_id uuid;
  v_was_removed boolean;
  v_submission public.submissions;
begin
  if not exists (
    select 1 from public.categories where id = p_category_id and platform = 'twitch'
  ) then
    raise exception 'Invalid category for Twitch';
  end if;

  select id, is_removed into v_video_id, v_was_removed
    from public.videos where twitch_clip_slug = p_slug;

  if v_video_id is not null and v_was_removed then
    delete from public.submissions where video_id = v_video_id;
    delete from public.votes where video_id = v_video_id;
    delete from public.video_creator_awards where video_id = v_video_id;

    update public.videos
      set is_removed = false,
          title = p_title,
          thumbnail_url = p_thumbnail_url,
          broadcaster_name = p_broadcaster_name,
          category_id = p_category_id,
          view_count = p_view_count,
          published_at = p_published_at
      where id = v_video_id;

  elsif v_video_id is null then
    insert into public.videos (
      source, twitch_clip_slug, title, thumbnail_url, broadcaster_name,
      category_id, view_count, published_at
    )
    values (
      'twitch', p_slug, p_title, p_thumbnail_url, p_broadcaster_name,
      p_category_id, p_view_count, p_published_at
    )
    returning id into v_video_id;

  else
    update public.videos
      set title = coalesce(title, p_title),
          thumbnail_url = coalesce(thumbnail_url, p_thumbnail_url),
          broadcaster_name = coalesce(broadcaster_name, p_broadcaster_name),
          view_count = coalesce(p_view_count, view_count),
          published_at = coalesce(published_at, p_published_at)
      where id = v_video_id;
  end if;

  insert into public.submissions (video_id, user_id)
  values (v_video_id, auth.uid())
  returning * into v_submission;

  return v_submission;
end;
$$;


-- ---------------------------------------------------------
-- 8b. videos_ranked_by_category(), updated to take a single
-- p_category_id instead of separate p_category/p_source — a
-- category's platform is now implied by which row you pass, so a
-- separate source filter is redundant. This is also the actual fix
-- for "/twitch/lsf shows YouTube's LSF videos too": that bug existed
-- because category names were shared across platforms; now each
-- platform's "LSF" is a distinct row with its own id, so filtering by
-- category_id alone is airtight. Also joins categories to return the
-- current display name, so a rename shows up immediately everywhere
-- without any other code needing to change.
-- ---------------------------------------------------------
drop function if exists public.videos_ranked_by_category(public.video_category, public.video_source, timestamptz);

create function public.videos_ranked_by_category(
  p_category_id uuid,
  p_since timestamptz default null
)
returns table (
  id uuid,
  source public.video_source,
  youtube_id text,
  twitch_clip_slug text,
  title text,
  thumbnail_url text,
  channel_name text,
  broadcaster_name text,
  category_id uuid,
  category_name text,
  view_count bigint,
  like_count bigint,
  dislike_count bigint,
  published_at timestamptz,
  submission_count integer,
  vote_count integer,
  is_removed boolean,
  created_at timestamptz,
  window_submission_count bigint
)
language sql
stable
as $$
  select
    v.id, v.source, v.youtube_id, v.twitch_clip_slug,
    v.title, v.thumbnail_url, v.channel_name, v.broadcaster_name,
    v.category_id, c.name as category_name,
    v.view_count, v.like_count, v.dislike_count, v.published_at,
    v.submission_count, v.vote_count, v.is_removed, v.created_at,
    count(s.id) filter (
      where p_since is null or s.created_at >= p_since
    ) as window_submission_count
  from public.videos v
  join public.categories c on c.id = v.category_id
  left join public.submissions s on s.video_id = v.id
  where v.category_id = p_category_id
    and v.is_removed = false
  group by v.id, c.name
  having p_since is null
      or count(s.id) filter (where s.created_at >= p_since) > 0
  order by window_submission_count desc, v.submission_count desc
  limit 50;
$$;


-- ---------------------------------------------------------
-- 8c. Storage bucket for creator-uploaded category cover images.
-- Public read (cards need to render for logged-out visitors too);
-- write restricted to creators via the same role-check pattern as
-- the categories table's own RLS policies above.
-- ---------------------------------------------------------
insert into storage.buckets (id, name, public)
values ('category-covers', 'category-covers', true)
on conflict (id) do nothing;

drop policy if exists "category images are publicly readable" on storage.objects;
create policy "category images are publicly readable"
  on storage.objects for select
  using (bucket_id = 'category-covers');

drop policy if exists "creators can upload category images" on storage.objects;
create policy "creators can upload category images"
  on storage.objects for insert
  with check (
    bucket_id = 'category-covers'
    and exists (select 1 from public.profiles where id = auth.uid() and role = 'creator')
  );

drop policy if exists "creators can replace category images" on storage.objects;
create policy "creators can replace category images"
  on storage.objects for update
  using (
    bucket_id = 'category-covers'
    and exists (select 1 from public.profiles where id = auth.uid() and role = 'creator')
  );

drop policy if exists "creators can delete category images" on storage.objects;
create policy "creators can delete category images"
  on storage.objects for delete
  using (
    bucket_id = 'category-covers'
    and exists (select 1 from public.profiles where id = auth.uid() and role = 'creator')
  );


-- =========================================================
-- 9. SUPERSEDES SECTION 8a/8b's category_id-based filtering.
--
-- videos.category_id (uuid FK to categories.id) turned out fragile in
-- practice across manual/partial migrations. This section converts
-- videos.category from the original fixed enum into a plain text
-- SLUG column (e.g. "music", "lsf") and rewrites submit_video(),
-- submit_twitch_clip(), and videos_ranked_by_category() to key off
-- (source, category) directly -- no id comparisons anywhere in the
-- filter path. category_id is kept as a vestigial column (harmless,
-- unused) rather than dropped. Also adds remove_category(), which
-- app/actions/categories.ts already called but which never existed.
--
-- NOTE: this database's categories.platform column turned out to be
-- plain `text`, not the video_source enum type — every comparison
-- against videos.source (which IS the enum) is explicitly cast to
-- text on both sides below to avoid "operator does not exist" errors.
-- =========================================================

-- =========================================================
-- Definitive fix: videos.category must be a plain text SLUG
-- (e.g. "music", "lsf"), matching exactly what submit and category
-- pages both use. Converts the column from the old enum type,
-- backfills existing rows, and rebuilds the three functions that
-- touch it. Run this entire file in one go.
-- =========================================================

-- Convert videos.category from the old enum to plain text. USING
-- category::text preserves the existing value's text (e.g. "Music",
-- "LSF") during the conversion -- nothing is lost, it just becomes
-- editable free text instead of a fixed enum label.
alter table public.videos alter column category drop default;
alter table public.videos alter column category type text using category::text;
alter table public.videos alter column category drop not null;

-- Backfill 1: if category_id already points at a real category row,
-- that row's slug is the most reliable source of truth -- use it.
update public.videos v
set category = c.slug
from public.categories c
where v.category_id = c.id
  and v.category is distinct from c.slug;

-- Backfill 2 (the actual "Music" vs "music" bug): for anything still
-- holding the old Title-Case enum text (e.g. "Music", "LSF") instead
-- of a real slug, match it case-insensitively against a category's
-- name on the same platform, and replace it with that category's
-- slug. Skipped for values that are already a valid slug for this
-- platform (idempotent).
update public.videos v
set category = c.slug
from public.categories c
where c.platform::text = v.source::text
  and lower(c.name) = lower(v.category)
  and v.category is distinct from c.slug
  and not exists (
    select 1 from public.categories c2
    where c2.platform::text = v.source::text and c2.slug = v.category
  );

-- "Variety" was always the hidden fallback bucket with no real
-- category row behind it -- treat it as Uncategorized (null) rather
-- than a literal category value nothing will ever match.
update public.videos set category = null where category = 'Variety';

create index if not exists videos_source_category_idx on public.videos (source, category);


-- ---------------------------------------------------------
-- submit_video(): p_category is now plain text (a slug), validated
-- against categories(platform='youtube', slug=p_category), and
-- written directly into videos.category.
-- ---------------------------------------------------------
drop function if exists public.submit_video(text, text, text, text, uuid, bigint, bigint, bigint, timestamptz);
drop function if exists public.submit_video(text, text, text, text, text, bigint, bigint, bigint, timestamptz);

create function public.submit_video(
  p_youtube_id text,
  p_title text,
  p_thumbnail_url text,
  p_channel_name text,
  p_category text,
  p_view_count bigint default null,
  p_like_count bigint default null,
  p_dislike_count bigint default null,
  p_published_at timestamptz default null
)
returns public.submissions
language plpgsql
security definer set search_path = public
as $$
declare
  v_video_id uuid;
  v_was_removed boolean;
  v_submission public.submissions;
begin
  if not exists (
    select 1 from public.categories where platform = 'youtube' and slug = p_category
  ) then
    raise exception 'Invalid category for YouTube: %', p_category;
  end if;

  select id, is_removed into v_video_id, v_was_removed from public.videos where youtube_id = p_youtube_id;

  if v_video_id is not null and v_was_removed then
    delete from public.submissions where video_id = v_video_id;
    delete from public.votes where video_id = v_video_id;
    delete from public.video_creator_awards where video_id = v_video_id;
    update public.videos
      set is_removed = false, title = p_title, thumbnail_url = p_thumbnail_url,
          channel_name = p_channel_name, category = p_category,
          view_count = p_view_count, like_count = p_like_count,
          dislike_count = p_dislike_count, published_at = p_published_at
      where id = v_video_id;
  elsif v_video_id is null then
    insert into public.videos (youtube_id, title, thumbnail_url, channel_name, category, view_count, like_count, dislike_count, published_at)
    values (p_youtube_id, p_title, p_thumbnail_url, p_channel_name, p_category, p_view_count, p_like_count, p_dislike_count, p_published_at)
    returning id into v_video_id;
  else
    update public.videos
      set title = coalesce(title, p_title), thumbnail_url = coalesce(thumbnail_url, p_thumbnail_url),
          channel_name = coalesce(channel_name, p_channel_name), view_count = coalesce(p_view_count, view_count),
          like_count = coalesce(p_like_count, like_count), dislike_count = coalesce(p_dislike_count, dislike_count),
          published_at = coalesce(published_at, p_published_at)
      where id = v_video_id;
  end if;

  insert into public.submissions (video_id, user_id) values (v_video_id, auth.uid()) returning * into v_submission;
  return v_submission;
end;
$$;


-- ---------------------------------------------------------
-- submit_twitch_clip(): same treatment.
-- ---------------------------------------------------------
drop function if exists public.submit_twitch_clip(text, text, text, text, uuid, bigint, timestamptz);
drop function if exists public.submit_twitch_clip(text, text, text, text, text, bigint, timestamptz);

create function public.submit_twitch_clip(
  p_slug text,
  p_title text,
  p_thumbnail_url text,
  p_broadcaster_name text,
  p_category text,
  p_view_count bigint default null,
  p_published_at timestamptz default null
)
returns public.submissions
language plpgsql
security definer set search_path = public
as $$
declare
  v_video_id uuid;
  v_was_removed boolean;
  v_submission public.submissions;
begin
  if not exists (
    select 1 from public.categories where platform = 'twitch' and slug = p_category
  ) then
    raise exception 'Invalid category for Twitch: %', p_category;
  end if;

  select id, is_removed into v_video_id, v_was_removed from public.videos where twitch_clip_slug = p_slug;

  if v_video_id is not null and v_was_removed then
    delete from public.submissions where video_id = v_video_id;
    delete from public.votes where video_id = v_video_id;
    delete from public.video_creator_awards where video_id = v_video_id;
    update public.videos
      set is_removed = false, title = p_title, thumbnail_url = p_thumbnail_url,
          broadcaster_name = p_broadcaster_name, category = p_category,
          view_count = p_view_count, published_at = p_published_at
      where id = v_video_id;
  elsif v_video_id is null then
    insert into public.videos (source, twitch_clip_slug, title, thumbnail_url, broadcaster_name, category, view_count, published_at)
    values ('twitch', p_slug, p_title, p_thumbnail_url, p_broadcaster_name, p_category, p_view_count, p_published_at)
    returning id into v_video_id;
  else
    update public.videos
      set title = coalesce(title, p_title), thumbnail_url = coalesce(thumbnail_url, p_thumbnail_url),
          broadcaster_name = coalesce(broadcaster_name, p_broadcaster_name), view_count = coalesce(p_view_count, view_count),
          published_at = coalesce(published_at, p_published_at)
      where id = v_video_id;
  end if;

  insert into public.submissions (video_id, user_id) values (v_video_id, auth.uid()) returning * into v_submission;
  return v_submission;
end;
$$;


-- ---------------------------------------------------------
-- videos_ranked_by_category(): filters by (source, category) plain
-- text -- this is the actual fix for videos not appearing on category
-- pages. Joins categories on (platform, slug) just for the display
-- name; the WHERE clause never touches an id.
-- ---------------------------------------------------------
drop function if exists public.videos_ranked_by_category(uuid, timestamptz);
drop function if exists public.videos_ranked_by_category(public.video_source, text, timestamptz);

create function public.videos_ranked_by_category(
  p_source public.video_source,
  p_category text,
  p_since timestamptz default null
)
returns table (
  id uuid,
  source public.video_source,
  youtube_id text,
  twitch_clip_slug text,
  title text,
  thumbnail_url text,
  channel_name text,
  broadcaster_name text,
  category text,
  category_id uuid,
  category_name text,
  view_count bigint,
  like_count bigint,
  dislike_count bigint,
  published_at timestamptz,
  submission_count integer,
  vote_count integer,
  is_removed boolean,
  created_at timestamptz,
  window_submission_count bigint
)
language sql
stable
as $$
  select
    v.id, v.source, v.youtube_id, v.twitch_clip_slug,
    v.title, v.thumbnail_url, v.channel_name, v.broadcaster_name,
    v.category, v.category_id, c.name as category_name,
    v.view_count, v.like_count, v.dislike_count, v.published_at,
    v.submission_count, v.vote_count, v.is_removed, v.created_at,
    count(s.id) filter (
      where p_since is null or s.created_at >= p_since
    ) as window_submission_count
  from public.videos v
  left join public.categories c on c.platform::text = v.source::text and c.slug = v.category
  left join public.submissions s on s.video_id = v.id
  where v.source = p_source
    and v.category = p_category
    and v.is_removed = false
  group by v.id, c.name
  having p_since is null
      or count(s.id) filter (where s.created_at >= p_since) > 0
  order by window_submission_count desc, v.submission_count desc
  limit 50;
$$;


-- ---------------------------------------------------------
-- remove_category(): referenced by app/actions/categories.ts but
-- didn't exist yet. Requirement: removing a category must not delete
-- videos -- clears category (text slug) and category_id off every
-- video that referenced this one (matched by source+slug, the same
-- pair used everywhere else), moving them to Uncategorized, then
-- deletes the category row itself. Independently re-checks the
-- caller is a creator, same pattern as every other privileged write.
-- ---------------------------------------------------------
create or replace function public.remove_category(p_category_id uuid)
returns void
language plpgsql
security definer set search_path = public
as $$
declare
  v_caller_role public.user_role;
  v_platform text;
  v_slug text;
begin
  select role into v_caller_role from public.profiles where id = auth.uid();
  if v_caller_role is distinct from 'creator' then
    raise exception 'Only creators can remove categories';
  end if;

  select platform, slug into v_platform, v_slug from public.categories where id = p_category_id;
  if v_slug is null then
    raise exception 'Category not found';
  end if;

  update public.videos
    set category = null, category_id = null
    where source::text = v_platform and category = v_slug;

  delete from public.categories where id = p_category_id;
end;
$$;
