"use client";

import { useState, useTransition } from "react";
import { submitVideo } from "@/app/actions/videos";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import type { VideoSource, Category } from "@/lib/types/database.types";
import { cn } from "@/lib/utils";

export function SubmitVideoForm({
  platform,
  categories,
}: {
  // Which platform this form instance is locked to — determines the
  // placeholder text, the wrong-URL error message, and gets passed
  // to submitVideo() so it can reject a URL that doesn't match.
  platform: VideoSource;
  // This platform's own live category list, fetched by the page from
  // the categories table — never a hardcoded array.
  categories: Category[];
}) {
  const [url, setUrl] = useState("");
  // Category is required — no default selected, so submitting with
  // the placeholder still in place is blocked by `required` on the
  // <select> plus the empty-string check below. The value stored here
  // is the category's SLUG (e.g. "music"), not its id — that's the
  // same value category pages filter by, so what gets selected here
  // is exactly what ends up saved on the video and exactly what
  // /youtube/music (etc.) looks for. No id enters this flow at all.
  const [categorySlug, setCategorySlug] = useState<string>("");
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  const platformLabel = platform === "youtube" ? "YouTube video" : "Twitch clip";

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setSuccess(null);

    if (!categorySlug) {
      setError("Choose a category first.");
      return;
    }

    startTransition(async () => {
      const result = await submitVideo(url, categorySlug, platform);
      if ("error" in result) {
        setError(result.error);
      } else {
        setSuccess("Submitted!");
        setUrl("");
        setCategorySlug("");
      }
    });
  }

  return (
    <Card>
      <CardContent className="py-5">
        <form onSubmit={handleSubmit} className="flex flex-col gap-3">
          <div className="flex flex-col gap-2 sm:flex-row">
            <div className="relative flex-1">
              <Input
                type="url"
                required
                value={url}
                onChange={(e) => setUrl(e.target.value)}
                placeholder={`Paste a ${platformLabel} URL…`}
                disabled={isPending}
                className="h-11 pr-9 text-base"
              />
              {url && (
                <button
                  type="button"
                  aria-label="Clear"
                  onClick={() => setUrl("")}
                  disabled={isPending}
                  className="absolute right-2 top-1/2 flex h-6 w-6 -translate-y-1/2 items-center justify-center rounded-full text-muted-foreground hover:bg-muted hover:text-foreground disabled:opacity-50"
                >
                  ✕
                </button>
              )}
            </div>

            <select
              required
              value={categorySlug}
              onChange={(e) => setCategorySlug(e.target.value)}
              disabled={isPending || categories.length === 0}
              aria-label="Category"
              className={cn(
                "h-11 rounded-md border border-input bg-background px-3 text-sm shadow-sm transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50",
                !categorySlug && "text-muted-foreground"
              )}
            >
              <option value="" disabled>
                Category…
              </option>
              {categories.map((c) => (
                <option key={c.id} value={c.slug} className="text-foreground">
                  {c.name}
                </option>
              ))}
            </select>

            <Button type="submit" disabled={isPending} size="lg" className="h-11">
              {isPending ? "Submitting…" : "Submit"}
            </Button>
          </div>

          {error && (
            <p className="rounded-md bg-destructive/10 px-3 py-2 text-sm text-destructive">
              {error}
            </p>
          )}
          {success && (
            <p className="rounded-md bg-emerald-50 px-3 py-2 text-sm text-emerald-700 dark:bg-emerald-950/50 dark:text-emerald-400">
              {success}
            </p>
          )}
        </form>
      </CardContent>
    </Card>
  );
}
