import type { SupabaseClient } from "@supabase/supabase-js";
import type { Match, Participant, Tournament, TournamentBundle } from "./types";

/**
 * Load a full tournament view (tournament + participants + matches) using any
 * Supabase client. Only non-secret tables are touched, so the anon client works.
 * Returns null if the tournament does not exist.
 */
export async function fetchBundle(
  supabase: SupabaseClient,
  id: string
): Promise<TournamentBundle | null> {
  const { data: tournament } = await supabase
    .from("tournaments")
    .select("*")
    .eq("id", id)
    .single<Tournament>();
  if (!tournament) return null;

  const [{ data: participants }, { data: matches }] = await Promise.all([
    supabase
      .from("participants")
      .select("*")
      .eq("tournament_id", id)
      .order("created_at", { ascending: true })
      .returns<Participant[]>(),
    supabase
      .from("matches")
      .select("*")
      .eq("tournament_id", id)
      .returns<Match[]>(),
  ]);

  return {
    tournament,
    participants: participants ?? [],
    matches: matches ?? [],
  };
}
