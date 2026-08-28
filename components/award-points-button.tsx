"use client";

import { useState, useTransition } from "react";
import { awardPointsForVideo, undoAwardForVideo } from "@/app/actions/points";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";

export function AwardPointsButton({
  videoId,
  initialAlreadyAwarded,
}: {
  videoId: string;
  initialAlreadyAwarded: boolean;
}) {
  const [alreadyAwarded, setAlreadyAwarded] = useState(initialAlreadyAwarded);
  const [message, setMessage] = useState<string | null>(null);
  const [isError, setIsError] = useState(false);
  const [isPending, startTransition] = useTransition();
  const [isUndoing, startUndoTransition] = useTransition();

  function handleAward() {
    if (alreadyAwarded || isPending) return;
    setMessage(null);
    setIsError(false);

    startTransition(async () => {
      const result = await awardPointsForVideo(videoId);
      if ("error" in result) {
        setIsError(true);
        setMessage(result.error);
        if (result.alreadyAwarded) setAlreadyAwarded(true);
        return;
      }
      setAlreadyAwarded(true);
      setMessage(
        result.awardedCount > 0
          ? `Awarded points to ${result.awardedCount} submitter${
              result.awardedCount === 1 ? "" : "s"
            }.`
          : "No submitters to award."
      );
    });
  }

  function handleUndo() {
    if (!alreadyAwarded || isUndoing) return;
    setMessage(null);
    setIsError(false);

    startUndoTransition(async () => {
      const result = await undoAwardForVideo(videoId);
      if ("error" in result) {
        setIsError(true);
        setMessage(result.error);
        return;
      }
      setAlreadyAwarded(false);
      setMessage(
        result.undoneCount > 0
          ? `Undone — removed points from ${result.undoneCount} submitter${
              result.undoneCount === 1 ? "" : "s"
            }.`
          : "Undone."
      );
    });
  }

  return (
    <div className="flex flex-col items-end gap-1">
      {alreadyAwarded ? (
        <div className="flex items-center gap-2">
          <Badge variant="muted" className="whitespace-nowrap">
            Award points already rewarded
          </Badge>
          <Button
            type="button"
            variant="destructiveOutline"
            size="sm"
            onClick={handleUndo}
            disabled={isUndoing}
          >
            {isUndoing ? "Undoing…" : "Undo"}
          </Button>
        </div>
      ) : (
        <Button type="button" size="sm" onClick={handleAward} disabled={isPending}>
          {isPending ? "Awarding…" : "Select & Award Points"}
        </Button>
      )}
      {message && (
        <span
          className={`max-w-[220px] text-right text-xs ${
            isError ? "text-destructive" : "text-emerald-700"
          }`}
        >
          {message}
        </span>
      )}
    </div>
  );
}
