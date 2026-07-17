import type { BracketKind, Match, Participant, TournamentFormat } from "./types";

/**
 * Pure bracket generation + advancement. No DB access.
 *
 * Byes (non-power-of-2 fields) are modeled as matches that resolve with no
 * winner (`is_bye = true`). A unified `resolve()` fixpoint propagates byes
 * forward through BOTH the winners and losers brackets, so a player who draws
 * a bye in the winners bracket — or whose losers-bracket opponent never shows
 * because the feeding match was itself a bye — advances automatically.
 */

/** Minimal shape shared by freshly-generated matches and persisted DB matches. */
interface BracketMatch {
  id: string;
  slot1_participant: string | null;
  slot2_participant: string | null;
  winner_id: string | null;
  next_match_id: string | null;
  next_match_slot: 1 | 2 | null;
  loser_next_match_id: string | null;
  loser_next_match_slot: 1 | 2 | null;
  is_bye: boolean;
}

/** A match ready to insert into the DB (no created_at; id pre-generated). */
export interface GeneratedMatch extends BracketMatch {
  tournament_id: string;
  bracket: BracketKind;
  round: number;
  match_number: number;
}

function uuid(): string {
  return globalThis.crypto.randomUUID();
}

function nextPowerOfTwo(n: number): number {
  let size = 1;
  while (size < n) size *= 2;
  return Math.max(size, 2);
}

/**
 * Standard single-elimination seeding order for a bracket of `size` slots.
 * Returns 1-based seed numbers positioned so seed 1 and seed 2 only meet in the
 * final and byes (high seeds) are spread out.
 */
function seedOrder(size: number): number[] {
  let seeds = [1, 2];
  while (seeds.length < size) {
    const sum = seeds.length * 2 + 1;
    const next: number[] = [];
    for (const s of seeds) {
      next.push(s);
      next.push(sum - s);
    }
    seeds = next;
  }
  return seeds;
}

function setSlot(match: BracketMatch, slot: 1 | 2 | null, value: string | null) {
  if (slot === 1) match.slot1_participant = value;
  else if (slot === 2) match.slot2_participant = value;
}

// ---------------------------------------------------------------------------
// Generation
// ---------------------------------------------------------------------------

export function generateBracket(
  tournamentId: string,
  format: TournamentFormat,
  participants: Participant[]
): GeneratedMatch[] {
  if (participants.length < 2) {
    throw new Error("Need at least 2 participants to start.");
  }
  const matches =
    format === "single"
      ? generateSingleElimination(tournamentId, participants)
      : generateDoubleElimination(tournamentId, participants);

  // Settle all byes (cascades through losers bracket + grand final).
  resolve(matches);
  return matches;
}

function newMatch(
  tournamentId: string,
  bracket: BracketKind,
  round: number,
  matchNumber: number
): GeneratedMatch {
  return {
    id: uuid(),
    tournament_id: tournamentId,
    bracket,
    round,
    match_number: matchNumber,
    slot1_participant: null,
    slot2_participant: null,
    winner_id: null,
    next_match_id: null,
    next_match_slot: null,
    loser_next_match_id: null,
    loser_next_match_slot: null,
    is_bye: false,
  };
}

/** Build the winners bracket and fill round 1 with seeded participants. */
function buildWinnersBracket(
  tournamentId: string,
  participants: Participant[]
): GeneratedMatch[][] {
  const n = participants.length;
  const size = nextPowerOfTwo(n);
  const order = seedOrder(size); // 1-based seed per slot position
  const rounds = Math.log2(size);

  const byRound: GeneratedMatch[][] = [];
  for (let r = 1; r <= rounds; r++) {
    const count = size / 2 ** r;
    const arr: GeneratedMatch[] = [];
    for (let m = 0; m < count; m++) {
      arr.push(newMatch(tournamentId, "winners", r, m));
    }
    byRound.push(arr);
  }

  // Link winners forward.
  for (let r = 0; r < byRound.length - 1; r++) {
    byRound[r].forEach((match, m) => {
      const next = byRound[r + 1][Math.floor(m / 2)];
      match.next_match_id = next.id;
      match.next_match_slot = m % 2 === 0 ? 1 : 2;
    });
  }

  // Fill round 1 from seeding (seed > n => bye => null).
  const seedToId = (seed: number): string | null =>
    seed <= n ? participants[seed - 1].id : null;
  byRound[0].forEach((match, m) => {
    match.slot1_participant = seedToId(order[2 * m]);
    match.slot2_participant = seedToId(order[2 * m + 1]);
  });

  return byRound;
}

function generateSingleElimination(
  tournamentId: string,
  participants: Participant[]
): GeneratedMatch[] {
  return buildWinnersBracket(tournamentId, participants).flat();
}

/**
 * Double elimination: winners bracket + losers bracket + a single grand final
 * (no bracket-reset second final, by design — see plan).
 */
