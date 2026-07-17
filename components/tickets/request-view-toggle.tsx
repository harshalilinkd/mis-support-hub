"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { KanbanSquare, List } from "lucide-react";

import { cn } from "@/lib/utils";

const VIEWS = [
  { href: "/requests", label: "List", icon: List },
  { href: "/requests/board", label: "Board", icon: KanbanSquare },
] as const;

/** List ↔ Board switch for the request surfaces (mirrors the issue ViewToggle). */
export function RequestViewToggle() {
  const pathname = usePathname();

  return (
    <div className="inline-flex shrink-0 rounded-[var(--radius-input)] border border-border bg-surface p-0.5">
      {VIEWS.map((v) => {
        const active = pathname === v.href;
        const Icon = v.icon;
        return (
          <Link
            key={v.href}
            href={v.href}
            aria-current={active ? "page" : undefined}
            className={cn(
              "inline-flex items-center gap-1.5 rounded-[6px] px-2.5 py-1 text-sm font-semibold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
              active ? "bg-accent-soft text-primary" : "text-foreground hover:bg-surface-muted"
            )}
          >
            <Icon className="size-4" />
            <span className="hidden sm:inline">{v.label}</span>
          </Link>
        );
      })}
    </div>
  );
}
