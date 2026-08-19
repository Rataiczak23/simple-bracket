"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

/**
 * Owner-only delete control. Rendering is already gated server-side by
 * `isOwner`, so this never appears for anyone else — but the button is only
 * the affordance; the real check lives in DELETE /api/tournaments/[id].
 */
export default function DeleteTournamentButton({
  tournamentId,
  tournamentName,
  redirectTo,
  compact = false,
}: {
  tournamentId: string;
  tournamentName: string;
  /** Where to send the user afterwards. Omit to just refresh the current page. */
  redirectTo?: string;
  compact?: boolean;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function remove() {
    if (
      !confirm(
        `Delete "${tournamentName}"?\n\nThis permanently removes the tournament, its players, its bracket, and its admin link. This cannot be undone.`
      )
    ) {
      return;
    }

    setBusy(true);
    setError(null);
    try {
      const res = await fetch(`/api/tournaments/${tournamentId}`, { method: "DELETE" });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error ?? "Could not delete the tournament.");
      if (redirectTo) router.push(redirectTo);
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not delete the tournament.");
      setBusy(false);
    }
  }

  return (
    <div className={compact ? "" : "space-y-2"}>
      {error && <p className="text-xs text-red-400">{error}</p>}
      <button
        type="button"
        onClick={remove}
        disabled={busy}
        className={
          compact
            ? "whitespace-nowrap rounded-md border border-red-900 text-red-400 hover:bg-red-950/40 disabled:opacity-50 px-3 py-1.5 text-sm font-medium"
            : "w-full rounded-md border border-red-800 text-red-300 hover:bg-red-950/40 disabled:opacity-50 px-3 py-2 text-sm font-semibold"
        }
      >
        {busy ? "Deleting…" : "Delete tournament"}
      </button>
    </div>
  );
}
