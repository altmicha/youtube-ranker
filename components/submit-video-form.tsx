"use client";

import { useState, useTransition } from "react";
import { submitVideo } from "@/app/actions/videos";

export function SubmitVideoForm() {
  const [url, setUrl] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setSuccess(null);

    startTransition(async () => {
      const result = await submitVideo(url);
      if ("error" in result) {
        setError(result.error);
      } else {
        setSuccess("Video submitted!");
        setUrl("");
      }
    });
  }

  return (
    <form onSubmit={handleSubmit} className="mb-8 flex flex-col gap-2">
      <div className="flex gap-2">
        <input
          type="url"
          required
          value={url}
          onChange={(e) => setUrl(e.target.value)}
          placeholder="https://www.youtube.com/watch?v=..."
          className="flex-1 rounded-md border px-3 py-2 text-sm"
          disabled={isPending}
        />
        <button
          type="submit"
          disabled={isPending}
          className="rounded-md bg-black px-4 py-2 text-sm font-medium text-white hover:bg-gray-800 disabled:opacity-50"
        >
          {isPending ? "Submitting..." : "Submit video"}
        </button>
      </div>
      {error && <p className="text-sm text-red-600">{error}</p>}
      {success && <p className="text-sm text-green-700">{success}</p>}
    </form>
  );
}
