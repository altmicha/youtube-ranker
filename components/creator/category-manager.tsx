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
import type { Category, CategoryKind, Streamer, VideoSource } from "@/lib/types/database.types";
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

// One kind's list + its own add-form. Rendered twice by
// CategoryManager below (once for "official", once for "queue") —
// requirement: don't mix them into one unlabeled list; each group has
// its own heading, so which kind you're adding is implied by which
// group's form you use (same pattern the app already uses for
// platform: which CategoryManager instance you're in implies
// youtube vs twitch).
function CategoryGroup({
  kind,
  label,
  platform,
  categories,
  streamers,
  streamerNameById,
  onCategoriesChange,
}: {
  kind: CategoryKind;
  label: string;
  platform: VideoSource;
  categories: Category[];
  streamers: Streamer[];
  streamerNameById: Map<string, string>;
  onCategoriesChange: (next: Category[]) => void;
}) {
  const [newName, setNewName] = useState("");
  const [newStreamerId, setNewStreamerId] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

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
      const result = await createCategory(platform, newName.trim(), newStreamerId, kind);
      if ("error" in result) {
        setError(result.error);
      } else {
        onCategoriesChange(
          [...categories, result.category].sort((a, b) => a.name.localeCompare(b.name))
        );
        setNewName("");
        setNewStreamerId("");
      }
    });
  }

  return (
    <div className="flex flex-col gap-2">
      <h4 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
        {label}
      </h4>

      {categories.map((c) => (
        <CategoryRow
          key={c.id}
          category={c}
          platform={platform}
          streamers={streamers}
          streamerName={c.streamer_id ? streamerNameById.get(c.streamer_id) ?? null : null}
          onRemoved={(id) => onCategoriesChange(categories.filter((cat) => cat.id !== id))}
        />
      ))}
      {categories.length === 0 && (
        <p className="text-sm text-muted-foreground">No {label.toLowerCase()} categories yet.</p>
      )}

      <form onSubmit={handleAdd} className="flex flex-wrap gap-2">
        <Input
          value={newName}
          onChange={(e) => setNewName(e.target.value)}
          placeholder={`New ${label.toLowerCase()} category…`}
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
          {isPending ? "Adding…" : "Add"}
        </Button>
      </form>
      {streamers.length === 0 && (
        <p className="text-xs text-muted-foreground">Add a streamer above first — every category needs one.</p>
      )}
      {error && <p className="text-xs text-destructive">{error}</p>}
    </div>
  );
}

export function CategoryManager({
  platform,
  initialCategories,
  streamers,
  // Whether the current viewer can add/see the "Official" group's add
  // form — creator-only. A streamer viewing /creator still sees the
  // Official list (for context) but not its add-form; the Queue
  // group's add-form is always shown to both roles (both are allowed
  // to reach this component at all, since /creator itself now gates
  // on creator-or-streamer).
  canManageOfficial,
}: {
  platform: VideoSource;
  initialCategories: Category[];
  streamers: Streamer[];
  canManageOfficial: boolean;
}) {
  const [categories, setCategories] = useState(initialCategories);

  const official = categories.filter((c) => c.kind === "official");
  const queue = categories.filter((c) => c.kind === "queue");
  const streamerNameById = new Map(streamers.map((s) => [s.id, s.display_name]));

  function applyChange(kind: CategoryKind, next: Category[]) {
    setCategories((prev) => [...prev.filter((c) => c.kind !== kind), ...next]);
  }

  return (
    <div className="flex flex-col gap-4">
      <h3 className="text-sm font-semibold">
        {platform === "youtube" ? "YouTube" : "Twitch"} categories
      </h3>

      {canManageOfficial ? (
        <CategoryGroup
          kind="official"
          label="Official"
          platform={platform}
          categories={official}
          streamers={streamers}
          streamerNameById={streamerNameById}
          onCategoriesChange={(next) => applyChange("official", next)}
        />
      ) : (
        <div className="flex flex-col gap-2">
          <h4 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            Official
          </h4>
          {official.map((c) => (
            <div key={c.id} className="rounded-md border p-2 text-sm">
              {c.name} — {c.streamer_id ? streamerNameById.get(c.streamer_id) ?? "" : "No streamer assigned"}
            </div>
          ))}
          {official.length === 0 && (
            <p className="text-sm text-muted-foreground">No official categories yet.</p>
          )}
        </div>
      )}

      <CategoryGroup
        kind="queue"
        label="Queue"
        platform={platform}
        categories={queue}
        streamers={streamers}
        streamerNameById={streamerNameById}
        onCategoriesChange={(next) => applyChange("queue", next)}
      />
    </div>
  );
}
