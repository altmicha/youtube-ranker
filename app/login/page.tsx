import { signInWithEmail, signUpWithEmail, signInWithGoogle } from "@/app/auth/actions";

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string; message?: string }>;
}) {
  const params = await searchParams;

  return (
    <div className="mx-auto flex min-h-screen max-w-sm flex-col justify-center gap-6 px-4">
      <div className="text-center">
        <h1 className="text-2xl font-semibold">Sign in</h1>
        <p className="text-sm text-muted-foreground">
          Submit videos, vote, and earn points.
        </p>
      </div>

      {params.error && (
        <p className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-600">
          {params.error}
        </p>
      )}
      {params.message && (
        <p className="rounded-md bg-green-50 px-3 py-2 text-sm text-green-700">
          {params.message}
        </p>
      )}

      <form action={signInWithGoogle}>
        <button
          type="submit"
          className="w-full rounded-md border px-4 py-2 text-sm font-medium hover:bg-gray-50"
        >
          Continue with Google
        </button>
      </form>

      <div className="flex items-center gap-3 text-xs text-muted-foreground">
        <div className="h-px flex-1 bg-border" />
        or
        <div className="h-px flex-1 bg-border" />
      </div>

      <form className="flex flex-col gap-3">
        <input
          name="email"
          type="email"
          placeholder="you@example.com"
          required
          className="rounded-md border px-3 py-2 text-sm"
        />
        <input
          name="password"
          type="password"
          placeholder="Password"
          required
          minLength={6}
          className="rounded-md border px-3 py-2 text-sm"
        />
        <div className="flex gap-2">
          <button
            formAction={signInWithEmail}
            className="flex-1 rounded-md bg-black px-4 py-2 text-sm font-medium text-white hover:bg-gray-800"
          >
            Sign in
          </button>
          <button
            formAction={signUpWithEmail}
            className="flex-1 rounded-md border px-4 py-2 text-sm font-medium hover:bg-gray-50"
          >
            Sign up
          </button>
        </div>
      </form>
    </div>
  );
}
