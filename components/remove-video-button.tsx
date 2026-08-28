"use client";

import { useState, useTransition } from "react";
import { removeVideo } from "@/app/actions/videos";
import { Button } from "@/components/ui/button";

export function RemoveVideoButton({ videoId }: { videoId: string }) {
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  function handleClick() {
    // Requirement: show a confirmation before removing. A native
    // confirm() keeps this simple and blocking (no accidental double
    // click racing the transition) without adding a whole dialog
    // component just for this one action.
    const confirmed = window.confirm(
      "Remove this video? It will disappear from the homepage and creator dashboard."
    );
    if (!confirmed) return;

    setError(null);
    startTransition(async () => {
      const result = await removeVideo(videoId);
      if ("error" in result) {
        setError(result.error);
      }
      // On success, the parent page's revalidatePath() makes this
      // video disappear from both lists on next render — no local
      // state needed here.
    });
  }

  return (
    <div className="flex flex-col items-end gap-1">
      <Button
        type="button"
        variant="destructiveOutline"
        size="sm"
        onClick={handleClick}
        disabled={isPending}
      >
        {isPending ? "Removing…" : "Remove"}
      </Button>
      {error && (
        <span className="max-w-[200px] text-right text-xs text-destructive">
          {error}
        </span>
      )}
    </div>
  );
}
