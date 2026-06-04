// Quick simulation harness for the bracket engine.
// Run with: npx tsx lib/bracket.test.mjs   (tsx resolves the .ts import)
import { generateBracket, applyWinner } from "./bracket.ts";

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

for (const n of [2, 3, 4, 5, 6, 7, 8, 9, 13, 16]) check("single", n);
console.log("");
for (const n of [2, 3, 4, 5, 6, 7, 8, 9, 13, 16]) check("double", n);
