"use client";

import { useRef, useState, useTransition } from "react";
import {
  createCategory,
  renameCategory,
  removeCategory,
  uploadCategoryImage,
} from "@/app/actions/categories";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import type { Category, VideoSource } from "@/lib/types/database.types";
import { categoryImageUrl } from "@/lib/category-image";

function CategoryRow({
  category,
  platform,
  onRemoved,
}: {
  category: Category;
  platform: VideoSource;
  onRemoved: (id: string) => void;
}) {
  // Local, self-contained display state — updated directly on a
  // successful action rather than waiting on a full page reload, so
  // rename/image changes show up immediately.
  const [currentName, setCurrentName] = useState(category.name);
  const [currentImagePath, setCurrentImagePath] = useState(category.image_path);
  const [isRenaming, setIsRenaming] = useState(false);
  const [draftName, setDraftName] = useState(category.name);
  const [message, setMessage] = useState<string | null>(null);
  const [isError, setIsError] = useState(false);
  const [isPending, startTransition] = useTransition();
  const fileInputRef = useRef<HTMLInputElement>(null);

  function handleRename() {
    const trimmed = draftName.trim();
    if (!trimmed || trimmed === currentName) {
      setIsRenaming(false);
      setDraftName(currentName);
      return;
    }
    setMessage(null);
    startTransition(async () => {
      const result = await renameCategory(category.id, trimmed, platform);
      if ("error" in result) {
        setIsError(true);
        setMessage(result.error);
      } else {
        setCurrentName(trimmed);
        setIsError(false);
        setMessage(null);
      }
      setIsRenaming(false);
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
        // Path is always the category's own id (see the action), so
        // once upload succeeds we know exactly what it is now.
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
        Fixed 48x48 thumbnail for this dashboard row — deliberately
        NOT the same component/sizing as the public category card
        (components/category-grid.tsx, which stays h-48 w-36 and is
        untouched by this). Both the wrapper and the <img> itself
        pin the size via inline style in addition to Tailwind classes
        — belt-and-suspenders against any external CSS (e.g. a
        preflight `img { height: auto }` reset) overriding a
        class-only height/width.
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
        {isRenaming ? (
          <div className="flex gap-1.5">
            <Input
              value={draftName}
              onChange={(e) => setDraftName(e.target.value)}
              className="h-8 text-sm"
              disabled={isPending}
              autoFocus
            />
            <Button size="sm" onClick={handleRename} disabled={isPending}>
              Save
            </Button>
            <Button
              size="sm"
              variant="outline"
              onClick={() => {
                setIsRenaming(false);
                setDraftName(currentName);
              }}
              disabled={isPending}
            >
              Cancel
            </Button>
          </div>
        ) : (
          <p className="truncate text-sm font-medium">{currentName}</p>
        )}
        {message && (
          <p className={`mt-0.5 text-xs ${isError ? "text-destructive" : "text-emerald-700 dark:text-emerald-400"}`}>
            {message}
          </p>
        )}
      </div>

      {!isRenaming && (
        <div className="flex flex-shrink-0 items-center gap-1.5">
          <Button
            type="button"
            size="sm"
            variant="outline"
            onClick={() => {
              setDraftName(currentName);
              setIsRenaming(true);
            }}
            disabled={isPending}
          >
            Rename
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
}: {
  platform: VideoSource;
  initialCategories: Category[];
}) {
  const [categories, setCategories] = useState(initialCategories);
  const [newName, setNewName] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  function handleAdd(e: React.FormEvent) {
    e.preventDefault();
    setError(null);

    if (!newName.trim()) {
      setError("Enter a category name.");
      return;
    }

    startTransition(async () => {
      const result = await createCategory(platform, newName.trim());
      if ("error" in result) {
        setError(result.error);
      } else {
        setCategories((prev) =>
          [...prev, result.category].sort((a, b) => a.name.localeCompare(b.name))
        );
        setNewName("");
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
            onRemoved={(id) => setCategories((prev) => prev.filter((cat) => cat.id !== id))}
          />
        ))}
        {categories.length === 0 && (
          <p className="text-sm text-muted-foreground">No categories yet.</p>
        )}
      </div>

      <form onSubmit={handleAdd} className="flex gap-2">
        <Input
          value={newName}
          onChange={(e) => setNewName(e.target.value)}
          placeholder={`New ${platform === "youtube" ? "YouTube" : "Twitch"} category…`}
          disabled={isPending}
          className="h-9 flex-1"
        />
        <Button type="submit" size="sm" disabled={isPending}>
          {isPending ? "Adding…" : "Add category"}
        </Button>
      </form>
      {error && <p className="text-xs text-destructive">{error}</p>}
    </div>
  );
}
