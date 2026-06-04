"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useLiveTournament } from "@/components/useLiveTournament";
import BracketView from "@/components/BracketView";
import {
  ChampionBanner,
  CopyLink,
  FormatBadge,
  ParticipantList,
  StatusBadge,
} from "@/components/TournamentBits";
import type { AuthUser, TournamentBundle } from "@/lib/types";

export default function PublicView({
  id,
  initial,
  currentUser,
}: {
  id: string;
  initial: TournamentBundle;
  currentUser: AuthUser | null;
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
              <JoinForm
                tournamentId={id}
                currentUser={currentUser}
                alreadyJoined={participants.some((p) => p.user_id === currentUser?.id)}
              />
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

function JoinForm({
  tournamentId,
  currentUser,
  alreadyJoined,
}: {
  tournamentId: string;
  currentUser: AuthUser | null;
  alreadyJoined: boolean;
}) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!currentUser) {
    return (
      <div className="space-y-2">
        <p className="text-xs text-slate-400">Sign in to join this tournament.</p>
        <Link
          href={`/login?next=${encodeURIComponent(`/t/${tournamentId}`)}`}
          className="block w-full text-center rounded-md bg-emerald-600 hover:bg-emerald-500 px-3 py-2 text-sm font-semibold"
        >
          Sign in to join
        </Link>
      </div>
    );
  }

  if (alreadyJoined) {
    return <p className="text-sm text-emerald-400">You&apos;re in! 🎯 Waiting for the host to start.</p>;
  }

  async function join() {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(`/api/tournaments/${tournamentId}/participants`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({}),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error ?? "Could not join.");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not join.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-2">
      {error && <p className="text-xs text-red-400">{error}</p>}
      <button
        type="button"
        onClick={join}
        disabled={busy}
        className="w-full rounded-md bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 px-3 py-2 text-sm font-semibold"
      >
        {busy ? "Joining…" : `Join as ${currentUser.display_name}`}
      </button>
    </div>
  );
}
