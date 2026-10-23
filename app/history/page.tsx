import Link from "next/link";
import { createServiceClient } from "@/lib/supabase/server";
import Pagination, { PAGE_SIZE, pageCount, resolvePage } from "@/components/Pagination";
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

export default async function HistoryPage({ searchParams }: { searchParams: { page?: string } }) {
  const supabase = createServiceClient();
  // Only the site owner gets delete controls, and only on unfinished rows.
  const owner = isOwner(await getCurrentUser());

  // Count first: asking Supabase for a range past the last row is an error, not
  // an empty page, so an out-of-range ?page= has to be caught before fetching.
  const { count } = await supabase.from("tournaments").select("id", { count: "exact", head: true });
  const totalPages = pageCount(count ?? 0);
  const page = resolvePage(searchParams.page, totalPages, "/history");

  const from = (page - 1) * PAGE_SIZE;
  const { data } = await supabase
    .from("tournaments")
    .select("id, name, format, status, winner_id, created_at, participants(count)")
    .order("created_at", { ascending: false })
    .range(from, from + PAGE_SIZE - 1)
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
    <div className="narrow-shell space-y-6">
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
        <div className="overflow-x-auto rounded-lg border border-slate-800 bg-slate-900">
          <table className="w-full text-sm">
            <thead className="text-slate-400 border-b border-slate-800">
              <tr>
                <th className="text-left px-4 py-3">Tournament</th>
                <th className="text-left px-4 py-3">Status</th>
                <th className="text-left px-4 py-3 hidden sm:table-cell">Format</th>
                <th className="text-left px-4 py-3 hidden sm:table-cell">Date</th>
                <th className="text-right px-4 py-3">Players</th>
                <th className="text-left px-4 py-3">Champion</th>
                {owner && <th className="px-4 py-3" aria-label="Actions" />}
              </tr>
            </thead>
            <tbody>
              {tournaments.map((t) => {
                const players = t.participants?.[0]?.count ?? 0;
                const champion = t.winner_id ? championById.get(t.winner_id) ?? null : null;
                return (
                  <tr key={t.id} className="border-b border-slate-800/60 last:border-0">
                    <td className="px-4 py-3">
                      <Link href={`/t/${t.id}`} className="font-medium hover:text-emerald-300">
                        {t.name}
                      </Link>
                    </td>
                    <td className="px-4 py-3 whitespace-nowrap">
                      <StatusBadge status={t.status} />
                    </td>
                    <td className="px-4 py-3 whitespace-nowrap hidden sm:table-cell">
                      <FormatBadge format={t.format} />
                    </td>
                    <td className="px-4 py-3 whitespace-nowrap text-slate-400 hidden sm:table-cell">
                      {formatDate(t.created_at)}
                    </td>
                    <td className="px-4 py-3 text-right text-slate-400">{players}</td>
                    <td className="px-4 py-3 whitespace-nowrap">
                      {champion ? (
                        <span className="text-emerald-400">🏆 {champion}</span>
                      ) : (
                        <span className="text-slate-600">—</span>
                      )}
                    </td>
                    {owner && (
                      <td className="px-4 py-3 text-right">
                        {t.status !== "completed" && (
                          <DeleteTournamentButton
                            tournamentId={t.id}
                            tournamentName={t.name}
                            compact
                          />
                        )}
                      </td>
                    )}
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      <Pagination
        basePath="/history"
        page={page}
        totalPages={totalPages}
        prevLabel="← Newer"
        nextLabel="Older →"
      />
    </div>
  );
}
