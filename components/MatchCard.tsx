"use client";

import type { Match } from "@/lib/types";

interface Props {
  match: Match;
  nameOf: (id: string | null) => string | null;
  /** When set, the card is interactive and clicking a player reports them as the winner. */
  onPickWinner?: (matchId: string, participantId: string) => void;
  /** Whether this match's result may still be changed (nothing played after it). */
  correctable?: boolean;
  busy?: boolean;
}

export default function MatchCard({ match, nameOf, onPickWinner, correctable, busy }: Props) {
  // A match is interactive whenever both real players are set (byes resolve on
  // their own). Before a result it's "click to pick the winner"; after a result
  // the other player stays clickable to fix a misclick — but only while this is
  // still the most recent match (`correctable`), so an earlier result can't be
  // changed out from under matches already played after it.
  const interactive =
    !!onPickWinner &&
    !match.is_bye &&
    match.slot1_participant !== null &&
    match.slot2_participant !== null;

  return (
    <div className="w-44 rounded-md border border-slate-700 bg-slate-900 text-sm shadow">
      <Slot
        slot={1}
        match={match}
        nameOf={nameOf}
        interactive={interactive}
        correctable={!!correctable}
        busy={busy}
        onPickWinner={onPickWinner}
      />
      <div className="h-px bg-slate-700" />
      <Slot
        slot={2}
        match={match}
        nameOf={nameOf}
        interactive={interactive}
        correctable={!!correctable}
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
  interactive,
  correctable,
  busy,
  onPickWinner,
}: {
  slot: 1 | 2;
  match: Match;
  nameOf: (id: string | null) => string | null;
  interactive: boolean;
  correctable: boolean;
  busy?: boolean;
  onPickWinner?: (matchId: string, participantId: string) => void;
}) {
  const pid = slot === 1 ? match.slot1_participant : match.slot2_participant;
  const name = nameOf(pid);
  const decided = match.winner_id !== null;
  const isWinner = decided && match.winner_id === pid;
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

  // Before a result: either player is clickable to pick the winner. After a
  // result: the other player is clickable to switch, but only while this match
  // is still correctable (nothing has been played after it).
  const clickable = interactive && !!pid && !isWinner && (!decided || correctable);
  if (clickable && pid) {
    const changing = decided;
    const onClick = () => {
      if (
        changing &&
        !confirm(
          `Change the winner to ${label}? Any matches after this one will be reset.`
        )
      ) {
        return;
      }
      onPickWinner?.(match.id, pid);
    };
    return (
      <button
        type="button"
        disabled={busy}
        onClick={onClick}
        className={`${base} w-full text-left hover:bg-emerald-800/40 disabled:opacity-50 ${stateClass}`}
        title={changing ? "Click to switch the winner to this player" : "Click to mark as winner"}
      >
        <span className="truncate">{label}</span>
        <span aria-hidden className="text-xs text-emerald-400">
          {changing ? "switch ▸" : "win ▸"}
        </span>
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
