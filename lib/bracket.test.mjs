// Quick simulation harness for the bracket engine.
// Run with: npx tsx lib/bracket.test.mjs   (tsx resolves the .ts import)
import {
  generateBracket,
  applyWinner,
  addLateEntrant,
  openByeSlots,
  correctableMatchIds,
  correctWinner,
} from "./bracket.ts";

function makeParticipants(n) {
  return Array.from({ length: n }, (_, i) => ({
    id: `p${i + 1}`,
    tournament_id: "t",
    name: `P${i + 1}`,
    seed: i + 1,
    created_at: "",
  }));
}

// Deterministic "lower id wins" so results are reproducible.
function playOut(matches, format, n) {
  let champion = null;
  let guard = 0;
  while (true) {
    if (guard++ > 1000) throw new Error("infinite loop — bracket never completes");
    const playable = matches.find(
      (m) =>
        m.winner_id === null &&
        !m.is_bye &&
        m.slot1_participant !== null &&
        m.slot2_participant !== null
    );
    if (!playable) break;
    // pick lower-numbered player as winner
    const a = playable.slot1_participant;
    const b = playable.slot2_participant;
    const winner = Number(a.slice(1)) <= Number(b.slice(1)) ? a : b;
    const res = applyWinner(matches, playable.id, winner);
    matches = res.matches;
    if (res.champion) champion = res.champion;
  }
  return champion;
}

function check(format, n) {
  const participants = makeParticipants(n);
  let matches = generateBracket("t", format, participants);
  // generated matches lack created_at; add it so they satisfy the Match type at runtime
  matches = matches.map((m) => ({ ...m, created_at: "" }));
  const champion = playOut(matches, format, n);

  const finalMatch = matches.find((m) => m.next_match_id === null);
  const unresolved = matches.filter((m) => m.winner_id === null && !m.is_bye);
  const ok = champion !== null && unresolved.length === 0;
  console.log(
    `${format.padEnd(6)} N=${String(n).padStart(2)}  matches=${String(matches.length).padStart(
      3
    )}  champion=${champion ?? "NONE"}  unresolved=${unresolved.length}  ${ok ? "OK" : "FAIL"}`
  );
  if (!ok) {
    console.log("  final:", finalMatch);
    console.log("  unresolved:", unresolved);
    process.exitCode = 1;
  }
}

/** Play the first `count` available real matchups (slot1 always wins). */
function playSome(matches, count) {
  for (let i = 0; i < count; i++) {
    const next = matches.find(
      (m) =>
        m.winner_id === null &&
        !m.is_bye &&
        m.slot1_participant !== null &&
        m.slot2_participant !== null
    );
    if (!next) break;
    matches = applyWinner(matches, next.id, next.slot1_participant).matches;
  }
  return matches;
}

/**
 * A player added after the bracket was generated must take an open bye spot,
 * leave the already-played results intact, and still let the bracket finish.
 */
function checkLateEntry(format, n, played) {
  const participants = makeParticipants(n);
  let matches = generateBracket("t", format, participants).map((m) => ({ ...m, created_at: "" }));
  matches = playSome(matches, played);

  const kept = matches
    .filter((m) => m.winner_id !== null && m.slot1_participant && m.slot2_participant)
    .map((m) => `${m.id}:${m.winner_id}`);

  const slots = openByeSlots(matches);
  const label = `${format.padEnd(6)} N=${String(n).padStart(2)} played=${played}`;
  if (slots.length === 0) {
    console.log(`${label}  no open slot (rebuild required)  OK`);
    return;
  }

  // Numbered like the rest so the harness's "lowest id wins" rule still applies.
  const lateId = `p${n + 1}`;
  matches = addLateEntrant(matches, lateId, slots[0]).matches;

  const placed = matches.some(
    (m) => m.slot1_participant === lateId || m.slot2_participant === lateId
  );
  const stillKept = kept.every((k) =>
    matches.some((m) => `${m.id}:${m.winner_id}` === k)
  );

  const champion = playOut(matches, format, n + 1);
  const unresolved = matches.filter((m) => m.winner_id === null && !m.is_bye);
  const ok = placed && stillKept && champion !== null && unresolved.length === 0;
  console.log(
    `${label}  slots=${String(slots.length).padStart(2)}  placed=${placed}  keptResults=${
      kept.length
    }/${stillKept ? "intact" : "LOST"}  champion=${champion ?? "NONE"}  unresolved=${
      unresolved.length
    }  ${ok ? "OK" : "FAIL"}`
  );
  if (!ok) process.exitCode = 1;
}

