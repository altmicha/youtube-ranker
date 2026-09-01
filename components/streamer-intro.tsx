"use client";

import { useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { updateStreamerIntro, removeStreamerIntro } from "@/app/actions/streamer-intro";
import { parseIntroUrl } from "@/lib/intro-embed";
import { IntroEmbed } from "@/components/intro-embed";

export function StreamerIntro({
  streamerId,
  initialIntroUrl,
  canEdit,
}: {
  streamerId: string;
  initialIntroUrl: string | null;
  canEdit: boolean;
}) {
  const [introUrl, setIntroUrl] = useState(initialIntroUrl);
  const [isEditingUrl, setIsEditingUrl] = useState(false);
  const [draft, setDraft] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  const introInfo = introUrl ? parseIntroUrl(introUrl) : null;

  // Requirement: intro_url empty and visitor isn't an editor -> show
  // nothing at all, not even an empty container.
  if (!canEdit && !introInfo) return null;

  function handleSave() {
    setError(null);
    startTransition(async () => {
      const result = await updateStreamerIntro(streamerId, draft);
      if ("error" in result) {
        setError(result.error);
      } else {
        setIntroUrl(result.introUrl);
        setIsEditingUrl(false);
        setDraft("");
      }
    });
  }

  function handleRemove() {
    setError(null);
    startTransition(async () => {
      const result = await removeStreamerIntro(streamerId);
      if ("error" in result) {
        setError(result.error);
      } else {
        setIntroUrl(null);
      }
    });
  }

  return (
    <div className="flex flex-col gap-2">
      {/* Requirement: autoplay, muted, kept in this column (not
          fullscreen) — all handled inside IntroEmbed itself. */}
      {introInfo && <IntroEmbed info={introInfo} />}

      {canEdit && (
        <div className="flex flex-col gap-2">
          {isEditingUrl ? (
            <>
              <Input
                value={draft}
                onChange={(e) => setDraft(e.target.value)}
                placeholder="YouTube or Twitch clip/video URL"
                disabled={isPending}
                className="h-8 text-sm"
              />
              <div className="flex gap-2">
                <Button size="sm" onClick={handleSave} disabled={isPending}>
                  {isPending ? "Saving…" : "Save"}
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => {
                    setIsEditingUrl(false);
                    setDraft("");
                    setError(null);
                  }}
                  disabled={isPending}
                >
                  Cancel
                </Button>
              </div>
              {error && <p className="text-xs text-destructive">{error}</p>}
            </>
          ) : (
            <div className="flex flex-wrap gap-3">
              <button
                type="button"
                onClick={() => {
                  setDraft(introUrl ?? "");
                  setIsEditingUrl(true);
                }}
                className="w-fit text-left text-xs text-primary hover:underline"
              >
                {introInfo ? "Change intro link" : "Add YouTube/Twitch clip link"}
              </button>
              {introInfo && (
                <button
                  type="button"
                  onClick={handleRemove}
                  disabled={isPending}
                  className="w-fit text-left text-xs text-destructive hover:underline disabled:opacity-50"
                >
                  Remove intro
                </button>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
