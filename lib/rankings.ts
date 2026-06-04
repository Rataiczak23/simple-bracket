import type { Match, Participant } from "@/lib/types";

/**
 * Placement points awarded for finishing a tournament. Tiered by placement so
 * deeper runs are worth more, and totals accumulate across events. Field-size
 * aware via the brackets (winning a 32-player event reaches a higher tier than
 * a 4-player one).
 */
export function pointsForPlacement(placement: number): number {
  if (placement <= 1) return 100; // champion
  if (placement === 2) return 70; // runner-up
  if (placement <= 4) return 40; // semifinalists
  if (placement <= 8) return 20; // quarterfinalists
  if (placement <= 16) return 10;
  return 5; // showed up
}

export interface ComputedResult {
  user_id: string;
  placement: number;
  points: number;
  matches_won: number;
}

/**
 * Derive each player's final placement and points from the completed bracket.
 *
 * Placement is a heuristic based on how far each player advanced (matches won):
 * the champion is 1st, then remaining players are ranked by wins using standard
 * competition ranking (ties share a placement: 1, 2, 3, 3, 5, ...). This maps
 * cleanly onto elimination rounds for single elim and is a sensible ordering for
 * double elim. Only players linked to an account (user_id) are scored.
 */
export function computeResults(
  participants: Participant[],
  matches: Match[],
  championId: string | null
): ComputedResult[] {
  const winsByParticipant = new Map<string, number>();
  for (const m of matches) {
    if (m.winner_id && !m.is_bye) {
      winsByParticipant.set(m.winner_id, (winsByParticipant.get(m.winner_id) ?? 0) + 1);
    }
  }

  const scored = participants
    .filter((p) => p.user_id)
    .map((p) => ({
      user_id: p.user_id as string,
      participant_id: p.id,
      matches_won: winsByParticipant.get(p.id) ?? 0,
    }));

  const champion = championId ? scored.find((s) => s.participant_id === championId) : undefined;
  const rest = scored
    .filter((s) => s.participant_id !== champion?.participant_id)
    .sort((a, b) => b.matches_won - a.matches_won);

  const results: ComputedResult[] = [];

  if (champion) {
    results.push({
      user_id: champion.user_id,
      placement: 1,
      points: pointsForPlacement(1),
      matches_won: champion.matches_won,
    });
  }

  // Competition ranking over the rest, starting at placement 2 (or 1 if no champion).
  const offset = champion ? 2 : 1;
  let placement = offset;
  let prevWins: number | null = null;
  rest.forEach((s, i) => {
    if (prevWins === null || s.matches_won !== prevWins) placement = i + offset;
    prevWins = s.matches_won;
    results.push({
      user_id: s.user_id,
      placement,
      points: pointsForPlacement(placement),
      matches_won: s.matches_won,
    });
  });

  return results;
}
