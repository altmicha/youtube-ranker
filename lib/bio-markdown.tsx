import type { ReactNode } from "react";

// Matches [visible text](url) where url MUST start with http:// or
// https:// — this is what makes unsafe schemes safe by construction,
// not by a separate blocklist: a url like javascript:alert(1) simply
// never matches this pattern at all, so it's left as plain, inert
// text exactly as typed (e.g. the visitor sees the literal characters
// "[click](javascript:alert(1))"), never becomes an href, and is
// never rendered as a clickable link. No other markdown syntax is
// supported — this is intentionally narrow.
const LINK_PATTERN = /\[([^\]]+)\]\((https?:\/\/[^\s)]+)\)/g;

/**
 * Renders bio text as React nodes: [text](https://...) becomes a real
 * link showing only the given text (never the raw URL) opening in a
 * new tab; everything else is plain text. Safe against injection
 * since this returns React elements/strings, never raw HTML — there's
 * no dangerouslySetInnerHTML anywhere in this path. Line breaks are
 * preserved by the caller via CSS (whitespace-pre-line), not by this
 * function.
 */
export function renderBioText(text: string): ReactNode[] {
  const nodes: ReactNode[] = [];
  let lastIndex = 0;
  let match: RegExpExecArray | null;
  let key = 0;

  LINK_PATTERN.lastIndex = 0;
  while ((match = LINK_PATTERN.exec(text)) !== null) {
    if (match.index > lastIndex) {
      nodes.push(text.slice(lastIndex, match.index));
    }
    const [, label, url] = match;
    nodes.push(
      <a
        key={key++}
        href={url}
        target="_blank"
        rel="noreferrer noopener"
        className="underline underline-offset-2 hover:text-foreground"
      >
        {label}
      </a>
    );
    lastIndex = match.index + match[0].length;
  }

  if (lastIndex < text.length) {
    nodes.push(text.slice(lastIndex));
  }

  return nodes;
}
