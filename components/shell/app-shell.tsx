"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  Inbox,
  KanbanSquare,
  LayoutDashboard,
  PlusCircle,
  Ticket,
} from "lucide-react";

import { cn } from "@/lib/utils";
import type { Role } from "@/lib/db/schema";
import { ThemeToggle } from "./theme-toggle";

type NavUser = {
  id: string;
  role: Role;
  name?: string | null;
  email?: string | null;
  image?: string | null;
};

const userNav = [
  { href: "/my", label: "My Tickets", icon: Inbox },
  { href: "/new", label: "Raise Ticket", icon: PlusCircle },
];

const staffNav = [
  { href: "/dashboard", label: "Dashboard", icon: LayoutDashboard },
  { href: "/board", label: "Board", icon: KanbanSquare },
  { href: "/my", label: "My Tickets", icon: Inbox },
  { href: "/new", label: "Raise Ticket", icon: PlusCircle },
];

export function AppShell({
  user,
  children,
}: {
  user: NavUser;
  children: React.ReactNode;
}) {
  const pathname = usePathname();
  const nav = user.role === "USER" ? userNav : staffNav;

  return (
    <div className="flex min-h-screen">
      <aside className="hidden w-60 flex-col border-r border-border bg-surface lg:flex">
        <div className="flex h-14 items-center gap-2 border-b border-border px-5">
          <Ticket className="size-5 text-primary" />
          <span className="font-display text-[15px] font-semibold">
            MIS Support Hub
          </span>
        </div>
        <nav className="flex-1 space-y-1 p-3">
          {nav.map((item) => {
            const active =
              pathname === item.href || pathname.startsWith(`${item.href}/`);
            return (
              <Link
                key={item.href}
                href={item.href}
                className={cn(
                  "flex items-center gap-3 rounded-[var(--radius-input)] px-3 py-2 text-sm font-medium transition-colors",
                  active
                    ? "bg-accent-soft text-primary"
                    : "text-text-muted hover:bg-surface-muted hover:text-foreground"
                )}
              >
                <item.icon className="size-4" />
                {item.label}
              </Link>
            );
          })}
        </nav>
        <div className="border-t border-border p-4">
          <div className="truncate text-sm font-medium">
            {user.name ?? "Unknown user"}
          </div>
          <div className="truncate font-mono text-xs text-text-muted">
            {user.role}
          </div>
        </div>
      </aside>

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="flex h-14 items-center justify-between border-b border-border bg-surface/80 px-5 backdrop-blur">
          <div className="truncate text-sm text-text-muted">{user.email}</div>
          <div className="flex items-center gap-2">
            <ThemeToggle />
          </div>
        </header>
        <main className="flex-1 p-6">{children}</main>
      </div>
    </div>
  );
}
