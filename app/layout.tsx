import type { Metadata } from "next";
import Link from "next/link";
import "./globals.css";

export const metadata: Metadata = {
  title: "Simple Bracket — Darts Tournaments",
  description:
    "Dead-simple single & double elimination darts tournaments. Create a bracket, share a link, play.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>
        <div className="min-h-screen flex flex-col">
          <header className="border-b border-slate-800">
            <div className="max-w-6xl mx-auto px-4 py-3 flex items-center gap-2">
              <Link href="/" className="flex items-center gap-2 font-semibold text-lg">
                <span aria-hidden className="text-bull">🎯</span>
                <span>Simple Bracket</span>
              </Link>
              <span className="ml-auto text-xs text-slate-500">Darts tournaments, made easy</span>
            </div>
          </header>
          <main className="flex-1 max-w-6xl w-full mx-auto px-4 py-6">{children}</main>
          <footer className="border-t border-slate-800 text-center text-xs text-slate-600 py-4">
            Simple Bracket · single &amp; double elimination · no account needed
          </footer>
        </div>
      </body>
    </html>
  );
}
