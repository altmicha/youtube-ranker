import type { Metadata } from "next";
import "./globals.css";
import { getCurrentProfile } from "@/lib/auth/roles";
import { signOut } from "@/app/auth/actions";
import Link from "next/link";

export const metadata: Metadata = {
  title: "YouTube Ranker",
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
      <body className="min-h-screen bg-white text-gray-900 antialiased">
        <header className="flex items-center justify-between border-b px-6 py-3">
          <Link href="/" className="font-semibold">
            YouTube Ranker
          </Link>

          {profile ? (
            <div className="flex items-center gap-4 text-sm">
              {profile.role === "creator" && (
                <Link href="/creator" className="font-medium text-blue-600">
                  Creator dashboard
                </Link>
              )}
              <span className="rounded-full bg-gray-100 px-3 py-1 font-medium">
                {profile.points} pts
              </span>
              <span className="text-muted-foreground">
                {profile.display_name ?? profile.email}
              </span>
              <form action={signOut}>
                <button className="text-muted-foreground hover:underline">
                  Sign out
                </button>
              </form>
            </div>
          ) : (
            <Link href="/login" className="text-sm font-medium">
              Sign in
            </Link>
          )}
        </header>

        <main>{children}</main>
      </body>
    </html>
  );
}
