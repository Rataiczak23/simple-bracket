"use client";

import { useMemo } from "react";
import type { BracketKind, Match, Participant } from "@/lib/types";
import { correctableMatchIds, realContestMatchIds } from "@/lib/bracket";
import MatchCard from "./MatchCard";

/**
 * Bracket layout.
 *
 * Matches are positioned rather than flowed, so every match can sit level with
 * whatever feeds it and the connector lines can be drawn as plain SVG geometry
 * — no DOM measuring, no layout observer. Cards are a fixed size (names
 * truncate to one line), which is what makes that arithmetic exact.
 */

const CARD_W = 176; // w-44
const SLOT_H = 32; // h-8
const CARD_H = 2 * SLOT_H + 1 + 2; // two slots + 1px divider + 2px borders
const COL_GAP = 48; // horizontal room for a connector elbow
const ROW_GAP = 16;
const PITCH = CARD_H + ROW_GAP;
const LABEL_H = 24; // the round label above each column

const colX = (col: number) => col * (CARD_W + COL_GAP);
const rowY = (row: number) => row * PITCH;
/** A match's winner leaves from the middle of its card. */
const exitY = (row: number) => rowY(row) + CARD_H / 2;
/**
 * ...and arrives at the middle of the slot it will fill, not the middle of the
 * card. Aiming at the card's centre would put every line exactly on top of the
 * divider between its two slots, which reads as the line running straight
 * through the card rather than stopping at it.
 */
const entryY = (row: number, slot: 1 | 2) =>
  rowY(row) + 1 + (slot === 1 ? SLOT_H / 2 : SLOT_H + 1 + SLOT_H / 2);

/** A match with the grid position it was assigned. `row` may be fractional. */
interface Placed {
  match: Match;
  col: number;
  row: number;
}

interface Connector {
  from: Placed;
  to: Placed;
  /** Which of the target's two slots this edge delivers into. */
  slot: 1 | 2;
  /** Someone has actually advanced along this edge, so it's drawn live. */
  travelled: boolean;
}

/** A drawn feeder, plus the slot of the descendant match its winner lands in. */
interface Feed {
  match: Match;
  slot: 1 | 2;
}

interface SectionLayout {
  placed: Placed[];
  connectors: Connector[];
  /** One entry per drawn column: its label inputs. */
  columns: { round: number; shown: number; total: number }[];
  width: number;
  height: number;
}

interface Props {
  matches: Match[];
  participants: Participant[];
  onPickWinner?: (matchId: string, participantId: string) => void;
  busy?: boolean;
}

export default function BracketView({ matches, participants, onPickWinner, busy }: Props) {
  const nameOf = useMemo(() => {
    const map = new Map(participants.map((p) => [p.id, p.name]));
    return (id: string | null) => (id ? map.get(id) ?? null : null);
  }, [participants]);

  // Only the most recent results (nothing played after them) may be corrected.
  const correctable = useMemo(() => correctableMatchIds(matches), [matches]);
  // Matches where a real game is (or could be) played; the rest are byes/walkovers.
  const realContest = useMemo(() => realContestMatchIds(matches), [matches]);

  const hasLosers = matches.some((m) => m.bracket === "losers");
  const hasGrandFinal = matches.some((m) => m.bracket === "grand_final");

  const shared = { nameOf, onPickWinner, correctable, realContest, hasGrandFinal, busy };

  return (
    <div className="space-y-8">
      <Section
        title={hasLosers ? "Winners Bracket" : "Bracket"}
        kind="winners"
        matches={matches}
        {...shared}
      />
      {hasLosers && (
        <Section title="Losers Bracket" kind="losers" matches={matches} {...shared} />
      )}
      {hasGrandFinal && (
        <Section title="Grand Final" kind="grand_final" matches={matches} {...shared} />
      )}
    </div>
  );
}

/**
 * Place every drawn match in one bracket section and work out the connectors.
 *
 * Columns follow the round, so a match always appears with its own round even
 * when it has no visible feeder (a bye-heavy field leaves plenty of those).
 * Rows come from the tree: a match with no drawn feeders takes the next free
 * row, and anything else centres on the rows of the matches that feed it. Byes
 * and walkovers aren't drawn, so the tree is contracted through them — the
 * match a bye "played" is skipped and its player's real first game connects
 * straight to whatever comes next.
 */
