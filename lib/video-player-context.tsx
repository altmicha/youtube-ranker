"use client";

import { createContext, useContext, useState, type ReactNode } from "react";

interface VideoPlayerContextValue {
  playingId: string | null;
  toggle: (id: string) => void;
}

const VideoPlayerContext = createContext<VideoPlayerContextValue | null>(null);

// Wrap any list of VideoCards in this so that only one card's embed
// can be expanded/playing at a time — toggling a card sets it as the
// sole playingId, which collapses whichever other card was open.
export function VideoPlayerProvider({ children }: { children: ReactNode }) {
  const [playingId, setPlayingId] = useState<string | null>(null);

  function toggle(id: string) {
    setPlayingId((current) => (current === id ? null : id));
  }

  return (
    <VideoPlayerContext.Provider value={{ playingId, toggle }}>
      {children}
    </VideoPlayerContext.Provider>
  );
}

export function useVideoPlayer() {
  const ctx = useContext(VideoPlayerContext);
  if (!ctx) {
    throw new Error("useVideoPlayer must be used within a VideoPlayerProvider");
  }
  return ctx;
}
