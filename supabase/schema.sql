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