/**
 * A misclick must always be fixable while it is the newest real result — even
 * when the loser was immediately walked over in the losers bracket, which is
 * the norm in a bye-heavy field. Then, once a real game has been played after
 * it, the older result must lock. Finally, a correction must leave a bracket
 * that still plays out to a champion.
 */
function checkCorrections(format, n) {
  const participants = makeParticipants(n);
  let matches = generateBracket("t", format, participants).map((m) => ({ ...m, created_at: "" }));

  const played = [];
  let lockedSomething = false;
  let alwaysCorrectable = true;
  let guard = 0;
  while (guard++ < 1000) {
    const next = matches.find(
      (m) =>
        m.winner_id === null &&
        !m.is_bye &&
        m.slot1_participant !== null &&
        m.slot2_participant !== null
    );
    if (!next) break;
    const loser = next.slot2_participant;
    matches = applyWinner(matches, next.id, next.slot1_participant).matches;
    played.push({ id: next.id, loser });

    const correctable = correctableMatchIds(matches);
    // The result just entered is on the frontier, so it must be changeable.
    if (!correctable.has(next.id)) alwaysCorrectable = false;
    // Anything with a real game played after it must have locked.
    if (played.some((p) => p.id !== next.id && !correctable.has(p.id))) lockedSomething = true;
  }

  // Switch the newest result to the other player, then finish the tournament.
  // Correcting the last game re-decides it on the spot, so the champion comes
  // back from correctWinner; correcting an earlier one reopens games to replay.
  const last = played[played.length - 1];
  const isFinal = matches.find((m) => m.next_match_id === null)?.id === last.id;
  let corrected = true;
  let champion = null;
  try {
    const res = correctWinner(matches, last.id, last.loser);
    matches = res.matches;
    champion = res.champion ?? playOut(matches, format, n);
  } catch (err) {
    corrected = false;
    console.log(`  correctWinner threw: ${err.message}`);
  }
  // Switching the final hands the title to the other player, by definition.
  const titleMoved = !isFinal || champion === last.loser;
  const unresolved = matches.filter((m) => m.winner_id === null && !m.is_bye);

  // Only the very last match of a finished bracket has nothing played after it.
  const finalOnly = correctableMatchIds(matches).size === 1;
  const expectLocks = played.length > 1;
  const ok =
    alwaysCorrectable &&
    corrected &&
    champion !== null &&
    titleMoved &&
    unresolved.length === 0 &&
    finalOnly &&
    lockedSomething === expectLocks;
  console.log(
    `${format.padEnd(6)} N=${String(n).padStart(2)} realGames=${String(played.length).padStart(
      2
    )}  frontierFixable=${alwaysCorrectable}  olderLocked=${lockedSomething}/${expectLocks}  ` +
      `corrected=${corrected}  champion=${champion ?? "NONE"}${
        titleMoved ? "" : "/WRONG"
      }  unresolved=${unresolved.length}  onlyFinalOpen=${finalOnly}  ${ok ? "OK" : "FAIL"}`
  );
  if (!ok) process.exitCode = 1;
}

for (const n of [2, 3, 4, 5, 6, 7, 8, 9, 13, 16]) check("single", n);
console.log("");
for (const n of [2, 3, 4, 5, 6, 7, 8, 9, 13, 16]) check("double", n);
console.log("");
for (const n of [3, 5, 6, 7, 9, 13]) {
  for (const played of [0, 1, 3]) checkLateEntry("single", n, played);
}
console.log("");
for (const n of [3, 5, 6, 7, 9, 13]) {
  for (const played of [0, 1, 3]) checkLateEntry("double", n, played);
}
console.log("");
for (const n of [2, 3, 4, 5, 6, 7, 8, 9, 10, 13, 16]) checkCorrections("single", n);
console.log("");
for (const n of [2, 3, 4, 5, 6, 7, 8, 9, 10, 13, 16]) checkCorrections("double", n);
