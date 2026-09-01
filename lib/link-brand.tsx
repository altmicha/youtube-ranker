import type { ReactNode } from "react";

export interface LinkBrand {
  // Badge background color. Null = unknown site — generic icon, no
  // brand color, matches the existing neutral button styling.
  color: string | null;
  icon: ReactNode;
}

function hostMatches(hostname: string, domains: string[]): boolean {
  const host = hostname.toLowerCase().replace(/^www\./, "");
  return domains.some((d) => host === d || host.endsWith(`.${d}`));
}

// Every icon is a plain inline SVG, no icon library — per "do not add
// a new heavy dependency if inline SVGs work". Drawn in white so they
// read clearly against each brand's colored badge background below;
// X's actual brand color is white, so its badge is black instead of
// colored, the same way X's own logo is normally shown (a white
// glyph needs a dark backdrop to be visible at all — plain white on
// this app's light-mode card background would be invisible).
const ICON_PROPS = { viewBox: "0 0 24 24", width: 12, height: 12, fill: "white" as const };

function YouTubeIcon() {
  return (
    <svg {...ICON_PROPS} aria-hidden="true">
      <path d="M9.5 7.5v9l8-4.5-8-4.5z" />
    </svg>
  );
}

function TwitchIcon() {
  return (
    <svg {...ICON_PROPS} aria-hidden="true">
      <rect x="8" y="6" width="2.5" height="9" />
      <rect x="13.5" y="6" width="2.5" height="9" />
    </svg>
  );
}

function XIcon() {
  return (
    <svg {...ICON_PROPS} aria-hidden="true">
      <path
        d="M6 5l12 14M18 5L6 19"
        stroke="white"
        strokeWidth="2.2"
        strokeLinecap="round"
        fill="none"
      />
    </svg>
  );
}

function DiscordIcon() {
  return (
    <svg {...ICON_PROPS} aria-hidden="true">
      <rect x="5" y="7" width="14" height="10" rx="4" />
      <circle cx="9.5" cy="12" r="1.4" fill="#5865F2" />
      <circle cx="14.5" cy="12" r="1.4" fill="#5865F2" />
    </svg>
  );
}

function RedditIcon() {
  return (
    <svg {...ICON_PROPS} aria-hidden="true">
      <circle cx="12" cy="13" r="6.5" />
      <circle cx="7" cy="8.5" r="1.6" />
      <circle cx="17" cy="8.5" r="1.6" />
      <circle cx="9.3" cy="13" r="1.1" fill="#FF4500" />
      <circle cx="14.7" cy="13" r="1.1" fill="#FF4500" />
    </svg>
  );
}

function InstagramIcon() {
  return (
    <svg {...ICON_PROPS} aria-hidden="true">
      <rect x="5" y="5" width="14" height="14" rx="4" fill="none" stroke="white" strokeWidth="1.6" />
      <circle cx="12" cy="12" r="3.2" fill="none" stroke="white" strokeWidth="1.6" />
      <circle cx="15.7" cy="8.3" r="1" />
    </svg>
  );
}

function GenericLinkIcon() {
  return (
    <svg viewBox="0 0 24 24" width="12" height="12" fill="none" aria-hidden="true">
      <path
        d="M9 15l6-6M10 6h5a3 3 0 013 3v0M14 18H9a3 3 0 01-3-3v0"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
      />
    </svg>
  );
}

/**
 * Requirement: icon + brand color detected from the link's URL
 * hostname — youtube.com/youtu.be, twitch.tv, twitter.com/x.com,
 * discord.com/discord.gg, reddit.com, instagram.com. Anything else
 * gets a generic link icon and no brand color (color: null), matching
 * the existing neutral outline button styling.
 */
export function detectLinkBrand(url: string): LinkBrand {
  let hostname = "";
  try {
    hostname = new URL(url).hostname;
  } catch {
    hostname = "";
  }

  if (hostMatches(hostname, ["youtube.com", "youtu.be"])) {
    return { color: "#FF0000", icon: <YouTubeIcon /> };
  }
  if (hostMatches(hostname, ["twitch.tv"])) {
    return { color: "#9146FF", icon: <TwitchIcon /> };
  }
  if (hostMatches(hostname, ["twitter.com", "x.com"])) {
    return { color: "#000000", icon: <XIcon /> };
  }
  if (hostMatches(hostname, ["discord.com", "discord.gg"])) {
    return { color: "#5865F2", icon: <DiscordIcon /> };
  }
  if (hostMatches(hostname, ["reddit.com"])) {
    return { color: "#FF4500", icon: <RedditIcon /> };
  }
  if (hostMatches(hostname, ["instagram.com"])) {
    return { color: "#E4405F", icon: <InstagramIcon /> };
  }

  return { color: null, icon: <GenericLinkIcon /> };
}
