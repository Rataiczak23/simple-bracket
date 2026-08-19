import Link from "next/link";
import { createServiceClient } from "@/lib/supabase/server";
import { FormatBadge, StatusBadge } from "@/components/TournamentBits";
import DeleteTournamentButton from "@/components/DeleteTournamentButton";
import { getCurrentUser, isOwner } from "@/lib/auth";
import type { Tournament } from "@/lib/types";

export const dynamic = "force-dynamic";

interface HistoryRow extends Pick<Tournament, "id" | "name" | "format" | "status" | "winner_id" | "created_at"> {
  participants: { count: number }[];
}

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString(undefined, {
    year: "numeric",
    month: "short",
    day: "numeric",
  });
}

export default async function HistoryPage() {
  const supabase = createServiceClient();
  // Only the site owner gets delete controls, and only on unfinished rows.
  const owner = isOwner(await getCurrentUser());
  const { data } = await supabase
    .from("tournaments")
    .select("id, name, format, status, winner_id, created_at, participants(count)")
    .order("created_at", { ascending: false })
    .returns<HistoryRow[]>();

  const tournaments = data ?? [];

  // Resolve champion display names from the winning participant ids.
  const winnerIds = tournaments.map((t) => t.winner_id).filter((id): id is string => Boolean(id));
  const championById = new Map<string, string>();
  if (winnerIds.length > 0) {
    const { data: winners } = await supabase
      .from("participants")
      .select("id, name")
      .in("id", winnerIds)
      .returns<{ id: string; name: string }[]>();
    for (const w of winners ?? []) championById.set(w.id, w.name);
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center gap-3">
        <h1 className="text-2xl font-bold">📜 Match History</h1>
        <span className="text-sm text-slate-500">Every tournament, newest first</span>
      </div>

      {tournaments.length === 0 ? (
        <div className="rounded-lg border border-slate-800 bg-slate-900 p-6 text-slate-400">
          No tournaments yet.{" "}
          <Link href="/" className="text-emerald-400 hover:underline">
            Create one →
          </Link>
        </div>
      ) : (
        <ul className="space-y-3">
          {tournaments.map((t) => {
            const players = t.participants?.[0]?.count ?? 0;
            const champion = t.winner_id ? championById.get(t.winner_id) ?? null : null;
            const viewLabel =
              t.status === "completed"
                ? "View results"
                : t.status === "in_progress"
                ? "View live bracket"
                : "View / join";
            return (
              <li
                key={t.id}
                className="rounded-lg border border-slate-800 bg-slate-900 p-4 flex flex-wrap items-center gap-x-4 gap-y-2"
              >
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <Link href={`/t/${t.id}`} className="font-semibold hover:text-emerald-300 truncate">
                      {t.name}
                    </Link>
                    <StatusBadge status={t.status} />
                    <FormatBadge format={t.format} />
                  </div>
                  <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-0.5 text-xs text-slate-500">
                    <span>{formatDate(t.created_at)}</span>
                    <span>·</span>
                    <span>
                      {players} {players === 1 ? "player" : "players"}
                    </span>
                    {champion && (
                      <>
                        <span>·</span>
                        <span className="text-emerald-400">🏆 {champion}</span>
                      </>
                    )}
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <Link
                    href={`/t/${t.id}`}
                    className="whitespace-nowrap rounded-md border border-slate-700 hover:border-slate-600 px-3 py-1.5 text-sm font-medium"
                  >
                    {viewLabel} →
                  </Link>
                  {owner && t.status !== "completed" && (
                    <DeleteTournamentButton
                      tournamentId={t.id}
                      tournamentName={t.name}
                      compact
                    />
                  )}
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
