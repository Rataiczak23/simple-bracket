import Link from "next/link";
import { redirect } from "next/navigation";

export const PAGE_SIZE = 10;

/**
 * Read a `?page=` param and send out-of-range values to the nearest real page,
 * so a stale or hand-edited link never shows an empty table.
 */
export function resolvePage(param: string | undefined, totalPages: number, basePath: string): number {
  const requested = Number.parseInt(param ?? "1", 10);
  if (!Number.isFinite(requested) || requested < 1) redirect(basePath);
  if (requested > totalPages) redirect(`${basePath}?page=${totalPages}`);
  return requested;
}

export function pageCount(total: number): number {
  return Math.max(1, Math.ceil(total / PAGE_SIZE));
}

function PageLink({
  href,
  disabled,
  children,
}: {
  href: string;
  disabled: boolean;
  children: React.ReactNode;
}) {
  const cls = "rounded-md border border-slate-700 px-3 py-1.5 text-sm font-medium";
  if (disabled) return <span className={`${cls} opacity-40`}>{children}</span>;
  return (
    <Link href={href} className={`${cls} hover:border-slate-600`}>
      {children}
    </Link>
  );
}

export default function Pagination({
  basePath,
  page,
  totalPages,
  prevLabel = "← Previous",
  nextLabel = "Next →",
}: {
  basePath: string;
  page: number;
  totalPages: number;
  prevLabel?: string;
  nextLabel?: string;
}) {
  if (totalPages <= 1) return null;
  return (
    <nav className="flex items-center justify-between gap-3" aria-label="Pagination">
      <PageLink href={`${basePath}?page=${page - 1}`} disabled={page <= 1}>
        {prevLabel}
      </PageLink>
      <span className="text-sm text-slate-500">
        Page {page} of {totalPages}
      </span>
      <PageLink href={`${basePath}?page=${page + 1}`} disabled={page >= totalPages}>
        {nextLabel}
      </PageLink>
    </nav>
  );
}
