import type { Metadata } from "next";
import "./globals.css";
import { Suspense } from "react";
import Link from "next/link";
import { ThemeToggle } from "@/components/theme-toggle";
import { ThemeInit } from "@/components/theme-init";
import { SessionGuard } from "@/components/session-guard";
import { HeaderLoggedOutLinks, HeaderLoggedInInfo, MobileCreatorLink } from "@/components/header-auth";

export const metadata: Metadata = {
  title: "VideoRank",
  description: "Submit, rank, and get rewarded for great YouTube videos.",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  // Requirement 3: this layout is no longer `async` and does NOT
  // await the auth check itself — that was blocking the entire page
  // (including {children}, i.e. the video list) until it resolved.
  // The two auth-dependent header pieces below are each their own
  // async Server Component wrapped in <Suspense>, so Next.js can
  // stream the header shell + main content (the page's own video
  // list query) immediately, and pop in login-state/points once that
  // separate check resolves — the list is never blocked on it.
  return (
    <html lang="en" suppressHydrationWarning>
      <body className="min-h-screen bg-background text-foreground antialiased">
        <ThemeInit />
        <SessionGuard />
        <header className="sticky top-0 z-10 border-b bg-background/80 backdrop-blur supports-[backdrop-filter]:bg-background/60">
          <div className="mx-auto flex h-14 max-w-6xl items-center justify-between px-4">
            <div className="flex items-center gap-2 sm:gap-3">
              <Link href="/" className="flex items-center gap-2 font-semibold tracking-tight">
                <span className="flex h-6 w-6 items-center justify-center rounded-md bg-primary text-xs text-primary-foreground">
                  ▶
                </span>
                <span className="hidden sm:inline">VideoRank</span>
              </Link>

              <Suspense fallback={null}>
                <HeaderLoggedOutLinks />
              </Suspense>
            </div>

            <div className="flex items-center gap-2 sm:gap-3">
              <Suspense fallback={null}>
                <HeaderLoggedInInfo />
              </Suspense>
              <ThemeToggle />
            </div>
          </div>

          <Suspense fallback={null}>
            <MobileCreatorLink />
          </Suspense>
        </header>

        <main className="mx-auto max-w-6xl px-4 py-6">{children}</main>
      </body>
    </html>
  );
}
