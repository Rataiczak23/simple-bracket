"use client";

import { usePathname } from "next/navigation";

/**
 * Header row, width-matched to the page underneath it. Bracket pages (`/t/...`)
 * run the full width of the screen, so the header does too; every other page
 * sits in the narrow column, and a header that ignored that would leave the
 * logo and tabs floating out past the content.
 *
 * Client-side only because it needs the current path — `children` are still
 * rendered on the server and passed straight through.
 */
export default function HeaderShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const wide = pathname.startsWith("/t/");

  return (
    <div className="page-shell py-3">
      <div
        className={`flex flex-wrap items-center gap-x-4 gap-y-2 ${wide ? "" : "narrow-shell"}`}
      >
        {children}
      </div>
    </div>
  );
}
