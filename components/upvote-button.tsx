"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { upvoteVideo, removeUpvote } from "@/app/actions/votes";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

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
    <div className="flex flex-col items-center gap-0.5">
      <Button
        type="button"
        variant={upvoted ? "default" : "outline"}
        size="sm"
        onClick={handleClick}
        disabled={isPending}
        title={!isLoggedIn ? "Sign in to upvote" : undefined}
        className={cn("flex-col gap-0 px-3 py-1.5 leading-tight", upvoted && "shadow")}
      >
        <span aria-hidden className="text-base leading-none">
          ▲
        </span>
        <span className="text-[11px] font-semibold">{count}</span>
      </Button>
      {error && (
        <span className="max-w-[90px] text-center text-[10px] text-destructive">
          {error}
        </span>
      )}
    </div>
  );
}
