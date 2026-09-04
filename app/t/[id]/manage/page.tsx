"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
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
import { resolveAdminToken } from "@/components/adminToken";
import { openByeSlots } from "@/lib/bracket";

/** JSON body every admin endpoint answers with (fields present as relevant). */
type AdminBody = { error?: string; canRebuild?: boolean };
type AdminResult = { ok: boolean; body: AdminBody };

export default function ManagePage({ params }: { params: { id: string } }) {
  const id = params.id;
  const { bundle, refetch } = useLiveTournament(id, null);

  const [token, setToken] = useState<string | null>(null);
  const [tokenChecked, setTokenChecked] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [origin, setOrigin] = useState("");

  useEffect(() => {
    setToken(resolveAdminToken(id));
    setTokenChecked(true);
    setOrigin(window.location.origin);
  }, [id]);

  const adminCall = useCallback(
    async (path: string, init?: RequestInit): Promise<AdminResult> => {
      if (!token) return { ok: false, body: {} };
      setBusy(true);
      setError(null);
      try {
        const res = await fetch(path, {
          ...init,
          headers: { "Content-Type": "application/json", "x-admin-token": token, ...init?.headers },
        });
        const body = (await res.json().catch(() => ({}))) as AdminBody;
        if (!res.ok) {
          setError(body.error ?? "Action failed.");
          return { ok: false, body };
        }
        await refetch();
        return { ok: true, body };
      } catch (err) {
        setError(err instanceof Error ? err.message : "Action failed.");
        return { ok: false, body: {} };
      } finally {
        setBusy(false);
      }
    },
    [token, refetch]
  );

  // Spots a latecomer could still be dropped into without voiding a result.
  const openSlotCount = useMemo(
    () => (bundle ? openByeSlots(bundle.matches).length : 0),
    [bundle]
  );

  const championName = useMemo(() => {
    if (!bundle?.tournament.winner_id) return null;
    return bundle.participants.find((p) => p.id === bundle.tournament.winner_id)?.name ?? null;
  }, [bundle]);

  if (!tokenChecked) return <p className="text-slate-400">Loading…</p>;

  if (!token) {
    return (
      <div className="max-w-md mx-auto rounded-lg border border-slate-800 bg-slate-900 p-6 space-y-3">
        <h1 className="text-lg font-semibold">Admin link required</h1>
        <p className="text-sm text-slate-400">
          You need the private admin link to manage this tournament. If you created it, open the
          original link you were given (it contains your secret token).
        </p>
        <Link href={`/t/${id}`} className="text-emerald-400 text-sm hover:underline">
          → View the public bracket instead
        </Link>
      </div>
    );
  }

  if (!bundle) return <p className="text-slate-400">Loading…</p>;

  const { tournament, participants, matches } = bundle;
  const adminUrl = origin ? `${origin}/t/${id}/manage#token=${token}` : "";
  const shareUrl = origin ? `${origin}/t/${id}` : "";

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center gap-3">
        <h1 className="text-2xl font-bold">{tournament.name}</h1>
        <StatusBadge status={tournament.status} />
        <FormatBadge format={tournament.format} />
        <Link
          href={`/t/${id}`}
          target="_blank"
          className="ml-auto text-sm text-emerald-400 hover:underline"
        >
          Open public view ↗
        </Link>
      </div>

      <div className="rounded-lg border border-amber-800/60 bg-amber-950/20 px-4 py-2 text-xs text-amber-200">
        🔑 You&apos;re managing this tournament. Keep the admin link private — anyone with it can
        control the bracket.
      </div>

      {championName && <ChampionBanner name={championName} />}
      {error && <p className="text-sm text-red-400">{error}</p>}

      <div className="grid lg:grid-cols-[20rem_1fr] gap-6 items-start">
        <aside className="space-y-5">
          {tournament.status === "setup" && (
            <div className="rounded-lg border border-slate-800 bg-slate-900 p-4 space-y-3">
              <h2 className="font-semibold">Add a player</h2>
              <p className="text-xs text-slate-500">
                Players join themselves with the share link, or add a registered player by their
                account email.
              </p>
              <AddPlayerForm
                onAdd={(email) =>
                  adminCall(`/api/tournaments/${id}/participants`, {
                    method: "POST",
                    body: JSON.stringify({ email }),
                  })
                }
                busy={busy}
              />
            </div>
          )}

          {tournament.status === "in_progress" && (
            <div className="rounded-lg border border-slate-800 bg-slate-900 p-4 space-y-3">
              <h2 className="font-semibold">Add a late player</h2>
              <LateEntryForm
                openSlotCount={openSlotCount}
                busy={busy}
                onAdd={(email, mode) =>
                  adminCall(`/api/tournaments/${id}/late-entry`, {
                    method: "POST",
                    body: JSON.stringify({ email, mode }),
                  })
                }
              />
            </div>
          )}

          <div className="rounded-lg border border-slate-800 bg-slate-900 p-4 space-y-3">
            <h2 className="font-semibold">
              Players <span className="text-slate-500">({participants.length})</span>
            </h2>
            <ParticipantList
              participants={participants}
              busy={busy}
              onRemove={
                tournament.status === "setup"
                  ? (pid) =>
                      adminCall(`/api/tournaments/${id}/participants/${pid}`, { method: "DELETE" })
                  : undefined
              }
            />
            {tournament.status === "setup" && (
              <button
                type="button"
                disabled={busy || participants.length < 2}
                onClick={() => adminCall(`/api/tournaments/${id}/start`, { method: "POST" })}
                className="w-full rounded-md bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 px-3 py-2 text-sm font-semibold"
              >
                {participants.length < 2 ? "Add at least 2 players" : "Start tournament 🎯"}
              </button>
            )}
            {tournament.status !== "setup" && (
              <button
                type="button"
                disabled={busy}
                onClick={() => {
                  if (confirm("Reset the bracket? All results will be cleared.")) {
                    adminCall(`/api/tournaments/${id}/reset`, { method: "POST" });
                  }
                }}
                className="w-full rounded-md border border-red-800 text-red-300 hover:bg-red-950/40 disabled:opacity-50 px-3 py-2 text-sm"
              >
                Reset bracket
              </button>
            )}
          </div>

          <div className="rounded-lg border border-slate-800 bg-slate-900 p-4 space-y-3">
            {shareUrl && <CopyLink label="Public share link (for players)" url={shareUrl} />}
            {adminUrl && <CopyLink label="Private admin link (keep secret)" url={adminUrl} />}
          </div>
        </aside>

        <div className="min-w-0 rounded-lg border border-slate-800 bg-slate-900 p-4 min-h-[10rem]">
          {tournament.status === "setup" ? (
            <p className="text-slate-400 text-sm">
              Add players, then start the tournament to generate the bracket. Click a player in a
              match to mark them as the winner.
            </p>
          ) : (
            <>
              <p className="text-xs text-slate-500 mb-3">
                Click the winner of each match to advance them. Made a mistake? Click the other
                player to switch the result.
              </p>
              <BracketView
                matches={matches}
                participants={participants}
                busy={busy}
                onPickWinner={(matchId, participantId) =>
                  adminCall(`/api/matches/${matchId}/winner`, {
                    method: "POST",
                    body: JSON.stringify({ winnerId: participantId }),
                  })
                }
              />
            </>
          )}
        </div>
      </div>
    </div>
  );
}

