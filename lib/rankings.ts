import type { Match, Participant } from "@/lib/types";

const MIN_FIELD = 6;
const MIN_FIELD_WEIGHT = 0.5;
const FULL_POINTS_FIELD = 10;
const POINTS_STEP = 5;

function tierPoints(placement: number): number {
  if (placement <= 1) return 100; // champion
  if (placement === 2) return 70; // runner-up
  if (placement <= 4) return 40; // semifinalists
  if (placement <= 8) return 20; // quarterfinalists
  if (placement <= 16) return 10;
  return 5; // showed up
}

/**
 * Share of the tier points a field of `fieldSize` pays: 50% at 6 players (events
 * never run smaller), rising on a log scale to full points from 10 up. Typical
 * nights are 8-11 players, so that range pays most of the points. Without it a
 * 6-player title pays the same as a 10-player one.
 */
export function fieldWeight(fieldSize: number): number {
  if (fieldSize <= MIN_FIELD) return MIN_FIELD_WEIGHT;
  const progress = Math.log2(fieldSize / MIN_FIELD) / Math.log2(FULL_POINTS_FIELD / MIN_FIELD);
  return Math.min(1, MIN_FIELD_WEIGHT + (1 - MIN_FIELD_WEIGHT) * progress);
}

/**
 * Placement points for one finish, scaled by the size of the field and rounded
 * to the nearest 5 (never below 5) so the board reads in tidy numbers.
 */
export function pointsForPlacement(placement: number, fieldSize: number): number {
  const scaled = tierPoints(placement) * fieldWeight(fieldSize);
  return Math.max(POINTS_STEP, Math.round(scaled / POINTS_STEP) * POINTS_STEP);
}

export interface ComputedResult {
  user_id: string;
  placement: number;
  points: number;
  matches_won: number;
}

/**
 * Derive each player's final placement and points from the completed bracket.
 * Rankings call this on every load rather than storing its output, so a change
 * to the scoring rules applies to every tournament, past and future.
 *
 * Placement comes from the round a player was knocked out in: the match they
 * lost with nowhere left to drop to. In single elim that is any loss; in double
 * elim it is a losers-bracket or grand-final loss. Later knockouts rank higher,
 * and players knocked out in the same round share a placement (1, 2, 3, 3, 5,
 * ...). Every participant takes a place, guests included, so the field size and
 * the places reflect who actually played, but only players linked to an account
 * (user_id) are returned. Walkovers don't count toward matches won.
 */
export function computeResults(
  participants: Participant[],
  matches: Match[],
  championId: string | null
): ComputedResult[] {
  const knockoutStage = new Map<string, number>();
  const winsByParticipant = new Map<string, number>();
  for (const m of matches) {
    if (!m.winner_id || m.slot1_participant === null || m.slot2_participant === null) continue;
    winsByParticipant.set(m.winner_id, (winsByParticipant.get(m.winner_id) ?? 0) + 1);
    if (m.loser_next_match_id) continue;
    const loser = m.slot1_participant === m.winner_id ? m.slot2_participant : m.slot1_participant;
    knockoutStage.set(loser, m.bracket === "grand_final" ? Infinity : m.round);
  }

  const fieldSize = participants.length;
  const champion = participants.find((p) => p.id === championId);
  const rest = participants
    .filter((p) => p.id !== champion?.id)
    .map((p) => ({ participant: p, stage: knockoutStage.get(p.id) ?? 0 }))
    .sort((a, b) => b.stage - a.stage);

  const placed: Array<{ participant: Participant; placement: number }> = [];
  if (champion) placed.push({ participant: champion, placement: 1 });
  const offset = champion ? 2 : 1;
  let placement = offset;
  rest.forEach((r, i) => {
    if (i > 0 && r.stage !== rest[i - 1].stage) placement = i + offset;
    placed.push({ participant: r.participant, placement });
  });

  return placed
    .filter((p) => p.participant.user_id)
    .map(({ participant, placement }) => ({
      user_id: participant.user_id as string,
      placement,
      points: pointsForPlacement(placement, fieldSize),
      matches_won: winsByParticipant.get(participant.id) ?? 0,
    }));
}

export interface RankedResult extends ComputedResult {
  display_name: string;
}

export interface Standing {
  userId: string;
  displayName: string;
  points: number;
  events: number;
  titles: number;
  bestPlacement: number;
  matchesWon: number;
}

/** Total each player's results, highest points first; ties go to best finish, then match wins. */
export function aggregateStandings(rows: RankedResult[]): Standing[] {
  const byUser = new Map<string, Standing>();
  for (const r of rows) {
    const s = byUser.get(r.user_id) ?? {
      userId: r.user_id,
      displayName: r.display_name,
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
    (a, b) =>
      b.points - a.points || a.bestPlacement - b.bestPlacement || b.matchesWon - a.matchesWon
  );
}
