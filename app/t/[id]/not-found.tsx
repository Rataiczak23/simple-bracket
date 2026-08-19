import Link from "next/link";

export default function TournamentNotFound() {
  return (
    <div className="max-w-md mx-auto text-center rounded-xl border border-slate-800 bg-slate-900 p-8 space-y-4">
      <p className="text-4xl" aria-hidden>
        🎯
      </p>
      <h1 className="text-2xl font-bold">Tournament not found</h1>
      <p className="text-slate-400">
        That tournament doesn&apos;t exist. Double-check the share link — it may have been reset or
        the id may be mistyped.
      </p>
      <div className="flex flex-wrap justify-center gap-3 pt-2">
        <Link
          href="/"
          className="rounded-md bg-emerald-600 hover:bg-emerald-500 px-4 py-2 text-sm font-semibold"
        >
          Back home
        </Link>
        <Link
          href="/history"
          className="rounded-md border border-slate-700 hover:bg-slate-800 px-4 py-2 text-sm font-semibold text-slate-300"
        >
          Match history
        </Link>
      </div>
    </div>
  );
}
