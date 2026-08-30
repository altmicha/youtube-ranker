"use client";

import { useRef, useState, useTransition } from "react";
import {
  createCategory,
  updateCategory,
  removeCategory,
  uploadCategoryImage,
} from "@/app/actions/categories";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import type { Category, Streamer, VideoSource } from "@/lib/types/database.types";
import { categoryImageUrl } from "@/lib/category-image";

function StreamerSelect({
  value,
  onChange,
  streamers,
  disabled,
}: {
  value: string;
  onChange: (id: string) => void;
  streamers: Streamer[];
  disabled?: boolean;
}) {
  return (
    <select
      required
      value={value}
      onChange={(e) => onChange(e.target.value)}
      disabled={disabled || streamers.length === 0}
      aria-label="Streamer"
      className="h-8 rounded-md border border-input bg-background px-2 text-sm shadow-sm disabled:cursor-not-allowed disabled:opacity-50"
    >
      <option value="" disabled>
        {streamers.length === 0 ? "No streamers yet" : "Streamer…"}
      </option>
      {streamers.map((s) => (
        <option key={s.id} value={s.id}>
          {s.display_name}
        </option>
      ))}
    </select>
  );
}

function CategoryRow({
  category,
  platform,
  streamers,
  streamerName,
  onRemoved,
}: {
  category: Category;
  platform: VideoSource;
  streamers: Streamer[];
  // Current streamer's display name, looked up by the parent (which
  // has the full streamer list) — null if this category predates
  // streamers, or its streamer was since removed.
  streamerName: string | null;
  onRemoved: (id: string) => void;
}) {
  // Local, self-contained display state — updated directly on a
  // successful action rather than waiting on a full page reload.
  const [currentName, setCurrentName] = useState(category.name);
  const [currentStreamerId, setCurrentStreamerId] = useState(category.streamer_id ?? "");
  const [currentStreamerName, setCurrentStreamerName] = useState(streamerName);
  const [currentImagePath, setCurrentImagePath] = useState(category.image_path);
  const [isEditing, setIsEditing] = useState(false);
  const [draftName, setDraftName] = useState(category.name);
  const [draftStreamerId, setDraftStreamerId] = useState(category.streamer_id ?? "");
  const [message, setMessage] = useState<string | null>(null);
  const [isError, setIsError] = useState(false);
  const [isPending, startTransition] = useTransition();
  const fileInputRef = useRef<HTMLInputElement>(null);

  function handleSave() {
    const trimmed = draftName.trim();
    if (!draftStreamerId) {
      setIsError(true);
      setMessage("Choose a streamer for this category.");
      return;
    }
    if (!trimmed) {
      setIsError(true);
      setMessage("Enter a category name.");
      return;
    }
    setMessage(null);
    startTransition(async () => {
      const result = await updateCategory(category.id, trimmed, draftStreamerId, platform);
      if ("error" in result) {
        setIsError(true);
        setMessage(result.error);
      } else {
        setCurrentName(trimmed);
        setCurrentStreamerId(draftStreamerId);
        setCurrentStreamerName(streamers.find((s) => s.id === draftStreamerId)?.display_name ?? null);
        setIsError(false);
        setMessage(null);
        setIsEditing(false);
      }
    });
  }

  function handleRemove() {
    const confirmed = window.confirm(
      `Remove "${currentName}"? Its videos won't be deleted — they'll move to Uncategorized and stay visible on the All videos page.`
    );
    if (!confirmed) return;

    startTransition(async () => {
      const result = await removeCategory(category.id, platform);
      if ("error" in result) {
        setIsError(true);
        setMessage(result.error);
      } else {
        onRemoved(category.id);
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
      const result = await uploadCategoryImage(category.id, platform, formData);
      if ("error" in result) {
        setIsError(true);
        setMessage(result.error);
      } else {
        setCurrentImagePath(category.id);
        setIsError(false);
        setMessage(null);
      }
      if (fileInputRef.current) fileInputRef.current.value = "";
    });
  }

  const imageUrl = categoryImageUrl(currentImagePath);

  return (
    <div className="flex flex-wrap items-center gap-3 rounded-md border p-2">
      {/*
        Fixed 48x48 thumbnail — deliberately NOT the same
        component/sizing as the public category card
        (components/category-grid.tsx, which stays h-48 w-36 and is
        untouched by this).
      */}
      <div
        className="block flex-shrink-0 overflow-hidden rounded bg-muted"
        style={{ width: 48, height: 48 }}
      >
        {imageUrl && (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={imageUrl}
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
          <div className="flex flex-wrap gap-1.5">
            <Input
              value={draftName}
              onChange={(e) => setDraftName(e.target.value)}
              className="h-8 max-w-[160px] text-sm"
              disabled={isPending}
              autoFocus
            />
            <StreamerSelect
              value={draftStreamerId}
              onChange={setDraftStreamerId}
              streamers={streamers}
              disabled={isPending}
            />
            <Button size="sm" onClick={handleSave} disabled={isPending}>
              Save
            </Button>
            <Button
              size="sm"
              variant="outline"
              onClick={() => {
                setIsEditing(false);
                setDraftName(currentName);
                setDraftStreamerId(currentStreamerId);
              }}
              disabled={isPending}
            >
              Cancel
            </Button>
          </div>
        ) : (
          <>
            <p className="truncate text-sm font-medium">{currentName}</p>
            <p className="truncate text-xs text-muted-foreground">
              {currentStreamerName ?? "No streamer assigned"}
            </p>
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
              setDraftStreamerId(currentStreamerId);
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
            {imageUrl ? "Change image" : "Add image"}
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

export function CategoryManager({
  platform,
  initialCategories,
  streamers,
}: {
  platform: VideoSource;
  initialCategories: Category[];
  // This platform's streamers, fetched by the creator page — used to
  // populate both the add-category and edit-category streamer pickers.
  streamers: Streamer[];
}) {
  const [categories, setCategories] = useState(initialCategories);
  const [newName, setNewName] = useState("");
  const [newStreamerId, setNewStreamerId] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  const streamerNameById = new Map(streamers.map((s) => [s.id, s.display_name]));

  function handleAdd(e: React.FormEvent) {
    e.preventDefault();
    setError(null);

    if (!newName.trim()) {
      setError("Enter a category name.");
      return;
    }
    if (!newStreamerId) {
      setError("Choose a streamer for this category.");
      return;
    }

    startTransition(async () => {
      const result = await createCategory(platform, newName.trim(), newStreamerId);
      if ("error" in result) {
        setError(result.error);
      } else {
        setCategories((prev) =>
          [...prev, result.category].sort((a, b) => a.name.localeCompare(b.name))
        );
        setNewName("");
        setNewStreamerId("");
      }
    });
  }

  return (
    <div className="flex flex-col gap-3">
      <h3 className="text-sm font-semibold">
        {platform === "youtube" ? "YouTube" : "Twitch"} categories
      </h3>

      <div className="flex flex-col gap-2">
        {categories.map((c) => (
          <CategoryRow
            key={c.id}
            category={c}
            platform={platform}
            streamers={streamers}
            streamerName={c.streamer_id ? streamerNameById.get(c.streamer_id) ?? null : null}
            onRemoved={(id) => setCategories((prev) => prev.filter((cat) => cat.id !== id))}
          />
        ))}
        {categories.length === 0 && (
          <p className="text-sm text-muted-foreground">No categories yet.</p>
        )}
      </div>

      <form onSubmit={handleAdd} className="flex flex-wrap gap-2">
        <Input
          value={newName}
          onChange={(e) => setNewName(e.target.value)}
          placeholder={`New ${platform === "youtube" ? "YouTube" : "Twitch"} category…`}
          disabled={isPending}
          className="h-9 flex-1"
        />
        <StreamerSelect
          value={newStreamerId}
          onChange={setNewStreamerId}
          streamers={streamers}
          disabled={isPending}
        />
        <Button type="submit" size="sm" disabled={isPending || streamers.length === 0}>
          {isPending ? "Adding…" : "Add category"}
        </Button>
      </form>
      {streamers.length === 0 && (
        <p className="text-xs text-muted-foreground">
          Add a {platform === "youtube" ? "YouTube" : "Twitch"} streamer above first — every
          category needs one.
        </p>
      )}
      {error && <p className="text-xs text-destructive">{error}</p>}
    </div>
  );
}
