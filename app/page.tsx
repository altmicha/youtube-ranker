import { PlatformGrid } from "@/components/platform-grid";

export default function HomePage() {
  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-xl font-bold tracking-tight sm:text-2xl">
          Choose a platform
        </h1>
        <p className="text-sm text-muted-foreground">
          Browse YouTube videos or Twitch clips.
        </p>
      </div>

      <PlatformGrid />
    </div>
  );
}
