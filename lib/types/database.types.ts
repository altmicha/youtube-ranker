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
  submission_count: number;
  vote_count: number;
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
    };
    Enums: {
      user_role: UserRole;
    };
    CompositeTypes: {
      [_ in never]: never;
    };
  };
}
