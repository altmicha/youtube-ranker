import Link from "next/link";
import { getCurrentProfile } from "@/lib/auth/roles";
import { signOut } from "@/app/auth/actions";
import { Button, buttonVariants } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

// Three small async Server Components, each independently wrapped in
// its own <Suspense> in app/layout.tsx, instead of one top-level
// `await getCurrentProfile()` blocking the entire layout (and with it
// {children} — the actual page content) until auth resolves. They all
// call the same cache()-wrapped getCurrentProfile(), so this is still
// only one real auth check per request, not three.

export async function HeaderLoggedOutLinks() {
  const profile = await getCurrentProfile();
  if (profile) return null;

  return (
    <div className="flex items-center gap-2">
      <Link href="/login" className={cn(buttonVariants({ variant: "outline", size: "sm" }))}>
        Log in
      </Link>
      <Link href="/login" className={cn(buttonVariants({ size: "sm" }))}>
        Sign up
      </Link>
    </div>
  );
}

export async function HeaderLoggedInInfo() {
  const profile = await getCurrentProfile();
  if (!profile) return null;

  return (
    <>
      {profile.role === "creator" && (
        <Link
          href="/creator"
          // Requirement: don't fetch /creator from the homepage (or
          // any other page) before it's actually clicked — /creator
          // is a dynamic, DB-querying route, so default prefetch was
          // eagerly loading it in the background on every page load.
          prefetch={false}
          className={cn(buttonVariants({ variant: "ghost", size: "sm" }), "hidden sm:inline-flex")}
        >
          Creator dashboard
        </Link>
      )}
      <Badge variant="secondary" className="font-mono">
        {profile.points} pts
      </Badge>
      <span className="hidden max-w-[140px] truncate text-sm text-muted-foreground sm:inline">
        {profile.display_name ?? profile.email}
      </span>
      <form action={signOut}>
        <Button variant="outline" size="sm" type="submit">
          Sign out
        </Button>
      </form>
    </>
  );
}

export async function MobileCreatorLink() {
  const profile = await getCurrentProfile();
  if (profile?.role !== "creator") return null;

  return (
    <div className="mx-auto max-w-6xl px-4 pb-2 sm:hidden">
      <Link
        href="/creator"
        prefetch={false}
        className="text-sm font-medium text-primary underline-offset-4 hover:underline"
      >
        Creator dashboard →
      </Link>
    </div>
  );
}
