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

// Minimal shape for the Owner picker — just what's needed to label
// each option (display_name if set, else email) and identify it.
export interface OwnerOption {
  id: string;
  email: string;
  display_name: string | null;
}

function ownerLabel(owner: OwnerOption): string {
  return owner.display_name?.trim() || owner.email;
}

function OwnerSelect({
  value,
  onChange,
  owners,
  disabled,
}: {
  value: string;
  onChange: (id: string) => void;
  owners: OwnerOption[];
  disabled?: boolean;
}) {
  return (
    <select
      value={value}
      onChange={(e) => onChange(e.target.value)}
      disabled={disabled}
      aria-label="Owner"
      className="h-8 rounded-md border border-input bg-background px-2 text-sm shadow-sm disabled:cursor-not-allowed disabled:opacity-50"
    >
      {/* Optional field — an empty selection is valid and means no owner. */}
      <option value="">No owner</option>
      {owners.map((owner) => (
        <option key={owner.id} value={owner.id}>
          {ownerLabel(owner)}
        </option>
      ))}
    </select>
  );
}

function StreamerRow({
  streamer,
  owners,
  ownerLabelById,
  onRemoved,
}: {
  streamer: Streamer;
  owners: OwnerOption[];
  // Current owner's label, looked up by the parent (which has the
  // full owner list) — null if this streamer has no owner set.
  ownerLabelById: Map<string, string>;
  onRemoved: (id: string) => void;
}) {
  const [currentName, setCurrentName] = useState(streamer.display_name);
  const [currentBio, setCurrentBio] = useState(streamer.bio ?? "");
  const [currentTwitchLogin, setCurrentTwitchLogin] = useState(streamer.twitch_login ?? "");
  const [currentOwnerId, setCurrentOwnerId] = useState(streamer.owner_id ?? "");
  const [currentCoverPath, setCurrentCoverPath] = useState(streamer.cover_path);
  const [isEditing, setIsEditing] = useState(false);
  const [draftName, setDraftName] = useState(streamer.display_name);
  const [draftBio, setDraftBio] = useState(streamer.bio ?? "");
  const [draftTwitchLogin, setDraftTwitchLogin] = useState(streamer.twitch_login ?? "");
  const [draftOwnerId, setDraftOwnerId] = useState(streamer.owner_id ?? "");
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
      const result = await updateStreamer(
        streamer.id,
        streamer.slug,
        trimmed,
        draftBio,
        draftTwitchLogin,
        draftOwnerId
      );
      if ("error" in result) {
        setIsError(true);
        setMessage(result.error);
      } else {
        setCurrentName(trimmed);
        setCurrentBio(draftBio.trim());
        setCurrentTwitchLogin(draftTwitchLogin.trim().toLowerCase());
        setCurrentOwnerId(draftOwnerId);
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
            <Input
              value={draftTwitchLogin}
              onChange={(e) => setDraftTwitchLogin(e.target.value)}
              placeholder="Twitch username (optional, for live status)"
              className="h-8 max-w-[320px] text-sm"
              disabled={isPending}
            />
            <div className="flex items-center gap-1.5">
              <span className="text-xs text-muted-foreground">Owner:</span>
              <OwnerSelect value={draftOwnerId} onChange={setDraftOwnerId} owners={owners} disabled={isPending} />
            </div>
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
                  setDraftTwitchLogin(currentTwitchLogin);
                  setDraftOwnerId(currentOwnerId);
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
            <p className="truncate text-xs text-muted-foreground">
              /{streamer.slug}
              {currentTwitchLogin && ` · twitch.tv/${currentTwitchLogin}`}
              {currentOwnerId && ` · owner: ${ownerLabelById.get(currentOwnerId) ?? "unknown"}`}
            </p>
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
              setDraftTwitchLogin(currentTwitchLogin);
              setDraftOwnerId(currentOwnerId);
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
  owners,
  onStreamersChange,
}: {
  initialStreamers: Streamer[];
  // Fetched by app/creator/page.tsx from profiles (publicly readable)
  // — every profile is a candidate owner, not just creators.
  owners: OwnerOption[];
  // Lets the parent (creator page) keep CategoryManager's streamer
  // picker options in sync as streamers are added/removed here,
  // without a full page reload.
  onStreamersChange?: (streamers: Streamer[]) => void;
}) {
  const [streamers, setStreamers] = useState(initialStreamers);
  const [newName, setNewName] = useState("");
  const [newSlug, setNewSlug] = useState("");
  const [newBio, setNewBio] = useState("");
  const [newTwitchLogin, setNewTwitchLogin] = useState("");
  const [newOwnerId, setNewOwnerId] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  const ownerLabelById = new Map(owners.map((o) => [o.id, ownerLabel(o)]));

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
      const result = await createStreamer(newName.trim(), newSlug.trim(), newBio, newTwitchLogin, newOwnerId);
      if ("error" in result) {
        setError(result.error);
      } else {
        updateAndNotify(
          [...streamers, result.streamer].sort((a, b) => a.display_name.localeCompare(b.display_name))
        );
        setNewName("");
        setNewSlug("");
        setNewBio("");
        setNewTwitchLogin("");
        setNewOwnerId("");
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
            owners={owners}
            ownerLabelById={ownerLabelById}
            onRemoved={(id) => updateAndNotify(streamers.filter((st) => st.id !== id))}
          />
        ))}
        {streamers.length === 0 && (
          <p className="text-sm text-muted-foreground">No streamers yet.</p>
        )}
      </div>

      <form onSubmit={handleAdd} className="flex flex-wrap items-center gap-2">
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
        <Input
          value={newTwitchLogin}
          onChange={(e) => setNewTwitchLogin(e.target.value)}
          placeholder="Twitch username (optional, for live status)"
          disabled={isPending}
          className="h-9 flex-1"
        />
        <OwnerSelect value={newOwnerId} onChange={setNewOwnerId} owners={owners} disabled={isPending} />
        <Button type="submit" size="sm" disabled={isPending}>
          {isPending ? "Adding…" : "Add streamer"}
        </Button>
      </form>
      {error && <p className="text-xs text-destructive">{error}</p>}
    </div>
  );
}
