"use client";

import { useState, useTransition } from "react";
import { Button, buttonVariants } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { updateStreamerBio, updateStreamerLinks } from "@/app/actions/streamer-bio";
import { detectLinkBrand } from "@/lib/link-brand";
import { cn } from "@/lib/utils";
import type { StreamerLink } from "@/lib/types/database.types";

// Requirement: bio is plain text only now — no [text](url) markdown
// syntax or parsing (lib/bio-markdown.tsx's renderBioText() is no
// longer used here). Links are a completely separate, structured
// field (streamers.links) with their own label/url pairs, own add/
// remove editing, and own save action — matching the two independent
// server actions in app/actions/streamer-bio.ts.
export function StreamerBio({
  streamerId,
  initialBio,
  initialLinks,
  canEdit,
}: {
  streamerId: string;
  initialBio: string | null;
  initialLinks: StreamerLink[] | null;
  canEdit: boolean;
}) {
  const [bio, setBio] = useState(initialBio ?? "");
  const [links, setLinks] = useState<StreamerLink[]>(initialLinks ?? []);

  const [isEditingBio, setIsEditingBio] = useState(false);
  const [bioDraft, setBioDraft] = useState(initialBio ?? "");
  const [bioError, setBioError] = useState<string | null>(null);
  const [bioPending, startBioTransition] = useTransition();

  const [isEditingLinks, setIsEditingLinks] = useState(false);
  const [linksDraft, setLinksDraft] = useState<StreamerLink[]>(initialLinks ?? []);
  const [linksError, setLinksError] = useState<string | null>(null);
  const [linksPending, startLinksTransition] = useTransition();

  // Requirement: bio AND links both empty, visitor isn't an editor ->
  // show nothing at all, not even an empty container.
  if (!canEdit && !bio && links.length === 0) return null;

  function handleSaveBio() {
    setBioError(null);
    startBioTransition(async () => {
      const result = await updateStreamerBio(streamerId, bioDraft);
      if ("error" in result) {
        setBioError(result.error);
      } else {
        setBio(result.bio ?? "");
        setIsEditingBio(false);
      }
    });
  }

  function updateLinkField(index: number, field: "label" | "url", value: string) {
    setLinksDraft((prev) => prev.map((l, i) => (i === index ? { ...l, [field]: value } : l)));
  }

  function addLinkRow() {
    setLinksDraft((prev) => [...prev, { label: "", url: "" }]);
  }

  function removeLinkRow(index: number) {
    setLinksDraft((prev) => prev.filter((_, i) => i !== index));
  }

  function handleSaveLinks() {
    setLinksError(null);
    startLinksTransition(async () => {
      const result = await updateStreamerLinks(streamerId, linksDraft);
      if ("error" in result) {
        setLinksError(result.error);
      } else {
        setLinks(result.links);
        setLinksDraft(result.links);
        setIsEditingLinks(false);
      }
    });
  }

  return (
    <div className="flex flex-col gap-3">
      {/* Bio */}
      {isEditingBio ? (
        <div className="flex max-w-prose flex-col gap-2">
          <textarea
            value={bioDraft}
            onChange={(e) => setBioDraft(e.target.value)}
            rows={4}
            placeholder="Write a bio…"
            disabled={bioPending}
            className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50"
          />
          <div className="flex gap-2">
            <Button size="sm" onClick={handleSaveBio} disabled={bioPending}>
              {bioPending ? "Saving…" : "Save"}
            </Button>
            <Button
              size="sm"
              variant="outline"
              onClick={() => {
                setIsEditingBio(false);
                setBioDraft(bio);
                setBioError(null);
              }}
              disabled={bioPending}
            >
              Cancel
            </Button>
          </div>
          {bioError && <p className="text-xs text-destructive">{bioError}</p>}
        </div>
      ) : (
        <div className="flex flex-col gap-1">
          {bio ? (
            // Requirement: keep line breaks — whitespace-pre-line
            // preserves \n as visual breaks while still wrapping
            // normally. Plain {bio} text, no markdown parsing.
            <p className="max-w-prose whitespace-pre-line text-sm text-muted-foreground">{bio}</p>
          ) : (
            canEdit && <p className="text-sm italic text-muted-foreground">No bio yet.</p>
          )}
          {canEdit && (
            <button
              type="button"
              onClick={() => {
                setBioDraft(bio);
                setIsEditingBio(true);
              }}
              className="w-fit text-left text-xs text-primary hover:underline"
            >
              {bio ? "Edit bio" : "Add bio"}
            </button>
          )}
        </div>
      )}

      {/* Links */}
      {isEditingLinks ? (
        <div className="flex max-w-prose flex-col gap-2">
          {linksDraft.map((link, index) => (
            <div key={index} className="flex flex-wrap items-center gap-1.5">
              <Input
                value={link.label}
                onChange={(e) => updateLinkField(index, "label", e.target.value)}
                placeholder="Label (e.g. YouTube)"
                disabled={linksPending}
                className="h-8 w-36 text-sm"
              />
              <Input
                value={link.url}
                onChange={(e) => updateLinkField(index, "url", e.target.value)}
                placeholder="https://…"
                disabled={linksPending}
                className="h-8 flex-1 text-sm"
              />
              <Button
                type="button"
                size="sm"
                variant="destructiveOutline"
                onClick={() => removeLinkRow(index)}
                disabled={linksPending}
              >
                Remove
              </Button>
            </div>
          ))}
          <div className="flex flex-wrap gap-2">
            <Button type="button" size="sm" variant="outline" onClick={addLinkRow} disabled={linksPending}>
              Add link
            </Button>
            <Button size="sm" onClick={handleSaveLinks} disabled={linksPending}>
              {linksPending ? "Saving…" : "Save"}
            </Button>
            <Button
              size="sm"
              variant="outline"
              onClick={() => {
                setIsEditingLinks(false);
                setLinksDraft(links);
                setLinksError(null);
              }}
              disabled={linksPending}
            >
              Cancel
            </Button>
          </div>
          {linksError && <p className="text-xs text-destructive">{linksError}</p>}
        </div>
      ) : (
        <div className="flex flex-col gap-1.5">
          {/* Requirement: labels as links/buttons, never the raw URL —
              {link.label} is the only visible text (kept exactly as
              the streamer typed it — this doesn't touch that), and
              link.url only ever appears in href. Icon + brand color
              are detected purely from the URL's hostname, not stored
              or saved anywhere — this is a display-only enhancement. */}
          {links.length > 0 && (
            <div className="flex flex-wrap gap-2">
              {links.map((link, index) => {
                const brand = detectLinkBrand(link.url);
                return (
                  <a
                    key={index}
                    href={link.url}
                    target="_blank"
                    rel="noreferrer noopener"
                    className={cn(buttonVariants({ variant: "outline", size: "sm" }), "gap-1.5")}
                  >
                    <span
                      className="flex h-4 w-4 flex-shrink-0 items-center justify-center rounded-full"
                      style={{ backgroundColor: brand.color ?? undefined }}
                    >
                      {brand.color ? (
                        brand.icon
                      ) : (
                        <span className="text-muted-foreground">{brand.icon}</span>
                      )}
                    </span>
                    {link.label}
                  </a>
                );
              })}
            </div>
          )}
          {canEdit && (
            <button
              type="button"
              onClick={() => {
                setLinksDraft(links.length > 0 ? links : [{ label: "", url: "" }]);
                setIsEditingLinks(true);
              }}
              className="w-fit text-left text-xs text-primary hover:underline"
            >
              {links.length > 0 ? "Edit links" : "Add links"}
            </button>
          )}
        </div>
      )}
    </div>
  );
}
