"use client";

import { useEffect, useState } from "react";
import { useLiveTournament } from "@/components/useLiveTournament";
import BracketView from "@/components/BracketView";
import {
  ChampionBanner,
  CopyLink,
  FormatBadge,
  ParticipantList,
  StatusBadge,
} from "@/components/TournamentBits";
import type { TournamentBundle } from "@/lib/types";

export default function PublicView({
  id,
  initial,
}: {
  id: string;
  initial: TournamentBundle;
}) {
  const { bundle } = useLiveTournament(id, initial);
  const [shareUrl, setShareUrl] = useState("");

  useEffect(() => {
    setShareUrl(`${window.location.origin}/t/${id}`);
  }, [id]);

  if (!bundle) return <p className="text-slate-400">Loading…</p>;

  const { tournament, participants, matches } = bundle;
  const championName =
    tournament.winner_id != null
      ? participants.find((p) => p.id === tournament.winner_id)?.name ?? null
      : null;

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center gap-3">
        <h1 className="text-2xl font-bold">{tournament.name}</h1>
        <StatusBadge status={tournament.status} />
        <FormatBadge format={tournament.format} />
      </div>

      {championName && <ChampionBanner name={championName} />}

      <div className="grid lg:grid-cols-[18rem_1fr] gap-6 items-start">
        <aside className="space-y-5">
          {tournament.status === "setup" && (
            <div className="rounded-lg border border-slate-800 bg-slate-900 p-4 space-y-3">
              <h2 className="font-semibold">Join this tournament</h2>
              <JoinForm tournamentId={id} />
            </div>
          )}

          <div className="rounded-lg border border-slate-800 bg-slate-900 p-4 space-y-3">
            <h2 className="font-semibold">
              Players <span className="text-slate-500">({participants.length})</span>
            </h2>
            <ParticipantList participants={participants} />
          </div>

          {shareUrl && (
            <div className="rounded-lg border border-slate-800 bg-slate-900 p-4">
              <CopyLink label="Share this tournament" url={shareUrl} />
            </div>
          )}
        </aside>

        <div className="rounded-lg border border-slate-800 bg-slate-900 p-4 min-h-[10rem]">
          {tournament.status === "setup" ? (
            <p className="text-slate-400 text-sm">
              The bracket will appear here once the organizer starts the tournament.
            </p>
          ) : (
            <BracketView matches={matches} participants={participants} />
          )}
        </div>
      </div>
    </div>
  );
}

function JoinForm({ tournamentId }: { tournamentId: string }) {
  const [name, setName] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [joined, setJoined] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(`/api/tournaments/${tournamentId}/participants`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Could not join.");
      setName("");
      setJoined(true);
      setTimeout(() => setJoined(false), 2000);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not join.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <form onSubmit={submit} className="space-y-2">
      <input
        value={name}
        onChange={(e) => setName(e.target.value)}
        maxLength={40}
        required
        placeholder="Your name"
        className="w-full rounded-md bg-slate-950 border border-slate-700 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-600"
      />
      {error && <p className="text-xs text-red-400">{error}</p>}
      {joined && <p className="text-xs text-emerald-400">You&apos;re in! 🎯</p>}
      <button
        type="submit"
        disabled={busy}
        className="w-full rounded-md bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 px-3 py-2 text-sm font-semibold"
      >
        {busy ? "Joining…" : "Join as guest"}
      </button>
    </form>
  );
}
