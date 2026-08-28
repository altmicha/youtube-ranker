"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { upvoteVideo, removeUpvote } from "@/app/actions/votes";

export function UpvoteButton({
  videoId,
  voteCount,
  initialUpvoted,
  isLoggedIn,
}: {
  videoId: string;
  voteCount: number;
  initialUpvoted: boolean;
  isLoggedIn: boolean;
}) {
  const [upvoted, setUpvoted] = useState(initialUpvoted);
  const [count, setCount] = useState(voteCount);
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();
  const router = useRouter();

  function handleClick() {
    if (!isLoggedIn) {
      router.push("/login");
      return;
    }
    if (isPending) return;

    setError(null);

    if (upvoted) {
      // Toggle off: optimistically flip back to "Upvote" and
      // decrement the count, then remove the vote row.
      setUpvoted(false);
      setCount((c) => c - 1);

      startTransition(async () => {
        const result = await removeUpvote(videoId);
        if ("error" in result) {
          setUpvoted(true);
          setCount((c) => c + 1);
          setError(result.error);
        }
      });
    } else {
      // Toggle on: optimistically flip to "Upvoted" and increment.
      setUpvoted(true);
      setCount((c) => c + 1);

      startTransition(async () => {
        const result = await upvoteVideo(videoId);
        if ("error" in result) {
          setUpvoted(false);
          setCount((c) => c - 1);
          setError(result.error);
        }
      });
    }
  }

  return (
    <div className="flex flex-col items-center">
      <button
        onClick={handleClick}
        disabled={isPending}
        title={!isLoggedIn ? "Sign in to upvote" : undefined}
        className={`rounded-md border px-3 py-1.5 text-sm font-medium transition-colors disabled:opacity-50 ${
          upvoted
            ? "border-blue-300 bg-blue-50 text-blue-700 hover:bg-blue-100"
            : "hover:bg-gray-50"
        }`}
      >
        {upvoted ? "Upvoted" : "Upvote"}
      </button>
      <span className="mt-1 text-xs text-muted-foreground">
        {count} {count === 1 ? "vote" : "votes"}
      </span>
      {error && <span className="mt-1 text-xs text-red-600">{error}</span>}
    </div>
  );
}
