import Link from "next/link";
import { createServiceClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

interface ResultRow {
  user_id: string;
  placement: number;
  points: number;
  matches_won: number;
  users: { display_name: string } | null;
}

interface Standing {
  userId: string;
  displayName: string;
  points: number;
  events: number;
  titles: number;
  bestPlacement: number;
  matchesWon: number;
}

function aggregate(rows: ResultRow[]): Standing[] {
  const byUser = new Map<string, Standing>();
  for (const r of rows) {
    const s = byUser.get(r.user_id) ?? {
      userId: r.user_id,
      displayName: r.users?.display_name ?? "Unknown",
      points: 0,
      events: 0,
      titles: 0,
      bestPlacement: Infinity,
      matchesWon: 0,
    };
    s.points += r.points;
    s.events += 1;
    if (r.placement === 1) s.titles += 1;
    s.bestPlacement = Math.min(s.bestPlacement, r.placement);
    s.matchesWon += r.matches_won;
    byUser.set(r.user_id, s);
  }
  return [...byUser.values()].sort(
    (a, b) => b.points - a.points || b.titles - a.titles || a.bestPlacement - b.bestPlacement
  );
}

function ordinal(n: number): string {
  if (!Number.isFinite(n)) return "—";
  const s = ["th", "st", "nd", "rd"];
  const v = n % 100;
  return n + (s[(v - 20) % 10] || s[v] || s[0]);
}

export default async function RankingsPage() {
  const supabase = createServiceClient();
  const { data } = await supabase
    .from("results")
    .select("user_id, placement, points, matches_won, users(display_name)")
    .returns<ResultRow[]>();

  const standings = aggregate(data ?? []);

  return (
    <div className="space-y-6">
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
              {standings.map((s, i) => (
                <tr key={s.userId} className="border-b border-slate-800/60 last:border-0">
                  <td className="px-4 py-3 text-slate-500">
                    {i === 0 ? "🥇" : i === 1 ? "🥈" : i === 2 ? "🥉" : i + 1}
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
              ))}
            </tbody>
          </table>
        </div>
      )}

      <p className="text-xs text-slate-600">
        Scoring: champion 100 · runner-up 70 · semifinal 40 · quarterfinal 20 · last 16 → 10 · else 5.
      </p>
    </div>
  );
}
