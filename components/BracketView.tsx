"use client";

import { useMemo } from "react";
import type { BracketKind, Match, Participant } from "@/lib/types";
import { correctableMatchIds, realContestMatchIds } from "@/lib/bracket";
import MatchCard from "./MatchCard";

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

  return (
    <div className="space-y-8">
      <Section
        title={hasLosers ? "Winners Bracket" : "Bracket"}
        kind="winners"
        matches={matches}
        nameOf={nameOf}
        onPickWinner={onPickWinner}
        correctable={correctable}
        realContest={realContest}
        hasGrandFinal={hasGrandFinal}
        busy={busy}
      />
      {hasLosers && (
        <Section
          title="Losers Bracket"
          kind="losers"
          matches={matches}
          nameOf={nameOf}
          onPickWinner={onPickWinner}
          correctable={correctable}
          realContest={realContest}
          hasGrandFinal={hasGrandFinal}
          busy={busy}
        />
      )}
      {hasGrandFinal && (
        <Section
          title="Grand Final"
          kind="grand_final"
          matches={matches}
          nameOf={nameOf}
          onPickWinner={onPickWinner}
          correctable={correctable}
          realContest={realContest}
          hasGrandFinal={hasGrandFinal}
          busy={busy}
        />
      )}
    </div>
  );
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
  const rounds = useMemo(() => {
    const inBracket = matches
      .filter((m) => m.bracket === kind)
      .sort((a, b) => a.round - b.round || a.match_number - b.match_number);
    const byRound = new Map<number, Match[]>();
    for (const m of inBracket) {
      if (!byRound.has(m.round)) byRound.set(m.round, []);
      byRound.get(m.round)!.push(m);
    }
    // Drop rounds where no real game is ever played (all byes/walkovers). With
    // many first-round byes, an entire early losers-bracket round can be nothing
    // but these. The matches still exist and advance players correctly; they're
    // just not worth a column.
    return [...byRound.entries()]
      .sort((a, b) => a[0] - b[0])
      .filter(([, roundMatches]) => roundMatches.some((m) => realContest.has(m.id)));
  }, [matches, kind, realContest]);

  if (rounds.length === 0) return null;

  return (
    <section>
      <h3 className="text-sm font-semibold uppercase tracking-wide text-slate-400 mb-3">
        {title}
      </h3>
      <div className="bracket-scroll overflow-x-auto pb-2">
        <div className="flex gap-6 min-w-min items-stretch">
          {rounds.map(([round, roundMatches], idx) => (
            <div key={round} className="flex flex-col min-w-[11rem]">
              {/* Label lives in its own fixed-height header so it stays out of
                  the justify-around flow below — otherwise it consumes a
                  distribution slot and knocks the matches off center. */}
              <div className="h-4 text-xs text-slate-500 mb-2">
                {roundLabel(kind, idx, roundMatches.length, hasGrandFinal)}
              </div>
              <div className="flex flex-1 flex-col justify-around gap-4">
                {roundMatches.map((m) => (
                  <MatchCard
                    key={m.id}
                    match={m}
                    nameOf={nameOf}
                    onPickWinner={onPickWinner}
                    correctable={correctable.has(m.id)}
                    busy={busy}
                  />
                ))}
              </div>
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
  matchesInRound: number,
  hasGrandFinal: boolean
): string {
  if (kind === "grand_final") return "Final";
  if (kind === "losers") return `LB Round ${idx + 1}`;

  // Winners bracket (or the whole bracket, in single elimination). The last
  // three rounds get their conventional names; everything before them is just
  // "Round N". A round with N matches has 2N players, so 4/2/1 matches are the
  // quarterfinals/semifinals/final. In double elimination the winners final
  // feeds a separate grand final, so those rounds are prefixed "WB" and the
  // 1-match round is the WB final, not the tournament final.
  const prefix = hasGrandFinal ? "WB " : "";
  if (matchesInRound === 1) return hasGrandFinal ? "WB Final" : "Final";
  if (matchesInRound === 2) return `${prefix}Semifinals`;
  if (matchesInRound === 4) return `${prefix}Quarterfinals`;
  return `Round ${idx + 1}`;
}