/**
 * Host-only late entry for a tournament that's already running. Preferred path
 * is the non-destructive one: the player takes an unplayed bye spot and every
 * recorded result stands. When the bracket has no such spot (a full
 * power-of-2 field, or every bye already played on) the only way in is a
 * rebuild, which wipes results — so that needs a second, deliberate click.
 */
function LateEntryForm({
  openSlotCount,
  busy,
  onAdd,
}: {
  openSlotCount: number;
  busy: boolean;
  onAdd: (email: string, mode: "slot" | "rebuild") => Promise<AdminResult>;
}) {
  const [email, setEmail] = useState("");
  const [slotRefused, setSlotRefused] = useState(false);

  // The server re-checks; `slotRefused` only covers the race where someone
  // played the last open bye between render and submit.
  const mustRebuild = openSlotCount === 0 || slotRefused;

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    const value = email.trim();
    if (!value) return;

    if (mustRebuild) {
      const ok = confirm(
        "No open spot left, so the bracket has to be rebuilt. Every result so far will be cleared. Continue?"
      );
      if (!ok) return;
      const res = await onAdd(value, "rebuild");
      if (res.ok) {
        setEmail("");
        setSlotRefused(false);
      }
      return;
    }

    const res = await onAdd(value, "slot");
    if (res.ok) setEmail("");
    else if (res.body.canRebuild) setSlotRefused(true);
  }

  return (
    <form onSubmit={submit} className="space-y-3">
      <p className="text-xs text-slate-500">
        {mustRebuild
          ? "No open spot left in this bracket. Adding someone now regenerates it and clears every result."
          : `${openSlotCount} open bye ${
              openSlotCount === 1 ? "spot" : "spots"
            } — the new player drops into one and every result so far stands.`}
      </p>
      <div className="flex gap-2">
        <input
          type="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          placeholder="player@email.com"
          className="flex-1 rounded-md bg-slate-950 border border-slate-700 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-600"
        />
        <button
          type="submit"
          disabled={busy}
          className={`rounded-md disabled:opacity-50 px-3 py-2 text-sm whitespace-nowrap ${
            mustRebuild
              ? "border border-amber-700 text-amber-200 hover:bg-amber-950/40"
              : "bg-slate-700 hover:bg-slate-600"
          }`}
        >
          {mustRebuild ? "Add & rebuild" : "Add"}
        </button>
      </div>
    </form>
  );
}

function AddPlayerForm({ onAdd, busy }: { onAdd: (email: string) => void; busy: boolean }) {
  const [email, setEmail] = useState("");
  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        if (email.trim()) {
          onAdd(email.trim());
          setEmail("");
        }
      }}
      className="flex gap-2"
    >
      <input
        type="email"
        value={email}
        onChange={(e) => setEmail(e.target.value)}
        placeholder="player@email.com"
        className="flex-1 rounded-md bg-slate-950 border border-slate-700 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-600"
      />
      <button
        type="submit"
        disabled={busy}
        className="rounded-md bg-slate-700 hover:bg-slate-600 disabled:opacity-50 px-3 py-2 text-sm"
      >
        Add
      </button>
    </form>
  );
}
