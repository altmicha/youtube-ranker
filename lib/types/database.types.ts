// Hand-written types matching supabase/schema.sql.
// Once your project is running, you can replace this file with a
// generated one for perfect accuracy:
//   npx supabase gen types typescript --project-id <ref> > lib/types/database.types.ts

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
      };
      videos: {
        Row: Video;
        Insert: Partial<Video> & { youtube_id: string };
        Update: Partial<Video>;
      };
      submissions: {
        Row: Submission;
        Insert: Partial<Submission> & { video_id: string; user_id: string };
        Update: Partial<Submission>;
      };
      votes: {
        Row: Vote;
        Insert: Partial<Vote> & { video_id: string; user_id: string };
        Update: Partial<Vote>;
      };
      point_awards: {
        Row: PointAward;
        Insert: Partial<PointAward>;
        Update: Partial<PointAward>;
      };
      video_creator_awards: {
        Row: VideoCreatorAward;
        Insert: Partial<VideoCreatorAward>;
        Update: Partial<VideoCreatorAward>;
      };
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
  };
}
