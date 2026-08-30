// Hand-written types matching supabase/schema.sql.
//
// IMPORTANT: this file's shape must satisfy @supabase/supabase-js's
// internal `GenericSchema` constraint — every schema needs `Tables`,
// `Views`, `Functions`, `Enums`, and `CompositeTypes` keys (even when
// empty), and every table needs a `Relationships` array. If any of
// those are missing, TypeScript can't prove `Database["public"]`
// satisfies the constraint the client generic requires, and it
// silently falls back to typing every query result as `never` —
// which is what caused the Vercel build failures. This structure
// mirrors what `npx supabase gen types typescript` produces, so it's
// safe to replace this file with a generated one later.

export type UserRole = "user" | "creator" | "streamer" | "admin";
export type VideoSource = "youtube" | "twitch";

// Categories are a real, editable table now (creator-managed — see
// app/actions/categories.ts) rather than a fixed enum. YouTube and
// Twitch are separate lists: a category row belongs to exactly one
// platform, so "LSF" on YouTube and "LSF" on Twitch are two distinct
// rows with their own ids, not one shared value.

// Minimal Streamer type — this app doesn't own/manage this table
// (you created it directly), so only the columns actually needed
// here are declared: id (for the categories.streamer_id FK), slug,
// display_name, platform, and an assumed avatar_url following this
// app's existing profiles.avatar_url naming convention. If your real
// column is named differently, the streamer page below falls back to
// a plain initial-letter avatar rather than crashing on a missing
// field.
export interface Streamer {
  id: string;
  slug: string;
  display_name: string;
  // Vestigial — a streamer is no longer tied to one platform (see
  // make_streamer_platform_optional.sql). Existing rows keep their
  // historical value; new streamers are created with this null.
  // categories.platform is what actually determines YouTube vs Twitch
  // now, per category — a streamer can have both.
  platform: VideoSource | null;
  avatar_url: string | null;
  bio: string | null;
  // Object path within the "streamer-covers" Storage bucket — same
  // pattern as Category.image_path, just a separate bucket so the
  // existing category image upload flow is untouched.
  cover_path: string | null;
  created_at: string;
}

export type CategoryKind = "official" | "queue";

export interface Category {
  id: string;
  platform: VideoSource;
  name: string;
  slug: string;
  // Object path within the "category-covers" Storage bucket; null
  // means no custom image uploaded — the UI falls back to a gradient.
  image_path: string | null;
  // Optional link to a streamer (public.streamers.id) this category
  // belongs to. Nullable — categories created before this existed
  // keep streamer_id = null. Read by app/streamer/[slug]/page.tsx to
  // show a streamer's own categories.
  streamer_id: string | null;
  // "official" (creator/streamer/admin-only submissions, the original
  // category type) or "queue" (a reaction-request queue — any
  // logged-in user can submit). Existing categories default to
  // "official" via the DB column's own default.
  kind: CategoryKind;
  created_at: string;
}

export interface Profile {
  id: string;
  email: string;
  display_name: string | null;
  avatar_url: string | null;
  role: UserRole;
  points: number;
  created_at: string;
}

export interface Video {
  id: string;
  source: VideoSource;
  youtube_id: string | null;
  twitch_clip_slug: string | null;
  title: string | null;
  thumbnail_url: string | null;
  channel_name: string | null;
  broadcaster_name: string | null;
  // The category's slug (e.g. "music", "lsf") — plain text, matched
  // directly against source + this value, no id/uuid involved. Kept
  // in sync with a category row's slug by submit_video()/
  // submit_twitch_clip(), but this field — not category_id — is what
  // every read (category pages, rate limiting) actually filters on.
  category: string | null;
  // Vestigial — a leftover uuid FK from an earlier design; nothing
  // reads it for filtering anymore (see `category` above). Kept only
  // so existing rows aren't orphaned; safe to ignore.
  category_id: string | null;
  view_count: number | null;
  like_count: number | null;
  dislike_count: number | null;
  published_at: string | null;
  submission_count: number;
  vote_count: number;
  is_removed: boolean;
  created_at: string;
}

export interface Submission {
  id: string;
  video_id: string;
  user_id: string;
  created_at: string;
}

export interface Vote {
  id: string;
  video_id: string;
  user_id: string;
  created_at: string;
}

export interface PointAward {
  id: string;
  video_id: string;
  submission_id: string;
  recipient_id: string;
  creator_id: string;
  points: number;
  created_at: string;
}

export interface VideoCreatorAward {
  video_id: string;
  creator_id: string;
  awarded_at: string;
}

