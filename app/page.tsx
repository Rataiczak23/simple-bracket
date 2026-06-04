"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import type { TournamentFormat } from "@/lib/types";
import { rememberAdminToken } from "@/components/adminToken";

export default function HomePage() {
  const router = useRouter();
  const [name, setName] = useState("");
  const [format, setFormat] = useState<TournamentFormat>("single");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function createTournament(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/tournaments", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name, format }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Something went wrong.");
      rememberAdminToken(data.id, data.adminToken);
      router.push(`/t/${data.id}/manage#token=${data.adminToken}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong.");
      setBusy(false);
    }
  }

  return (
    <div className="grid md:grid-cols-2 gap-10 items-start">
      <section className="space-y-4">
        <h1 className="text-3xl font-bold leading-tight">
          🎯 Run a darts tournament in seconds.
        </h1>
        <p className="text-slate-300">
          Simple Bracket makes single &amp; double elimination brackets dead simple. Create a
          tournament, share one link, and let players join as guests — no accounts, no fuss.
        </p>
        <ul className="space-y-2 text-slate-300 text-sm">
          <li>✅ Single or double elimination</li>
          <li>✅ Players join with just a name — no sign-up</li>
          <li>✅ Live bracket updates as you report winners</li>
          <li>✅ One private admin link, one public share link</li>
        </ul>
      </section>

      <section className="rounded-xl border border-slate-800 bg-slate-900 p-6">
        <h2 className="text-lg font-semibold mb-4">Create a tournament</h2>
        <form onSubmit={createTournament} className="space-y-4">
          <div>
            <label className="block text-sm text-slate-400 mb-1" htmlFor="name">
              Tournament name
            </label>
            <input
              id="name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              maxLength={80}
              required
              placeholder="Friday Night Darts"
              className="w-full rounded-md bg-slate-950 border border-slate-700 px-3 py-2 focus:outline-none focus:ring-2 focus:ring-emerald-600"
            />
          </div>

          <div>
            <span className="block text-sm text-slate-400 mb-1">Format</span>
            <div className="grid grid-cols-2 gap-2">
              <FormatOption
                value="single"
                current={format}
                onSelect={setFormat}
                title="Single elimination"
                desc="One loss and you're out."
              />
              <FormatOption
                value="double"
                current={format}
                onSelect={setFormat}
                title="Double elimination"
                desc="A second chance in the losers bracket."
              />
            </div>
          </div>

          {error && <p className="text-sm text-red-400">{error}</p>}

          <button
            type="submit"
            disabled={busy}
            className="w-full rounded-md bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 px-4 py-2 font-semibold"
          >
            {busy ? "Creating…" : "Create tournament"}
          </button>
        </form>
      </section>
    </div>
  );
}

function FormatOption({
  value,
  current,
  onSelect,
  title,
  desc,
}: {
  value: TournamentFormat;
  current: TournamentFormat;
  onSelect: (v: TournamentFormat) => void;
  title: string;
  desc: string;
}) {
  const active = current === value;
  return (
    <button
      type="button"
      onClick={() => onSelect(value)}
      className={`text-left rounded-md border px-3 py-2 ${
        active
          ? "border-emerald-500 bg-emerald-900/30"
          : "border-slate-700 bg-slate-950 hover:border-slate-600"
      }`}
    >
      <div className="text-sm font-medium">{title}</div>
      <div className="text-xs text-slate-400">{desc}</div>
    </button>
  );
}
