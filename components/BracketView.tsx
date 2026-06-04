"use client";

import { useMemo } from "react";
import type { BracketKind, Match, Participant } from "@/lib/types";
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
        busy={busy}
      />
      {hasLosers && (
        <Section
          title="Losers Bracket"
          kind="losers"
          matches={matches}
          nameOf={nameOf}
          onPickWinner={onPickWinner}
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
  busy,
}: {
  title: string;
  kind: BracketKind;
  matches: Match[];
  nameOf: (id: string | null) => string | null;
  onPickWinner?: (matchId: string, participantId: string) => void;
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
    return [...byRound.entries()].sort((a, b) => a[0] - b[0]);
  }, [matches, kind]);

  if (rounds.length === 0) return null;

  const totalRounds = rounds.length;

  return (
    <section>
      <h3 className="text-sm font-semibold uppercase tracking-wide text-slate-400 mb-3">
        {title}
      </h3>
      <div className="bracket-scroll overflow-x-auto pb-2">
        <div className="flex gap-6 min-w-min">
          {rounds.map(([round, roundMatches], idx) => (
            <div key={round} className="flex flex-col justify-around gap-4 min-w-[11rem]">
              <div className="text-xs text-slate-500 mb-1">
                {roundLabel(kind, idx, totalRounds)}
              </div>
              {roundMatches.map((m) => (
                <MatchCard
                  key={m.id}
                  match={m}
                  nameOf={nameOf}
                  onPickWinner={onPickWinner}
                  busy={busy}
                />
              ))}
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

function roundLabel(kind: BracketKind, idx: number, total: number): string {
  if (kind === "grand_final") return "Final";
  if (kind === "winners") {
    if (idx === total - 1) return "Final";
    if (idx === total - 2) return "Semifinals";
    return `Round ${idx + 1}`;
  }
  return `LB Round ${idx + 1}`;
}