function layoutSection(sectionMatches: Match[], drawn: Set<string>): SectionLayout {
  const byId = new Map(sectionMatches.map((m) => [m.id, m]));

  // Feeder edges that stay inside this section, kept in slot order so slot 1
  // sits above slot 2. (A winners-bracket loser's edge into the losers bracket
  // crosses sections and is deliberately not drawn.)
  const slotFeeders = new Map<string, (Match | null)[]>();
  for (const m of sectionMatches) {
    const target = m.next_match_id;
    if (!target || !byId.has(target) || !m.next_match_slot) continue;
    const arr = slotFeeders.get(target) ?? [null, null];
    arr[m.next_match_slot - 1] = m;
    slotFeeders.set(target, arr);
  }
  const feedersOf = (m: Match): Feed[] =>
    (slotFeeders.get(m.id) ?? []).flatMap((f, i) =>
      f ? [{ match: f, slot: (i + 1) as 1 | 2 }] : []
    );

  // Nearest drawn feeders, looking through undrawn walkovers. A feeder lifted
  // up through a walkover keeps the slot that walkover fed, since that's where
  // its winner actually ends up.
  const childCache = new Map<string, Feed[]>();
  const drawnChildren = (m: Match): Feed[] => {
    const cached = childCache.get(m.id);
    if (cached) return cached;
    const out: Feed[] = [];
    for (const { match: f, slot } of feedersOf(m)) {
      if (drawn.has(f.id)) out.push({ match: f, slot });
      else out.push(...drawnChildren(f).map((deeper) => ({ match: deeper.match, slot })));
    }
    childCache.set(m.id, out);
    return out;
  };

  const columns = [...new Set(sectionMatches.map((m) => m.round))]
    .sort((a, b) => a - b)
    .map((round) => {
      const all = sectionMatches.filter((m) => m.round === round);
      return { round, all, shown: all.filter((m) => drawn.has(m.id)) };
    })
    .filter((c) => c.shown.length > 0);
  const colOfRound = new Map(columns.map((c, i) => [c.round, i]));

  const rowOf = new Map<string, number>();
  let nextFreeRow = 0;
  const assignRow = (m: Match): number => {
    const cached = rowOf.get(m.id);
    if (cached !== undefined) return cached;
    const kids = drawnChildren(m);
    const row =
      kids.length === 0
        ? nextFreeRow++
        : kids.reduce((sum, k) => sum + assignRow(k.match), 0) / kids.length;
    rowOf.set(m.id, row);
    return row;
  };

  // The section's root is the match nothing in this section advances out of.
  // Walking down from it orders the rows the way the bracket nests.
  const root = sectionMatches.find((m) => !m.next_match_id || !byId.has(m.next_match_id));
  if (root && drawn.has(root.id)) assignRow(root);
  // Belt and braces: never drop a card just because the walk missed it.
  for (const c of columns) for (const m of c.shown) if (!rowOf.has(m.id)) rowOf.set(m.id, nextFreeRow++);

  const placed: Placed[] = columns.flatMap((c) =>
    c.shown.map((m) => ({ match: m, col: colOfRound.get(c.round)!, row: rowOf.get(m.id)! }))
  );
  const placedById = new Map(placed.map((p) => [p.match.id, p]));

  const connectors: Connector[] = [];
  for (const p of placed) {
    for (const kid of drawnChildren(p.match)) {
      const from = placedById.get(kid.match.id);
      if (from) {
        connectors.push({ from, to: p, slot: kid.slot, travelled: kid.match.winner_id !== null });
      }
    }
  }

  const maxRow = placed.reduce((max, p) => Math.max(max, p.row), 0);
  return {
    placed,
    connectors,
    columns: columns.map((c) => ({ round: c.round, shown: c.shown.length, total: c.all.length })),
    width: columns.length * CARD_W + Math.max(0, columns.length - 1) * COL_GAP,
    height: rowY(maxRow) + CARD_H,
  };
}

