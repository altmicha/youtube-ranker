"use client";

import { useRef, useState, useTransition } from "react";
import {
  createStreamer,
  updateStreamer,
  removeStreamer,
  uploadStreamerCoverImage,
} from "@/app/actions/streamers";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import type { Streamer } from "@/lib/types/database.types";
import { streamerCoverUrl } from "@/lib/streamer-image";

function StreamerRow({
  streamer,
  onRemoved,
}: {
  streamer: Streamer;
  onRemoved: (id: string) => void;
}) {
  const [currentName, setCurrentName] = useState(streamer.display_name);
  const [currentBio, setCurrentBio] = useState(streamer.bio ?? "");
  const [currentCoverPath, setCurrentCoverPath] = useState(streamer.cover_path);
  const [isEditing, setIsEditing] = useState(false);
  const [draftName, setDraftName] = useState(streamer.display_name);
  const [draftBio, setDraftBio] = useState(streamer.bio ?? "");
  const [message, setMessage] = useState<string | null>(null);
  const [isError, setIsError] = useState(false);
  const [isPending, startTransition] = useTransition();
  const fileInputRef = useRef<HTMLInputElement>(null);

  function handleSave() {
    const trimmed = draftName.trim();
    if (!trimmed) {
      setIsError(true);
      setMessage("Enter a streamer name.");
      return;
    }
    setMessage(null);
    startTransition(async () => {
      const result = await updateStreamer(streamer.id, streamer.slug, trimmed, draftBio);
      if ("error" in result) {
        setIsError(true);
        setMessage(result.error);
      } else {
        setCurrentName(trimmed);
        setCurrentBio(draftBio.trim());
        setIsError(false);
        setMessage(null);
        setIsEditing(false);
      }
    });
  }

  function handleRemove() {
    const confirmed = window.confirm(
      `Remove "${currentName}"? Categories that belong to this streamer won't be deleted — they'll need a new streamer assigned before they can be edited again.`
    );
    if (!confirmed) return;

    startTransition(async () => {
      const result = await removeStreamer(streamer.id, streamer.slug);
      if ("error" in result) {
        setIsError(true);
        setMessage(result.error);
      } else {
        onRemoved(streamer.id);
      }
    });
  }

  function handleImageChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setMessage(null);

    const formData = new FormData();
    formData.set("image", file);

    startTransition(async () => {
      const result = await uploadStreamerCoverImage(streamer.id, streamer.slug, formData);
      if ("error" in result) {
        setIsError(true);
        setMessage(result.error);
      } else {
        setCurrentCoverPath(streamer.id);
        setIsError(false);
        setMessage(null);
      }
      if (fileInputRef.current) fileInputRef.current.value = "";
    });
  }

  const coverUrl = streamerCoverUrl(currentCoverPath);

  return (
    <div className="flex flex-wrap items-center gap-3 rounded-md border p-2">
      {/* Same fixed 48x48 dashboard thumbnail treatment as
          CategoryRow — belt-and-suspenders sizing via inline style so
          nothing external can stretch it. */}
      <div
        className="block flex-shrink-0 overflow-hidden rounded-full bg-muted"
        style={{ width: 48, height: 48 }}
      >
        {coverUrl && (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={coverUrl}
            alt=""
            width={48}
            height={48}
            className="block h-full w-full object-cover"
            style={{ width: 48, height: 48, objectFit: "cover" }}
          />
        )}
      </div>

      <div className="min-w-0 flex-1">
        {isEditing ? (
          <div className="flex flex-col gap-1.5">
            <Input
              value={draftName}
              onChange={(e) => setDraftName(e.target.value)}
              className="h-8 max-w-[220px] text-sm"
              disabled={isPending}
              autoFocus
            />
            <Input
              value={draftBio}
              onChange={(e) => setDraftBio(e.target.value)}
              placeholder="Bio (optional)"
              className="h-8 max-w-[320px] text-sm"
              disabled={isPending}
            />
            <div className="flex gap-1.5">
              <Button size="sm" onClick={handleSave} disabled={isPending}>
                Save
              </Button>
              <Button
                size="sm"
                variant="outline"
                onClick={() => {
                  setIsEditing(false);
                  setDraftName(currentName);
                  setDraftBio(currentBio);
                }}
                disabled={isPending}
              >
                Cancel
              </Button>
            </div>
          </div>
        ) : (
          <>
            <p className="truncate text-sm font-medium">{currentName}</p>
            <p className="truncate text-xs text-muted-foreground">/{streamer.slug}</p>
            {currentBio && <p className="mt-0.5 line-clamp-2 text-xs text-muted-foreground">{currentBio}</p>}
          </>
        )}
        {message && (
          <p className={`mt-0.5 text-xs ${isError ? "text-destructive" : "text-emerald-700 dark:text-emerald-400"}`}>
            {message}
          </p>
        )}
      </div>

      {!isEditing && (
        <div className="flex flex-shrink-0 items-center gap-1.5">
          <Button
            type="button"
            size="sm"
            variant="outline"
            onClick={() => {
              setDraftName(currentName);
              setDraftBio(currentBio);
              setIsEditing(true);
            }}
            disabled={isPending}
          >
            Edit
          </Button>
          <Button
            type="button"
            size="sm"
            variant="outline"
            onClick={() => fileInputRef.current?.click()}
            disabled={isPending}
          >
            {coverUrl ? "Change image" : "Add image"}
          </Button>
          <input
            ref={fileInputRef}
            type="file"
            accept="image/*"
            className="hidden"
            onChange={handleImageChange}
          />
          <Button
            type="button"
            size="sm"
            variant="destructiveOutline"
            onClick={handleRemove}
            disabled={isPending}
          >
            Remove
          </Button>
        </div>
      )}
    </div>
  );
}

