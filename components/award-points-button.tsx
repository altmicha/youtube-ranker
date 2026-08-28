"use client";

import { useState, useTransition } from "react";
import { awardPointsForVideo, undoAwardForVideo } from "@/app/actions/points";

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
          <span className="whitespace-nowrap rounded-md border border-gray-200 bg-gray-100 px-3 py-1.5 text-sm font-medium text-gray-400">
            Award points already rewarded
          </span>
          <button
            onClick={handleUndo}
            disabled={isUndoing}
            className="whitespace-nowrap rounded-md border border-red-200 px-2 py-1.5 text-xs font-medium text-red-600 hover:bg-red-50 disabled:opacity-50"
          >
            {isUndoing ? "Undoing..." : "Undo"}
          </button>
        </div>
      ) : (
        <button
          onClick={handleAward}
          disabled={isPending}
          className="whitespace-nowrap rounded-md bg-black px-3 py-1.5 text-sm font-medium text-white hover:bg-gray-800 disabled:opacity-50"
        >
          {isPending ? "Awarding..." : "Select & Award Points"}
        </button>
      )}
      {message && (
        <span
          className={`max-w-[260px] text-right text-xs ${
            isError ? "text-red-600" : "text-green-700"
          }`}
        >
          {message}
        </span>
      )}
    </div>
  );
}