function Section({
  title,
  kind,
  matches,
  nameOf,
  onPickWinner,
  correctable,
  realContest,
  hasGrandFinal,
  busy,
}: {
  title: string;
  kind: BracketKind;
  matches: Match[];
  nameOf: (id: string | null) => string | null;
  onPickWinner?: (matchId: string, participantId: string) => void;
  correctable: Set<string>;
  realContest: Set<string>;
  hasGrandFinal: boolean;
  busy?: boolean;
}) {
  const layout = useMemo(() => {
    const inSection = matches
      .filter((m) => m.bracket === kind)
      .sort((a, b) => a.round - b.round || a.match_number - b.match_number);
    return layoutSection(inSection, realContest);
  }, [matches, kind, realContest]);

  if (layout.columns.length === 0) return null;

  return (
    <section>
      <h3 className="text-sm font-semibold uppercase tracking-wide text-slate-400 mb-3">
        {title}
      </h3>
      <div className="bracket-scroll overflow-x-auto pb-2">
        <div
          className="relative"
          style={{ width: layout.width, height: LABEL_H + layout.height }}
        >
          {layout.columns.map((c, idx) => (
            <div
              key={c.round}
              className="absolute text-xs text-slate-500 truncate"
              style={{ left: colX(idx), top: 0, width: CARD_W }}
            >
              {roundLabel(kind, idx, layout.columns.length, c.shown < c.total, hasGrandFinal)}
            </div>
          ))}

          {/* Behind the cards: the lines that make this read as a bracket. An
              edge runs out of a match's right side, turns in the gutter just
              before its target, and lands on the slot its winner will fill.
              Kept dimmer than the card borders so the cards stay the thing you
              read and the lines stay the thing you follow. */}
          <svg
            aria-hidden
            width={layout.width}
            height={layout.height}
            className="absolute left-0 pointer-events-none"
            style={{ top: LABEL_H }}
          >
            {layout.connectors.map(({ from, to, slot, travelled }) => {
              const startX = colX(from.col) + CARD_W;
              const startY = exitY(from.row);
              const endX = colX(to.col);
              const endY = entryY(to.row, slot);
              const turnX = endX - COL_GAP / 2;
              return (
                <polyline
                  key={`${from.match.id}-${to.match.id}`}
                  points={`${startX},${startY} ${turnX},${startY} ${turnX},${endY} ${endX},${endY}`}
                  fill="none"
                  strokeWidth={1.5}
                  className={travelled ? "stroke-emerald-800" : "stroke-slate-800"}
                />
              );
            })}
          </svg>

          {layout.placed.map((p) => (
            <div
              key={p.match.id}
              className="absolute"
              style={{ left: colX(p.col), top: LABEL_H + rowY(p.row) }}
            >
              <MatchCard
                match={p.match}
                nameOf={nameOf}
                onPickWinner={onPickWinner}
                correctable={correctable.has(p.match.id)}
                busy={busy}
              />
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

function roundLabel(
  kind: BracketKind,
  idx: number,
  roundCount: number,
  partial: boolean,
  hasGrandFinal: boolean
): string {
  if (kind === "grand_final") return "Final";

  // Losers bracket. Its closing rounds get names for the same reason the
  // winners bracket's do — "LB Round 5" doesn't tell you it's the last chance
  // to stay alive. Rounds are numbered by column, not by their number in the
  // data: a round that's all walkovers isn't drawn, and skipping a number in
  // the labels would just look like a bug.
  if (kind === "losers") {
    const fromEnd = roundCount - 1 - idx;
    if (fromEnd === 0) return "LB Final";
    if (fromEnd === 1) return "LB Semifinal";
    return `LB Round ${idx + 1}`;
  }

  // Winners bracket (or the whole bracket, in single elimination). A first
  // round that holds fewer games than its slots is only there to trim a
  // non-power-of-two field down to one — that's a play-in, not a full round.
  if (idx === 0 && partial) return "Play-in";

  // The last three rounds get their conventional names, counted back from the
  // end of the bracket; everything before them is just "Round N". In double
  // elimination the winners final feeds a separate grand final, so those rounds
  // are prefixed "WB" and the last one is the WB final, not the tournament's.
  const prefix = hasGrandFinal ? "WB " : "";
  const fromEnd = roundCount - 1 - idx;
  if (fromEnd === 0) return hasGrandFinal ? "WB Final" : "Final";
  if (fromEnd === 1) return `${prefix}Semifinals`;
  if (fromEnd === 2) return `${prefix}Quarterfinals`;
  return `Round ${idx + 1}`;
}
