"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { KanbanSquare, LayoutList } from "lucide-react";

import { cn } from "@/lib/utils";

const VIEWS = [
  { href: "/dashboard", label: "Table", icon: LayoutList },
  { href: "/board", label: "Board", icon: KanbanSquare },
];

/** Table / Board segmented control (shared by /dashboard and /board). */
export function ViewToggle() {
  const pathname = usePathname();
  return (
    <div className="inline-flex rounded-[var(--radius-input)] border border-border bg-surface p-0.5">
      {VIEWS.map((v) => {
        const active = pathname === v.href;
        return (
          <Link
            key={v.href}
            href={v.href}
            className={cn(
              "inline-flex items-center gap-1.5 rounded-[6px] px-3 py-1 text-sm font-medium transition-colors",
              active
                ? "bg-accent-soft text-primary"
                : "text-text-muted hover:text-foreground"
            )}
          >
            <v.icon className="size-4" />
            {v.label}
          </Link>
        );
      })}
    </div>
  );
}