function generateDoubleElimination(
  tournamentId: string,
  participants: Participant[]
): GeneratedMatch[] {
  const wb = buildWinnersBracket(tournamentId, participants);
  const size = 2 ** wb.length; // wb.length === number of WB rounds (m)
  const m = wb.length;

  const grandFinal = newMatch(tournamentId, "grand_final", 1, 0);

  // Degenerate case: 2-slot bracket has no losers bracket.
  // WB final winner -> GF slot1, WB final loser -> GF slot2.
  if (m === 1) {
    const wbFinal = wb[0][0];
    wbFinal.next_match_id = grandFinal.id;
    wbFinal.next_match_slot = 1;
    wbFinal.loser_next_match_id = grandFinal.id;
    wbFinal.loser_next_match_slot = 2;
    return [...wb.flat(), grandFinal];
  }

  // Build losers-bracket rounds. Each round is either:
  //   - 'wb1'  : LB round 1, both slots from WB round-1 losers
  //   - 'major': brings in WB round-k losers to face an LB survivor
  //   - 'minor': pairs survivors of the previous LB round
  type LbRound = { kind: "wb1" | "major" | "minor"; wbRound?: number; matches: GeneratedMatch[] };
  const lb: LbRound[] = [];
  let lbRoundNo = 0;
  const addRound = (kind: LbRound["kind"], count: number, wbRound?: number): LbRound => {
    lbRoundNo += 1;
    const matches: GeneratedMatch[] = [];
    for (let i = 0; i < count; i++) matches.push(newMatch(tournamentId, "losers", lbRoundNo, i));
    const round: LbRound = { kind, wbRound, matches };
    lb.push(round);
    return round;
  };

  // LB round 1: size/4 matches fed by the size/2 WB round-1 losers.
  let survivors = size / 2; // WB round-1 losers entering LB
  addRound("wb1", survivors / 2);
  survivors /= 2;

  for (let k = 2; k <= m; k++) {
    // Major round: each survivor faces a WB round-k loser.
    addRound("major", survivors, k);
    // Minor round (pair survivors) — except after the final WB round.
    if (k < m) {
      addRound("minor", survivors / 2);
      survivors /= 2;
    }
  }

  // Link LB winners forward (round j -> round j+1).
  for (let j = 0; j < lb.length - 1; j++) {
    const cur = lb[j];
    const nxt = lb[j + 1];
    cur.matches.forEach((match, i) => {
      if (nxt.kind === "minor") {
        // survivors pair up: 2 -> 1
        match.next_match_id = nxt.matches[Math.floor(i / 2)].id;
        match.next_match_slot = i % 2 === 0 ? 1 : 2;
      } else {
        // into a major round, 1:1, slot 1 (slot 2 reserved for the WB loser)
        match.next_match_id = nxt.matches[i].id;
        match.next_match_slot = 1;
      }
    });
  }

  // Last LB round winner -> grand final slot 2.
  const lastLb = lb[lb.length - 1];
  lastLb.matches[0].next_match_id = grandFinal.id;
  lastLb.matches[0].next_match_slot = 2;

  // Drop WB losers into the losers bracket.
  // WB round-1 losers -> LB round 1 (pairs), reversed to reduce early rematches.
  const lb1 = lb[0].matches;
  wb[0].forEach((match, i) => {
    const target = lb1.length - 1 - Math.floor(i / 2);
    match.loser_next_match_id = lb1[target].id;
    match.loser_next_match_slot = i % 2 === 0 ? 1 : 2;
  });

  // WB round-k losers (k >= 2) -> the matching major round, slot 2, reversed.
  for (let k = 2; k <= m; k++) {
    const major = lb.find((r) => r.kind === "major" && r.wbRound === k)!;
    const wbRoundMatches = wb[k - 1];
    wbRoundMatches.forEach((match, j) => {
      const target = major.matches.length - 1 - j;
      match.loser_next_match_id = major.matches[target].id;
      match.loser_next_match_slot = 2;
    });
  }

  // WB final winner -> grand final slot 1.
  const wbFinal = wb[m - 1][0];
  wbFinal.next_match_id = grandFinal.id;
  wbFinal.next_match_slot = 1;

  return [...wb.flat(), ...lb.flatMap((r) => r.matches), grandFinal];
}

// ---------------------------------------------------------------------------
// Resolution / advancement
// ---------------------------------------------------------------------------

function buildFeederIndex(matches: BracketMatch[]): Map<string, BracketMatch> {
  // key: `${matchId}:${slot}` -> the match that feeds that slot.
  const feeder = new Map<string, BracketMatch>();
  for (const m of matches) {
    if (m.next_match_id && m.next_match_slot) {
      feeder.set(`${m.next_match_id}:${m.next_match_slot}`, m);
    }
    if (m.loser_next_match_id && m.loser_next_match_slot) {
      feeder.set(`${m.loser_next_match_id}:${m.loser_next_match_slot}`, m);
    }
  }
  return feeder;
}

