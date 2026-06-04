import type { Metadata } from "next";
import Link from "next/link";
import "./globals.css";
import { getCurrentUser } from "@/lib/auth";

export const metadata: Metadata = {
  title: "Simple Bracket — Darts Tournaments",
  description:
    "Dead-simple single & double elimination darts tournaments. Create a bracket, share a link, play.",
};

export const dynamic = "force-dynamic";

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const user = await getCurrentUser();

  return (
    <html lang="en">
      <body>
        <div className="min-h-screen flex flex-col">
          <header className="border-b border-slate-800">
            <div className="max-w-6xl mx-auto px-4 py-3 flex items-center gap-4">
              <Link href="/" className="flex items-center gap-2 font-semibold text-lg">
                <span aria-hidden className="text-bull">🎯</span>
                <span>Simple Bracket</span>
              </Link>
              <Link href="/rankings" className="text-sm text-slate-400 hover:text-slate-200">
                Rankings
              </Link>
              <div className="ml-auto flex items-center gap-3 text-sm">
                {user ? (
                  <>
                    <span className="text-slate-400">
                      Hi, <span className="text-slate-200 font-medium">{user.display_name}</span>
                    </span>
                    <form action="/api/auth/logout" method="post">
                      <button type="submit" className="text-slate-400 hover:text-slate-200">
                        Log out
                      </button>
                    </form>
                  </>
                ) : (
                  <>
                    <Link href="/login" className="text-slate-400 hover:text-slate-200">
                      Sign in
                    </Link>
                    <Link
                      href="/signup"
                      className="rounded-md bg-emerald-600 hover:bg-emerald-500 px-3 py-1.5 font-semibold"
                    >
                      Sign up
                    </Link>
                  </>
                )}
              </div>
            </div>
          </header>
          <main className="flex-1 max-w-6xl w-full mx-auto px-4 py-6">{children}</main>
          <footer className="border-t border-slate-800 text-center text-xs text-slate-600 py-4">
            Simple Bracket · single &amp; double elimination · sign in to play
          </footer>
        </div>
      </body>
    </html>
  );
}
