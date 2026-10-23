// Scoring checks for the power rankings. Rankings are recomputed from every
// completed bracket on each load, so a regression here rewrites past results.
// Run with: npx tsx lib/rankings.test.mjs   (tsx resolves the .ts import)
import { generateBracket, applyWinner } from "./bracket.ts";
import { aggregateStandings, computeResults, pointsForPlacement } from "./rankings.ts";

function makeParticipants(n) {
  return Array.from({ length: n }, (_, i) => ({
    id: `p${i + 1}`,
    tournament_id: "t",
    user_id: `u${i + 1}`,
    name: `P${i + 1}`,
    seed: i + 1,
    created_at: "",
  }));
}

const lowerIdWins = (a, b) => (Number(a.slice(1)) <= Number(b.slice(1)) ? a : b);

function playOut(format, participants, pick = lowerIdWins) {
  let matches = generateBracket("t", format, participants).map((m) => ({ ...m, created_at: "" }));
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
    const res = applyWinner(
      matches,
      playable.id,
      pick(playable.slot1_participant, playable.slot2_participant, playable)
    );
    matches = res.matches;
    if (res.champion) champion = res.champion;
  }
  return computeResults(participants, matches, champion);
}

function byUser(results) {
  return [...results].sort((a, b) => Number(a.user_id.slice(1)) - Number(b.user_id.slice(1)));
}

function expect(label, actual, expected) {
  const ok = JSON.stringify(actual) === JSON.stringify(expected);
  console.log(`${label.padEnd(48)} ${ok ? "OK" : "FAIL"}`);
  if (!ok) {
    console.log("  expected:", JSON.stringify(expected));
    console.log("  actual:  ", JSON.stringify(actual));
    process.exitCode = 1;
  }
}

// Placements 1, 2, 3, 5, 9, 17: champion down to the "showed up" tier.
const POINTS_TABLE = {
  6: [50, 35, 20, 10, 5, 5],
  7: [65, 45, 25, 15, 5, 5],
  8: [80, 55, 30, 15, 10, 5],
  9: [90, 65, 35, 20, 10, 5],
  10: [100, 70, 40, 20, 10, 5],
  16: [100, 70, 40, 20, 10, 5],
};
for (const [n, expected] of Object.entries(POINTS_TABLE)) {
  expect(
    `points        N=${n}`,
    [1, 2, 3, 5, 9, 17].map((p) => pointsForPlacement(p, Number(n))),
    expected
  );
}
console.log("");

// Expected per player p1..pN under "lower id wins". Players knocked out in the
// same round share a placement; walkovers don't count as match wins.
const BRACKETS = [
  {
    format: "single",
    n: 8,
    placement: [1, 2, 3, 3, 5, 5, 5, 5],
    points: [80, 55, 30, 30, 15, 15, 15, 15],
    wins: [3, 2, 1, 1, 0, 0, 0, 0],
  },
  {
    format: "single",
    n: 10,
    placement: [1, 2, 3, 3, 5, 5, 5, 5, 9, 9],
    points: [100, 70, 40, 40, 20, 20, 20, 20, 10, 10],
    wins: [3, 2, 1, 1, 0, 0, 1, 1, 0, 0],
  },
  {
    format: "double",
    n: 8,
    placement: [1, 2, 3, 4, 5, 5, 7, 7],
    points: [80, 55, 30, 30, 15, 15, 15, 15],
    wins: [4, 3, 3, 2, 1, 1, 0, 0],
  },
  {
    format: "double",
    n: 11,
    placement: [1, 2, 3, 4, 5, 5, 7, 7, 9, 9, 9],
    points: [100, 70, 40, 40, 20, 20, 20, 20, 10, 10, 10],
    wins: [4, 3, 3, 2, 1, 3, 2, 2, 0, 0, 0],
  },
];
for (const b of BRACKETS) {
  const results = byUser(playOut(b.format, makeParticipants(b.n)));
  const label = `${b.format.padEnd(6)} N=${String(b.n).padStart(2)}`;
  expect(`${label}  placements`, results.map((r) => r.placement), b.placement);
  expect(`${label}  points`, results.map((r) => r.points), b.points);
  expect(`${label}  match wins`, results.map((r) => r.matches_won), b.wins);
}
console.log("");

// p1 beats p2 in the winners-bracket final, p2 comes back through the losers
// bracket and takes the grand final. The grand final alone decides 1st and 2nd,
// whatever either player's win count.
const upset = byUser(
  playOut("double", makeParticipants(8), (a, b, match) =>
    [a, b].includes("p1") && [a, b].includes("p2")
      ? match.bracket === "grand_final"
        ? "p2"
        : "p1"
      : lowerIdWins(a, b)
  )
);
expect(
  "double N= 8  champion from the losers bracket",
  upset.slice(0, 2).map((r) => [r.user_id, r.placement, r.matches_won]),
  [
    ["u1", 2, 3],
    ["u2", 1, 4],
  ]
);

// A player without an account still takes a place and counts toward the field
// size, but isn't scored.
const withGuest = makeParticipants(8);
withGuest[7].user_id = null;
const guestResults = byUser(playOut("single", withGuest));
expect("single N= 8  guest takes a place, isn't scored", guestResults.length, 7);
expect("single N= 8  guest still counts toward field", guestResults[0].points, 80);
console.log("");

const row = (user_id, placement, points, matches_won) => ({
  user_id,
  display_name: user_id,
  placement,
  points,
  matches_won,
});
expect(
  "standings  points first",
  aggregateStandings([row("a", 5, 20, 1), row("b", 1, 100, 3), row("a", 3, 40, 2)]).map(
    (s) => [s.userId, s.points, s.events]
  ),
  [
    ["b", 100, 1],
    ["a", 60, 2],
  ]
);
expect(
  "standings  tie -> best finish",
  aggregateStandings([row("a", 3, 40, 5), row("b", 2, 40, 1)]).map((s) => s.userId),
  ["b", "a"]
);
expect(
  "standings  tie -> best finish -> match wins",
  aggregateStandings([row("a", 2, 70, 2), row("b", 2, 70, 4)]).map((s) => s.userId),
  ["b", "a"]
);