function isDecided(m: BracketMatch): boolean {
  return m.winner_id !== null || m.is_bye;
}

function slotSettled(m: BracketMatch, slot: 1 | 2, feeder: Map<string, BracketMatch>): boolean {
  const pid = slot === 1 ? m.slot1_participant : m.slot2_participant;
  if (pid !== null) return true; // has a participant
  const f = feeder.get(`${m.id}:${slot}`);
  if (!f) return true; // nobody feeds this slot => it's a genuine bye
  return isDecided(f); // settled once the feeding match has resolved
}

/**
 * Clear a match's result and recursively clear every match it feeds. Changing a
 * result invalidates the participants (and therefore the recorded winners) of
 * everything downstream, so those matches are reopened to be re-played. Runs
 * over the forward DAG, so it always terminates; revisiting a converged node
 * (e.g. the grand final, reachable via both winner and loser paths) is a
 * harmless no-op.
 */
function reopenForward(m: BracketMatch, byId: Map<string, BracketMatch>) {
  m.winner_id = null;
  m.is_bye = false;
  const edges: Array<[string | null, 1 | 2 | null]> = [
    [m.next_match_id, m.next_match_slot],
    [m.loser_next_match_id, m.loser_next_match_slot],
  ];
  for (const [nextId, slot] of edges) {
    if (!nextId || !slot) continue;
    const nx = byId.get(nextId);
    if (!nx) continue;
    reopenForward(nx, byId); // clear the downstream result first…
    setSlot(nx, slot, null); // …then remove the participant we had sent there
  }
}

/** Push a decided match's winner forward and its loser into the losers bracket. */
function pushResult(m: BracketMatch, byId: Map<string, BracketMatch>) {
  const w = m.winner_id;
  const loser =
    w === null ? null : m.slot1_participant === w ? m.slot2_participant : m.slot1_participant;

  if (m.next_match_id) {
    const nx = byId.get(m.next_match_id);
    if (nx) setSlot(nx, m.next_match_slot, w);
  }
  if (m.loser_next_match_id) {
    const nl = byId.get(m.loser_next_match_id);
    if (nl) setSlot(nl, m.loser_next_match_slot, loser);
  }
}

/**
 * Fixpoint that auto-resolves every match whose both slots are settled but
 * which has at most one real participant (i.e. a bye). Mutates in place.
 */
function resolve<T extends BracketMatch>(matches: T[]): T[] {
  const byId = new Map<string, BracketMatch>(matches.map((m) => [m.id, m]));
  const feeder = buildFeederIndex(matches);

  let changed = true;
  while (changed) {
    changed = false;
    for (const m of matches) {
      if (isDecided(m)) continue;
      if (!slotSettled(m, 1, feeder) || !slotSettled(m, 2, feeder)) continue;

      const v1 = m.slot1_participant;
      const v2 = m.slot2_participant;
      if (v1 !== null && v2 !== null) continue; // real match: wait for the host

      const winner = v1 ?? v2; // the lone real player, or null if both are byes
      if (winner === null) m.is_bye = true;
      else m.winner_id = winner;
      pushResult(m, byId);
      changed = true;
    }
  }
  return matches;
}

/**
 * Identify matches that are (or can ever become) a real contest: both slots
 * reachable by a real player. The complement are "phantom" matches — byes and
 * walkovers that settle with at most one real player. This is purely structural
 * (it follows the bracket wiring, not the current results), so a match's status
 * never flips as games are played. Used to hide rounds where no actual game is
 * ever played — common in the early losers bracket when the winners bracket has
 * many first-round byes.
 */
export function realContestMatchIds<T extends BracketMatch>(matches: T[]): Set<string> {
  const feeder = new Map<string, { m: T; edge: "w" | "l" }>();
  for (const m of matches) {
    if (m.next_match_id && m.next_match_slot) {
      feeder.set(`${m.next_match_id}:${m.next_match_slot}`, { m, edge: "w" });
    }
    if (m.loser_next_match_id && m.loser_next_match_slot) {
      feeder.set(`${m.loser_next_match_id}:${m.loser_next_match_slot}`, { m, edge: "l" });
    }
  }

  const winnerReal = new Map<string, boolean>();
  const loserReal = new Map<string, boolean>();

  // A slot can hold a real player if it already does, or the match feeding it
  // can send one down that edge (its winner; or its loser, which is real only
  // when the feeder itself has two real players).
  const slotReal = (m: T, s: 1 | 2): boolean => {
    const pid = s === 1 ? m.slot1_participant : m.slot2_participant;
    if (pid !== null) return true;
    const f = feeder.get(`${m.id}:${s}`);
    if (!f) return false;
    return f.edge === "w" ? canProduceWinner(f.m) : canProduceLoser(f.m);
  };
  function canProduceWinner(m: T): boolean {
    const cached = winnerReal.get(m.id);
    if (cached !== undefined) return cached;
    winnerReal.set(m.id, false); // guard (bracket is acyclic, so never re-read)
    const v = slotReal(m, 1) || slotReal(m, 2);
    winnerReal.set(m.id, v);
    return v;
  }
  function canProduceLoser(m: T): boolean {
    const cached = loserReal.get(m.id);
    if (cached !== undefined) return cached;
    loserReal.set(m.id, false);
    const v = slotReal(m, 1) && slotReal(m, 2);
    loserReal.set(m.id, v);
    return v;
  }

  const ids = new Set<string>();
  for (const m of matches) {
    if (slotReal(m, 1) && slotReal(m, 2)) ids.add(m.id);
  }
  return ids;
}

