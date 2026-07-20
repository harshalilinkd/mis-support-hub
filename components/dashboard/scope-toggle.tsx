"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { ListChecks, Sparkles } from "lucide-react";

import { cn } from "@/lib/utils";

/**
 * Which pipeline you are looking at — Issues (§5) or System Requests (§12).
 *
 * The two pipelines are separate ROUTES, not one filtered list, so this navigates
 * rather than filtering: /tickets and /requests each already own their stage tabs,
 * filters and row controls, and duplicating the request list inside All Issues would
 * create a second surface free to drift from the real one. `pair` keeps the Table/
 * Board choice when you switch pipeline, so Issue Board → Request Board.
 *
 * STAFF ONLY at every call site: /tickets and /board are staff-gated
 * (`requireRole(...STAFF_ROLES)`), so offering "Issues" to a USER would hand them a
 * link that redirects. An employee navigates via the sidebar instead.
 */
const SCOPES = [
  {
    key: "ISSUE",
    label: "Issues",
    icon: ListChecks,
    /** [list, board] — index is preserved across a pipeline switch. */
    pair: ["/tickets", "/board"],
  },
  {
    key: "REQUEST",
    label: "System Requests",
    icon: Sparkles,
    pair: ["/requests", "/requests/board"],
  },
] as const;

export function ScopeToggle() {
  const pathname = usePathname();

  // Which pipeline + which view (list vs board) we're currently on. Longest match
  // wins so /requests/board resolves to the request BOARD, not the request list.
  const here = SCOPES.flatMap((s) =>
    s.pair.map((href, view) => ({ scope: s.key, view, href }))
  )
    .filter((x) => pathname === x.href || pathname.startsWith(`${x.href}/`))
    .sort((a, b) => b.href.length - a.href.length)[0];

  const view = here?.view ?? 0;

  return (
    <div className="inline-flex shrink-0 rounded-[var(--radius-input)] border border-border bg-surface p-0.5">
      {SCOPES.map((s) => {
        const active = here?.scope === s.key;
        const Icon = s.icon;
        return (
          <Link
            key={s.key}
            href={s.pair[view]}
            aria-current={active ? "page" : undefined}
            className={cn(
              "inline-flex items-center gap-1.5 whitespace-nowrap rounded-[6px] px-3 py-1 text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
              active
                ? "bg-accent-soft text-primary"
                : "text-text-muted hover:text-foreground"
            )}
          >
            <Icon className="size-4" />
            {s.label}
          </Link>
        );
      })}
    </div>
  );
}
