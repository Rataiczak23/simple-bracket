"use client";

import type { Match } from "@/lib/types";

interface Props {
  match: Match;
  nameOf: (id: string | null) => string | null;
  /** When set, the card is interactive and clicking a player reports them as the winner. */
  onPickWinner?: (matchId: string, participantId: string) => void;
  busy?: boolean;
}

export default function MatchCard({ match, nameOf, onPickWinner, busy }: Props) {
  const playable =
    !!onPickWinner &&
    !match.is_bye &&
    match.winner_id === null &&
    match.slot1_participant !== null &&
    match.slot2_participant !== null;

  return (
    <div className="w-44 rounded-md border border-slate-700 bg-slate-900 text-sm shadow">
      <Slot
        slot={1}
        match={match}
        nameOf={nameOf}
        playable={playable}
        busy={busy}
        onPickWinner={onPickWinner}
      />
      <div className="h-px bg-slate-700" />
      <Slot
        slot={2}
        match={match}
        nameOf={nameOf}
        playable={playable}
        busy={busy}
        onPickWinner={onPickWinner}
      />
    </div>
  );
}

function Slot({
  slot,
  match,
  nameOf,
  playable,
  busy,
  onPickWinner,
}: {
  slot: 1 | 2;
  match: Match;
  nameOf: (id: string | null) => string | null;
  playable: boolean;
  busy?: boolean;
  onPickWinner?: (matchId: string, participantId: string) => void;
}) {
  const pid = slot === 1 ? match.slot1_participant : match.slot2_participant;
  const name = nameOf(pid);
  const isWinner = match.winner_id !== null && match.winner_id === pid;
  // In a bye, the lone present player has advanced.
  const advancedByBye = match.is_bye && pid !== null;

  const label = name ?? (match.is_bye ? "Bye" : "—");

  const base =
    "flex items-center justify-between px-2 py-1.5 transition-colors";
  const stateClass = isWinner || advancedByBye
    ? "bg-emerald-900/40 text-emerald-200 font-semibold"
    : pid === null
      ? "text-slate-500 italic"
      : "text-slate-200";

  if (playable && pid) {
    return (
      <button
        type="button"
        disabled={busy}
        onClick={() => onPickWinner?.(match.id, pid)}
        className={`${base} w-full text-left hover:bg-emerald-800/40 disabled:opacity-50 ${stateClass}`}
        title="Click to mark as winner"
      >
        <span className="truncate">{label}</span>
        <span aria-hidden className="text-xs text-emerald-400">win ▸</span>
      </button>
    );
  }

  return (
    <div className={`${base} ${stateClass}`}>
      <span className="truncate">{label}</span>
      {isWinner && <span aria-hidden className="text-xs">✓</span>}
    </div>
  );
}
