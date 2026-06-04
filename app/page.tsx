import Link from "next/link";
import { getCurrentUser } from "@/lib/auth";
import CreateTournamentForm from "@/components/CreateTournamentForm";

export const dynamic = "force-dynamic";

export default async function HomePage() {
  const user = await getCurrentUser();

  return (
    <div className="grid md:grid-cols-2 gap-10 items-start">
      <section className="space-y-4">
        <h1 className="text-3xl font-bold leading-tight">
          🎯 Run a darts tournament in seconds.
        </h1>
        <p className="text-slate-300">
          Simple Bracket makes single &amp; double elimination brackets dead simple. Create a
          tournament, share one link, and let signed-in players join — every result feeds the{" "}
          <Link href="/rankings" className="text-emerald-400 hover:underline">
            power rankings
          </Link>
          .
        </p>
        <ul className="space-y-2 text-slate-300 text-sm">
          <li>✅ Single or double elimination</li>
          <li>✅ Players join with their account — results count toward rankings</li>
          <li>✅ Live bracket updates as you report winners</li>
          <li>✅ One private admin link, one public share link</li>
        </ul>
      </section>

      <section className="rounded-xl border border-slate-800 bg-slate-900 p-6">
        <h2 className="text-lg font-semibold mb-4">Create a tournament</h2>
        {user ? (
          <CreateTournamentForm />
        ) : (
          <div className="space-y-3">
            <p className="text-sm text-slate-400">Sign in to create a tournament and host a bracket.</p>
            <div className="flex gap-2">
              <Link
                href="/login"
                className="flex-1 text-center rounded-md bg-emerald-600 hover:bg-emerald-500 px-4 py-2 font-semibold"
              >
                Sign in
              </Link>
              <Link
                href="/signup"
                className="flex-1 text-center rounded-md border border-slate-700 hover:border-slate-600 px-4 py-2 font-semibold"
              >
                Create account
              </Link>
            </div>
          </div>
        )}
      </section>
    </div>
  );
}
