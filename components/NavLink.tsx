"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

/**
 * Header tab. Highlights when you're on the page it points at, so the nav
 * shows where you are as well as where you can go. Client-side only because it
 * needs the current path; the header itself stays a Server Component.
 */
export default function NavLink({ href, children }: { href: string; children: React.ReactNode }) {
  const pathname = usePathname();
  const active = pathname === href || pathname.startsWith(`${href}/`);

  return (
    <Link
      href={href}
      aria-current={active ? "page" : undefined}
      className={`rounded-md px-2.5 py-1.5 text-sm whitespace-nowrap transition-colors ${
        active
          ? "bg-slate-800 text-slate-100 font-semibold"
          : "text-slate-400 hover:bg-slate-800/60 hover:text-slate-200"
      }`}
    >
      {children}
    </Link>
  );
}