// Requirement 1/2: one unified list — a streamer is no longer
// YouTube-only or Twitch-only, so there's no platform prop here
// anymore. A streamer's YouTube vs Twitch categories are managed
// separately in CategoryManager, which is still per-platform (that's
// where "type: YouTube or Twitch" is actually picked, per category).
export function StreamerManager({
  initialStreamers,
  onStreamersChange,
}: {
  initialStreamers: Streamer[];
  // Lets the parent (creator page) keep CategoryManager's streamer
  // picker options in sync as streamers are added/removed here,
  // without a full page reload.
  onStreamersChange?: (streamers: Streamer[]) => void;
}) {
  const [streamers, setStreamers] = useState(initialStreamers);
  const [newName, setNewName] = useState("");
  const [newSlug, setNewSlug] = useState("");
  const [newBio, setNewBio] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  function updateAndNotify(next: Streamer[]) {
    setStreamers(next);
    onStreamersChange?.(next);
  }

  function handleAdd(e: React.FormEvent) {
    e.preventDefault();
    setError(null);

    if (!newName.trim()) {
      setError("Enter a streamer name.");
      return;
    }
    if (!newSlug.trim()) {
      setError("Enter a slug.");
      return;
    }

    startTransition(async () => {
      const result = await createStreamer(newName.trim(), newSlug.trim(), newBio);
      if ("error" in result) {
        setError(result.error);
      } else {
        updateAndNotify(
          [...streamers, result.streamer].sort((a, b) => a.display_name.localeCompare(b.display_name))
        );
        setNewName("");
        setNewSlug("");
        setNewBio("");
      }
    });
  }

  return (
    <div className="flex flex-col gap-3">
      <h3 className="text-sm font-semibold">Streamers</h3>

      <div className="flex flex-col gap-2">
        {streamers.map((s) => (
          <StreamerRow
            key={s.id}
            streamer={s}
            onRemoved={(id) => updateAndNotify(streamers.filter((st) => st.id !== id))}
          />
        ))}
        {streamers.length === 0 && (
          <p className="text-sm text-muted-foreground">No streamers yet.</p>
        )}
      </div>

      <form onSubmit={handleAdd} className="flex flex-wrap gap-2">
        <Input
          value={newName}
          onChange={(e) => setNewName(e.target.value)}
          placeholder="Streamer name…"
          disabled={isPending}
          className="h-9 flex-1"
        />
        <Input
          value={newSlug}
          onChange={(e) => setNewSlug(e.target.value)}
          placeholder="slug"
          disabled={isPending}
          className="h-9 w-28"
        />
        <Input
          value={newBio}
          onChange={(e) => setNewBio(e.target.value)}
          placeholder="Bio (optional)"
          disabled={isPending}
          className="h-9 flex-1"
        />
        <Button type="submit" size="sm" disabled={isPending}>
          {isPending ? "Adding…" : "Add streamer"}
        </Button>
      </form>
      {error && <p className="text-xs text-destructive">{error}</p>}
    </div>
  );
}
