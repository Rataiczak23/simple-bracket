import type { Metadata } from "next";
import Link from "next/link";
import "./globals.css";
import HeaderShell from "@/components/HeaderShell";
import NavLink from "@/components/NavLink";
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
            <HeaderShell>
              <Link href="/" className="flex items-center gap-2 font-semibold text-lg">
                <span aria-hidden className="text-bull">🎯</span>
                <span>Simple Bracket</span>
              </Link>
              <nav className="flex items-center gap-1">
                <NavLink href="/rankings">Rankings</NavLink>
                <NavLink href="/history">History</NavLink>
              </nav>
              {/* Account cluster: who you are, and the two things you can do
                  about it. Profile lives here rather than with the site nav
                  because it's about your account, not the tournaments. */}
              <div className="ml-auto flex items-center gap-1 text-sm">
                {user ? (
                  <>
                    {/* Hidden on narrow screens, where the tabs matter more. */}
                    <span className="hidden sm:inline text-slate-400 mr-1">
                      Hi, <span className="text-slate-200 font-medium">{user.display_name}</span>
                    </span>
                    <NavLink href="/profile">Profile</NavLink>
                    <form action="/api/auth/logout" method="post">
                      <button
                        type="submit"
                        className="rounded-md px-2.5 py-1.5 text-sm whitespace-nowrap text-slate-400 transition-colors hover:bg-slate-800/60 hover:text-slate-200"
                      >
                        Log out
                      </button>
                    </form>
                  </>
                ) : (
                  <>
                    <Link
                      href="/login"
                      className="rounded-md px-2.5 py-1.5 whitespace-nowrap text-slate-400 transition-colors hover:bg-slate-800/60 hover:text-slate-200"
                    >
                      Sign in
                    </Link>
                    <Link
                      href="/signup"
                      className="ml-1 rounded-md bg-emerald-600 hover:bg-emerald-500 px-3 py-1.5 font-semibold"
                    >
                      Sign up
                    </Link>
                  </>
                )}
              </div>
            </HeaderShell>
          </header>
          <main className="page-shell flex-1 py-6">{children}</main>
          <footer className="border-t border-slate-800 text-center text-xs text-slate-600 py-4">
            Simple Bracket · single &amp; double elimination · sign in to play
          </footer>
        </div>
      </body>
    </html>
  );
}
