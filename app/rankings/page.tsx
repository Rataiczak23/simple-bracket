import Link from "next/link";
import { aggregateStandings, computeResults, type RankedResult } from "@/lib/rankings";
import { createServiceClient } from "@/lib/supabase/server";
import Pagination, { PAGE_SIZE, pageCount, resolvePage } from "@/components/Pagination";
import type { Match, Participant } from "@/lib/types";

export const dynamic = "force-dynamic";

interface CompletedTournament {
  winner_id: string | null;
  participants: Array<Participant & { users: { display_name: string } | null }>;
  matches: Match[];
}

function ordinal(n: number): string {
  if (!Number.isFinite(n)) return "—";
  const s = ["th", "st", "nd", "rd"];
  const v = n % 100;
  return n + (s[(v - 20) % 10] || s[v] || s[0]);
}

// Supabase caps a response at 1,000 rows, so page through the tournaments.
const FETCH_BATCH = 1000;

async function loadCompletedTournaments(): Promise<CompletedTournament[]> {
  const supabase = createServiceClient();
  const all: CompletedTournament[] = [];
  for (let from = 0; ; from += FETCH_BATCH) {
    const { data } = await supabase
      .from("tournaments")
      .select("winner_id, participants(*, users(display_name)), matches(*)")
      .eq("status", "completed")
      .order("created_at")
      .range(from, from + FETCH_BATCH - 1)
      .returns<CompletedTournament[]>();
    all.push(...(data ?? []));
    if (!data || data.length < FETCH_BATCH) return all;
  }
}

function resultRows(tournaments: CompletedTournament[]): RankedResult[] {
  return tournaments.flatMap((t) => {
    const names = new Map(
      t.participants.map((p) => [p.user_id, p.users?.display_name ?? "Unknown"])
    );
    return computeResults(t.participants, t.matches, t.winner_id).map((r) => ({
      ...r,
      display_name: names.get(r.user_id) ?? "Unknown",
    }));
  });
}

export default async function RankingsPage({ searchParams }: { searchParams: { page?: string } }) {
  const standings = aggregateStandings(resultRows(await loadCompletedTournaments()));
  const totalPages = pageCount(standings.length);
  const page = resolvePage(searchParams.page, totalPages, "/rankings");
  const from = (page - 1) * PAGE_SIZE;

  return (
    <div className="narrow-shell space-y-6">
      <div className="flex flex-wrap items-center gap-3">
        <h1 className="text-2xl font-bold">🏅 Power Rankings</h1>
        <span className="text-sm text-slate-500">Placement points across all completed tournaments</span>
      </div>

      {standings.length === 0 ? (
        <div className="rounded-lg border border-slate-800 bg-slate-900 p-6 text-slate-400">
          No results yet. Finish a tournament and standings will show up here.{" "}
          <Link href="/" className="text-emerald-400 hover:underline">
            Create one →
          </Link>
        </div>
      ) : (
        <div className="overflow-x-auto rounded-lg border border-slate-800 bg-slate-900">
          <table className="w-full text-sm">
            <thead className="text-slate-400 border-b border-slate-800">
              <tr>
                <th className="text-left px-4 py-3 w-12">#</th>
                <th className="text-left px-4 py-3">Player</th>
                <th className="text-right px-4 py-3">Points</th>
                <th className="text-right px-4 py-3">Titles</th>
                <th className="text-right px-4 py-3">Events</th>
                <th className="text-right px-4 py-3 hidden sm:table-cell">Best</th>
                <th className="text-right px-4 py-3 hidden sm:table-cell">Match wins</th>
              </tr>
            </thead>
            <tbody>
              {standings.slice(from, from + PAGE_SIZE).map((s, i) => {
                const rank = from + i + 1;
                return (
                  <tr key={s.userId} className="border-b border-slate-800/60 last:border-0">
                    <td className="px-4 py-3 text-slate-500">
                      {rank === 1 ? "🥇" : rank === 2 ? "🥈" : rank === 3 ? "🥉" : rank}
                    </td>
                    <td className="px-4 py-3 font-medium">{s.displayName}</td>
                    <td className="px-4 py-3 text-right font-semibold text-emerald-300">{s.points}</td>
                    <td className="px-4 py-3 text-right">{s.titles}</td>
                    <td className="px-4 py-3 text-right text-slate-400">{s.events}</td>
                    <td className="px-4 py-3 text-right text-slate-400 hidden sm:table-cell">
                      {ordinal(s.bestPlacement)}
                    </td>
                    <td className="px-4 py-3 text-right text-slate-400 hidden sm:table-cell">
                      {s.matchesWon}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      <Pagination basePath="/rankings" page={page} totalPages={totalPages} />

      <p className="text-xs text-slate-600">
        Scoring: champion 100 · runner-up 70 · semifinal 40 · quarterfinal 20 · last 16 → 10 · else 5,
        scaled by field size (50% at 6 players, rising to full points at 10+).
      </p>
    </div>
  );
}
