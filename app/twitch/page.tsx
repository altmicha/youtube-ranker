import Link from "next/link";
import { getCurrentProfile } from "@/lib/auth/roles";
import { SubmitVideoForm } from "@/components/submit-video-form";
import { CategoryGrid } from "@/components/category-grid";
import { TWITCH_SELECTABLE_CATEGORIES } from "@/lib/types/database.types";
import { buttonVariants } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { cn } from "@/lib/utils";

export default async function TwitchPage() {
  const profile = await getCurrentProfile();

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-end justify-between gap-2">
        <div>
          <h1 className="text-xl font-bold tracking-tight sm:text-2xl">
            Twitch
          </h1>
          <p className="text-sm text-muted-foreground">
            Pick a category to see its ranked clips.
          </p>
        </div>
        <Link
          href="/videos"
          className="text-sm font-medium text-primary underline-offset-4 hover:underline"
        >
          All videos →
        </Link>
      </div>

      <CategoryGrid categories={TWITCH_SELECTABLE_CATEGORIES} basePath="/twitch" />

      {profile ? (
        <SubmitVideoForm platform="twitch" categories={TWITCH_SELECTABLE_CATEGORIES} />
      ) : (
        <Card className="border-dashed">
          <CardContent className="flex flex-col items-center gap-2 py-6 text-center">
            <p className="text-sm text-muted-foreground">
              Log in to submit a clip and vote.
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
