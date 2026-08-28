"use client";

import { useState, useTransition } from "react";
import { submitVideo } from "@/app/actions/videos";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { SELECTABLE_CATEGORIES, type SelectableVideoCategory } from "@/lib/types/database.types";
import { cn } from "@/lib/utils";

export function SubmitVideoForm() {
  const [url, setUrl] = useState("");
  // Requirement 5: category is required — no default selected, so
  // submitting with the placeholder still in place is blocked by
  // `required` on the <select> plus the empty-string check below.
  const [category, setCategory] = useState<SelectableVideoCategory | "">("");
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setSuccess(null);

    if (!category) {
      setError("Choose a category first.");
      return;
    }

    startTransition(async () => {
      const result = await submitVideo(url, category);
      if ("error" in result) {
        setError(result.error);
      } else {
        setSuccess("Video submitted!");
        setUrl("");
        setCategory("");
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
                placeholder="Paste a YouTube video URL…"
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
              value={category}
              onChange={(e) => setCategory(e.target.value as SelectableVideoCategory)}
              disabled={isPending}
              aria-label="Category"
              className={cn(
                "h-11 rounded-md border border-input bg-background px-3 text-sm shadow-sm transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50",
                !category && "text-muted-foreground"
              )}
            >
              <option value="" disabled>
                Category…
              </option>
              {SELECTABLE_CATEGORIES.map((c) => (
                <option key={c} value={c} className="text-foreground">
                  {c}
                </option>
              ))}
            </select>

            <Button type="submit" disabled={isPending} size="lg" className="h-11">
              {isPending ? "Submitting…" : "Submit video"}
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
