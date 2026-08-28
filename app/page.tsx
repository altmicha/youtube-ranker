import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { getCurrentProfile } from "@/lib/auth/roles";
import { SubmitVideoForm } from "@/components/submit-video-form";
import { CategoryGrid } from "@/components/category-grid";
import { buttonVariants } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { cn } from "@/lib/utils";
import type { VideoCategory } from "@/lib/types/database.types";

export default async function HomePage() {
  const [profile, supabase] = [await getCurrentProfile(), await createClient()];

  // Lightweight: just the category column for every non-removed
  // video, so we can show a per-category count on each poster
  // without pulling full video rows onto the homepage.
  const { data: categoryRows } = await supabase
    .from("videos")
    .select("category")
    .eq("is_removed", false);

  const counts: Partial<Record<VideoCategory, number>> = {};
  for (const row of categoryRows ?? []) {
    counts[row.category] = (counts[row.category] ?? 0) + 1;
  }

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-end justify-between gap-2">
        <div>
          <h1 className="text-xl font-bold tracking-tight sm:text-2xl">
            Browse categories
          </h1>
          <p className="text-sm text-muted-foreground">
            Pick a category to see its ranked videos.
          </p>
        </div>
        <Link
          href="/videos"
          className="text-sm font-medium text-primary underline-offset-4 hover:underline"
        >
          Browse all videos →
        </Link>
      </div>

      <CategoryGrid counts={counts} />

      {profile ? (
        <SubmitVideoForm />
      ) : (
        <Card className="border-dashed">
          <CardContent className="flex flex-col items-center gap-2 py-6 text-center">
            <p className="text-sm text-muted-foreground">
              Log in to submit a video and vote.
            </p>
            <Link href="/login" className={cn(buttonVariants({ size: "sm" }))}>
              Log in
            </Link>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
