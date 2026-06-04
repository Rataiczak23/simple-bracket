"use client";

import { useState } from "react";
import type { Participant, Tournament } from "@/lib/types";

export function StatusBadge({ status }: { status: Tournament["status"] }) {
  const map = {
    setup: { label: "Open for entries", cls: "bg-sky-900/50 text-sky-300" },
    in_progress: { label: "In progress", cls: "bg-amber-900/50 text-amber-300" },
    completed: { label: "Completed", cls: "bg-emerald-900/50 text-emerald-300" },
  } as const;
  const s = map[status];
  return <span className={`text-xs px-2 py-0.5 rounded-full ${s.cls}`}>{s.label}</span>;
}

export function FormatBadge({ format }: { format: Tournament["format"] }) {
  return (
    <span className="text-xs px-2 py-0.5 rounded-full bg-slate-800 text-slate-300">
      {format === "single" ? "Single elimination" : "Double elimination"}
    </span>
  );
}

export function ChampionBanner({ name }: { name: string }) {
  return (
    <div className="rounded-lg border border-emerald-700 bg-emerald-900/30 px-4 py-3 flex items-center gap-3">
      <span className="text-2xl" aria-hidden>🏆</span>
      <div>
        <div className="text-xs uppercase tracking-wide text-emerald-400">Champion</div>
        <div className="text-lg font-bold text-emerald-200">{name}</div>
      </div>
    </div>
  );
}

export function CopyLink({ label, url }: { label: string; url: string }) {
  const [copied, setCopied] = useState(false);
  async function copy() {
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      /* clipboard may be unavailable */
    }
  }
  return (
    <div>
      <div className="text-xs text-slate-400 mb-1">{label}</div>
      <div className="flex gap-2">
        <input
          readOnly
          value={url}
          onFocus={(e) => e.currentTarget.select()}
          className="flex-1 rounded-md bg-slate-950 border border-slate-700 px-2 py-1 text-xs text-slate-300"
        />
        <button
          type="button"
          onClick={copy}
          className="rounded-md bg-slate-700 hover:bg-slate-600 px-3 py-1 text-xs whitespace-nowrap"
        >
          {copied ? "Copied!" : "Copy"}
        </button>
      </div>
    </div>
  );
}

export function ParticipantList({
  participants,
  onRemove,
  busy,
}: {
  participants: Participant[];
  onRemove?: (id: string) => void;
  busy?: boolean;
}) {
  if (participants.length === 0) {
    return <p className="text-sm text-slate-500 italic">No players yet.</p>;
  }
  return (
    <ol className="space-y-1">
      {participants.map((p, i) => (
        <li
          key={p.id}
          className="flex items-center gap-2 text-sm rounded-md bg-slate-950 border border-slate-800 px-2 py-1"
        >
          <span className="text-slate-500 w-5 text-right">{i + 1}.</span>
          <span className="flex-1 truncate">{p.name}</span>
          {onRemove && (
            <button
              type="button"
              disabled={busy}
              onClick={() => onRemove(p.id)}
              className="text-xs text-red-400 hover:text-red-300 disabled:opacity-50"
              title="Remove player"
            >
              ✕
            </button>
          )}
        </li>
      ))}
    </ol>
  );
}
