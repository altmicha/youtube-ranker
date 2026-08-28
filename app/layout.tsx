import type { Metadata } from "next";
import "./globals.css";
import Link from "next/link";
import { getCurrentProfile } from "@/lib/auth/roles";
import { signOut } from "@/app/auth/actions";
import { Button } from "@/components/ui/button";
import { buttonVariants } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

export const metadata: Metadata = {
  title: "VideoRank",
  description: "Submit, rank, and get rewarded for great YouTube videos.",
};

export default async function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const profile = await getCurrentProfile();

  return (
    <html lang="en">
      <body className="min-h-screen bg-background text-foreground antialiased">
        <header className="sticky top-0 z-10 border-b bg-background/80 backdrop-blur supports-[backdrop-filter]:bg-background/60">
          <div className="mx-auto flex h-14 max-w-3xl items-center justify-between px-4">
            {/* Left side: logo, plus Log in / Sign up when signed out. */}
            <div className="flex items-center gap-2 sm:gap-3">
              <Link href="/" className="flex items-center gap-2 font-semibold tracking-tight">
                <span className="flex h-6 w-6 items-center justify-center rounded-md bg-primary text-xs text-primary-foreground">
                  ▶
                </span>
                <span className="hidden sm:inline">VideoRank</span>
              </Link>

              {!profile && (
                <div className="flex items-center gap-2">
                  <Link
                    href="/login"
                    className={cn(buttonVariants({ variant: "outline", size: "sm" }))}
                  >
                    Log in
                  </Link>
                  <Link href="/login" className={cn(buttonVariants({ size: "sm" }))}>
                    Sign up
                  </Link>
                </div>
              )}
            </div>

            {/* Right side: only shown once signed in. */}
            {profile && (
              <div className="flex items-center gap-2 sm:gap-3">
                {profile.role === "creator" && (
                  <Link
                    href="/creator"
                    className={cn(
                      buttonVariants({ variant: "ghost", size: "sm" }),
                      "hidden sm:inline-flex"
                    )}
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
              </div>
            )}
          </div>

          {profile?.role === "creator" && (
            <div className="mx-auto max-w-3xl px-4 pb-2 sm:hidden">
              <Link
                href="/creator"
                className="text-sm font-medium text-primary underline-offset-4 hover:underline"
              >
                Creator dashboard →
              </Link>
            </div>
          )}
        </header>

        <main className="mx-auto max-w-3xl px-4 py-8">{children}</main>
      </body>
    </html>
  );
}