export interface ApplyWinnerResult {
  matches: Match[];
  /** participant id of the tournament champion, or null if not finished yet. */
  champion: string | null;
}

/**
 * Record a host-reported winner for one match and advance the bracket.
 * Returns the mutated matches plus the champion id if the tournament is over.
 */
export function applyWinner(matches: Match[], matchId: string, winnerId: string): ApplyWinnerResult {
  const byId = new Map<string, Match>(matches.map((m) => [m.id, m]));
  const m = byId.get(matchId);
  if (!m) throw new Error("Match not found.");
  if (isDecided(m)) throw new Error("This match already has a result.");
  if (m.slot1_participant === null || m.slot2_participant === null) {
    throw new Error("Both players must be set before reporting a winner.");
  }
  if (winnerId !== m.slot1_participant && winnerId !== m.slot2_participant) {
    throw new Error("Winner must be one of the two players in the match.");
  }

  m.winner_id = winnerId;
  pushResult(m, byId);
  resolve(matches); // cascade any byes that this result unlocks downstream

  // The championship match is the one nobody advances out of.
  const finalMatch = matches.find((x) => x.next_match_id === null);
  const champion = finalMatch?.winner_id ?? null;

  return { matches, champion };
}

/**
 * A decided match's result can be changed only if nothing it fed has itself been
 * decided yet — i.e. it sits on the frontier of played matches. This keeps a
 * correction to the most recent result, so fixing a misclick never silently
 * rewrites a whole subtree of later matches. Returns the set of correctable
 * match ids.
 */
export function correctableMatchIds<T extends BracketMatch>(matches: T[]): Set<string> {
  const byId = new Map<string, BracketMatch>(matches.map((m) => [m.id, m]));
  const downstreamDecided = (id: string | null): boolean => {
    if (!id) return false;
    const nx = byId.get(id);
    return !!nx && (nx.winner_id !== null || nx.is_bye);
  };
  const ids = new Set<string>();
  for (const m of matches) {
    if (m.is_bye || m.winner_id === null) continue; // not a changeable result
    if (downstreamDecided(m.next_match_id)) continue; // winner already advanced
    if (downstreamDecided(m.loser_next_match_id)) continue; // loser already played on
    ids.add(m.id);
  }
  return ids;
}

/** Whether a single match's result may currently be corrected. */
export function canCorrectMatch<T extends BracketMatch>(matches: T[], matchId: string): boolean {
  return correctableMatchIds(matches).has(matchId);
}

/**
 * Fix a mis-clicked result: change an already-decided match's winner to the
 * other player. Everything the match fed is reopened (its participants may have
 * changed, so those results no longer hold), then byes re-cascade. Returns the
 * mutated matches and the champion id if the tournament is still/again complete.
 */
export function correctWinner(matches: Match[], matchId: string, winnerId: string): ApplyWinnerResult {
  const byId = new Map<string, Match>(matches.map((m) => [m.id, m]));
  const m = byId.get(matchId);
  if (!m) throw new Error("Match not found.");
  if (m.is_bye) throw new Error("A bye has no winner to change.");
  if (m.slot1_participant === null || m.slot2_participant === null) {
    throw new Error("Both players must be set before choosing a winner.");
  }
  if (winnerId !== m.slot1_participant && winnerId !== m.slot2_participant) {
    throw new Error("Winner must be one of the two players in the match.");
  }
  if (!canCorrectMatch(matches, matchId)) {
    throw new Error(
      "Only the most recent result can be changed. A later match has already been played from this one."
    );
  }

  // Reopen this match and everything it feeds, then apply the corrected winner.
  reopenForward(m, byId);
  m.winner_id = winnerId;
  pushResult(m, byId);
  resolve(matches);

  const finalMatch = matches.find((x) => x.next_match_id === null);
  const champion = finalMatch?.winner_id ?? null;

  return { matches, champion };
}
