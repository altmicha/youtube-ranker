"use client";

// Minimal ambient typing for the slice of the YouTube IFrame Player
// API this app actually uses — avoids pulling in a whole @types
// package for four methods.
export interface YTPlayer {
  mute: () => void;
  unMute: () => void;
  isMuted: () => boolean;
  setVolume: (volume: number) => void;
  destroy: () => void;
}

interface YTNamespace {
  Player: new (
    elementId: string,
    options: {
      events?: {
        onReady?: (event: { target: YTPlayer }) => void;
      };
    }
  ) => YTPlayer;
}

declare global {
  interface Window {
    YT?: YTNamespace;
    onYouTubeIframeAPIReady?: () => void;
  }
}

let apiPromise: Promise<YTNamespace> | null = null;

/**
 * Loads https://www.youtube.com/iframe_api exactly once for the
 * whole app (subsequent calls reuse the same in-flight/resolved
 * promise) and resolves once window.YT is actually usable.
 */
export function loadYoutubeIframeApi(): Promise<YTNamespace> {
  if (typeof window === "undefined") {
    return Promise.reject(new Error("loadYoutubeIframeApi called on the server"));
  }

  if (window.YT?.Player) {
    return Promise.resolve(window.YT);
  }

  if (apiPromise) return apiPromise;

  apiPromise = new Promise((resolve) => {
    const previous = window.onYouTubeIframeAPIReady;
    window.onYouTubeIframeAPIReady = () => {
      previous?.();
      resolve(window.YT!);
    };

    if (!document.querySelector('script[src="https://www.youtube.com/iframe_api"]')) {
      const script = document.createElement("script");
      script.src = "https://www.youtube.com/iframe_api";
      document.head.appendChild(script);
    }
  });

  return apiPromise;
}
