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

export type UserRole = "user" | "creator";

// All 12 values that exist in the Postgres video_category enum.
// Some of these are no longer offered in the UI (see
// SELECTABLE_CATEGORIES below) but a video row can still legitimately
// carry one — either a legacy video submitted before a category was
// removed, or one migrated into "Variety" as the hidden fallback
// bucket. This is what Video.category and the Postgres enum are
// typed against, so reads/writes always match what the DB can hold.
export const VIDEO_CATEGORIES = [
  "Gaming",
  "Funny",
  "LSF",
  "Cop Slop",
  "React",
  "IRL",
  "Slots",
  "Sports",
  "Horror",
  "Variety",
  "Music",
  "Just Chatting",
] as const;

export type VideoCategory = (typeof VIDEO_CATEGORIES)[number];

// Categories users can currently browse (homepage grid, /category/*
// routes) or pick when submitting a video. "All", "Just Chatting",
// "IRL", "Slots", and "Variety" were removed from the UI — existing
// videos in those categories were migrated to "Variety" (see
// supabase/schema.sql), which stays a valid DB value and now serves
// only as an invisible catch-all: those videos are still visible on
// /videos (unfiltered) but have no category tile or route of their
// own anymore.
export const SELECTABLE_CATEGORIES = [
  "Gaming",
  "Funny",
  "LSF",
  "Cop Slop",
  "React",
  "Sports",
  "Horror",
  "Music",
] as const satisfies readonly VideoCategory[];

export type SelectableVideoCategory = (typeof SELECTABLE_CATEGORIES)[number];

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
  youtube_id: string;
  title: string | null;
  thumbnail_url: string | null;
  channel_name: string | null;
  category: VideoCategory;
  view_count: number | null;
  like_count: number | null;
  dislike_count: number | null;
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
      videos: {
        Row: Video;
        Insert: Partial<Video> & { youtube_id: string };
        Update: Partial<Video>;
        Relationships: [];
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
          p_category: SelectableVideoCategory;
          p_view_count?: number | null;
          p_like_count?: number | null;
          p_dislike_count?: number | null;
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
    };
    Enums: {
      user_role: UserRole;
      video_category: VideoCategory;
    };
    CompositeTypes: {
      [_ in never]: never;
    };
  };
}