export interface Database {
  public: {
    Tables: {
      profiles: {
        Row: Profile;
        Insert: Partial<Profile> & { id: string; email: string };
        Update: Partial<Profile>;
        Relationships: [];
      };
      categories: {
        Row: Category;
        Insert: Partial<Category> & { platform: VideoSource; name: string; slug: string };
        Update: Partial<Category>;
        Relationships: [
          {
            foreignKeyName: "categories_streamer_id_fkey";
            columns: ["streamer_id"];
            isOneToOne: false;
            referencedRelation: "streamers";
            referencedColumns: ["id"];
          }
        ];
      };
      // Read-only from this app's perspective — the streamers table
      // is managed outside this codebase. Only declared here so
      // app/streamer/[slug]/page.tsx can query it with a real type.
      streamers: {
        Row: Streamer;
        Insert: Partial<Streamer> & { slug: string; display_name: string };
        Update: Partial<Streamer>;
        Relationships: [];
      };
      videos: {
        Row: Video;
        Insert: Partial<Video> & { source: VideoSource };
        Update: Partial<Video>;
        Relationships: [
          {
            foreignKeyName: "videos_category_id_fkey";
            columns: ["category_id"];
            isOneToOne: false;
            referencedRelation: "categories";
            referencedColumns: ["id"];
          }
        ];
      };
      submissions: {
        Row: Submission;
        Insert: Partial<Submission> & { video_id: string; user_id: string };
        Update: Partial<Submission>;
        Relationships: [
          {
            foreignKeyName: "submissions_video_id_fkey";
            columns: ["video_id"];
            isOneToOne: false;
            referencedRelation: "videos";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "submissions_user_id_fkey";
            columns: ["user_id"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          }
        ];
      };
      votes: {
        Row: Vote;
        Insert: Partial<Vote> & { video_id: string; user_id: string };
        Update: Partial<Vote>;
        Relationships: [
          {
            foreignKeyName: "votes_video_id_fkey";
            columns: ["video_id"];
            isOneToOne: false;
            referencedRelation: "videos";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "votes_user_id_fkey";
            columns: ["user_id"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          }
        ];
      };
      point_awards: {
        Row: PointAward;
        Insert: Partial<PointAward>;
        Update: Partial<PointAward>;
        Relationships: [
          {
            foreignKeyName: "point_awards_video_id_fkey";
            columns: ["video_id"];
            isOneToOne: false;
            referencedRelation: "videos";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "point_awards_submission_id_fkey";
            columns: ["submission_id"];
            isOneToOne: false;
            referencedRelation: "submissions";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "point_awards_recipient_id_fkey";
            columns: ["recipient_id"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "point_awards_creator_id_fkey";
            columns: ["creator_id"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          }
        ];
      };
      video_creator_awards: {
        Row: VideoCreatorAward;
        Insert: Partial<VideoCreatorAward>;
        Update: Partial<VideoCreatorAward>;
        Relationships: [
          {
            foreignKeyName: "video_creator_awards_video_id_fkey";
            columns: ["video_id"];
            isOneToOne: false;
            referencedRelation: "videos";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "video_creator_awards_creator_id_fkey";
            columns: ["creator_id"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          }
        ];
      };
    };
    Views: {
      [_ in never]: never;
    };
    Functions: {
      submit_video: {
        Args: {
          p_youtube_id: string;
          p_title: string | null;
          p_thumbnail_url: string | null;
          p_channel_name: string | null;
          p_category: string;
          p_view_count?: number | null;
          p_like_count?: number | null;
          p_dislike_count?: number | null;
          p_published_at?: string | null;
        };
        Returns: Submission;
      };
      award_points: {
        Args: { p_submission_id: string; p_points: number };
        Returns: PointAward;
      };
      award_points_for_video: {
        Args: { p_video_id: string; p_points: number };
        Returns: number;
      };
      undo_award_for_video: {
        Args: { p_video_id: string };
        Returns: number;
      };
      remove_video: {
        Args: { p_video_id: string };
        Returns: undefined;
      };
      remove_category: {
        Args: { p_category_id: string };
        Returns: undefined;
      };
      submit_twitch_clip: {
        Args: {
          p_slug: string;
          p_title: string | null;
          p_thumbnail_url: string | null;
          p_broadcaster_name: string | null;
          p_category: string;
          p_view_count?: number | null;
          p_published_at?: string | null;
        };
        Returns: Submission;
      };
      videos_ranked_by_category: {
        Args: { p_source: VideoSource; p_category: string; p_since: string | null };
        Returns: (Video & { category_name: string | null; window_submission_count: number })[];
      };
    };
    Enums: {
      user_role: UserRole;
      video_source: VideoSource;
    };
    CompositeTypes: {
      [_ in never]: never;
    };
  };
}
