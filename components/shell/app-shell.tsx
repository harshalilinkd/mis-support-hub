"use client";

import { useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  Inbox,
  KanbanSquare,
  LayoutDashboard,
  LogOut,
  Menu,
  PlusCircle,
  Search,
  Settings,
  Ticket,
  User as UserIcon,
} from "lucide-react";

import { cn } from "@/lib/utils";
import type { SessionUser } from "@/lib/session";
import { signOutAction } from "@/lib/actions/auth";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import { Sheet, SheetContent, SheetTitle, SheetTrigger } from "@/components/ui/sheet";
import { ThemeToggle } from "./theme-toggle";

type NavItem = {
  href: string;
  label: string;
  icon: React.ComponentType<{ className?: string }>;
  staffOnly?: boolean;
};

const NAV: NavItem[] = [
  { href: "/my", label: "My Tickets", icon: Inbox },
  { href: "/new", label: "Raise Ticket", icon: PlusCircle },
  { href: "/dashboard", label: "Dashboard", icon: LayoutDashboard, staffOnly: true },
  { href: "/board", label: "Board", icon: KanbanSquare, staffOnly: true },
];

function initials(name?: string | null, email?: string | null) {
  const base = (name ?? email ?? "?").trim();
  const parts = base.split(/\s+/);
  if (parts.length >= 2 && parts[0] && parts[1]) {
    return (parts[0][0] + parts[1][0]).toUpperCase();
  }
  return base.slice(0, 2).toUpperCase();
}

export function AppShell({
  user,
  children,
}: {
  user: SessionUser;
  children: React.ReactNode;
}) {
  const pathname = usePathname();
  const [mobileOpen, setMobileOpen] = useState(false);
  const items = NAV.filter((n) => !n.staffOnly || user.role !== "USER");

  const isActive = (href: string) =>
    pathname === href || pathname.startsWith(`${href}/`);

  const linkClass = (href: string, centered = false) =>
    cn(
      "flex items-center gap-3 rounded-[var(--radius-input)] px-3 py-2 text-sm font-medium transition-colors",
      centered && "justify-center lg:justify-start",
      isActive(href)
        ? "bg-accent-soft text-primary"
        : "text-text-muted hover:bg-surface-muted hover:text-foreground"
    );

  return (
    <div className="flex min-h-screen">
      {/* Desktop sidebar: full (>= lg) collapsing to an icon rail (md..lg). */}
      <aside className="hidden flex-col border-r border-border bg-surface md:flex md:w-16 lg:w-60">
        <div className="flex h-14 items-center justify-center gap-2 border-b border-border lg:justify-start lg:px-5">
          <Ticket className="size-5 shrink-0 text-primary" />
          <span className="hidden font-display text-[15px] font-semibold lg:inline">
            MIS Support Hub
          </span>
        </div>
        <nav className="flex-1 space-y-1 p-3">
          {items.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              title={item.label}
              className={linkClass(item.href, true)}
            >
              <item.icon className="size-4 shrink-0" />
              <span className="hidden lg:inline">{item.label}</span>
            </Link>
          ))}
        </nav>
        <div className="hidden border-t border-border p-4 lg:block">
          <div className="truncate text-sm font-medium">{user.name ?? "—"}</div>
          <div className="truncate font-mono text-xs text-text-muted">
            {user.role}
          </div>
        </div>
      </aside>

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="flex h-14 items-center gap-3 border-b border-border bg-surface/80 px-4 backdrop-blur">
          {/* Mobile drawer */}
          <Sheet open={mobileOpen} onOpenChange={setMobileOpen}>
            <SheetTrigger asChild>
              <Button
                variant="ghost"
                size="icon"
                className="md:hidden"
                aria-label="Open menu"
              >
                <Menu className="size-5" />
              </Button>
            </SheetTrigger>
            <SheetContent side="left" className="w-72 p-0">
              <SheetTitle className="sr-only">Navigation</SheetTitle>
              <div className="flex h-14 items-center gap-2 border-b border-border px-5">
                <Ticket className="size-5 text-primary" />
                <span className="font-display text-[15px] font-semibold">
                  MIS Support Hub
                </span>
              </div>
              <nav className="space-y-1 p-3">
                {items.map((item) => (
                  <Link
                    key={item.href}
                    href={item.href}
                    onClick={() => setMobileOpen(false)}
                    className={linkClass(item.href)}
                  >
                    <item.icon className="size-4 shrink-0" />
                    {item.label}
                  </Link>
                ))}
              </nav>
            </SheetContent>
          </Sheet>

          {/* Search placeholder (wired in a later phase) */}
          <div className="relative hidden max-w-xs flex-1 sm:block">
            <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-text-muted" />
            <Input
              type="search"
              placeholder="Search tickets…"
              className="pl-9"
              disabled
              aria-label="Search (coming soon)"
            />
          </div>

          <div className="ml-auto flex items-center gap-1.5">
            <ThemeToggle />
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <button
                  className="flex items-center rounded-full outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background"
                  aria-label="Account menu"
                >
                  <Avatar className="size-8">
                    {user.image ? <AvatarImage src={user.image} alt="" /> : null}
                    <AvatarFallback className="bg-accent-soft text-xs font-medium text-primary">
                      {initials(user.name, user.email)}
                    </AvatarFallback>
                  </Avatar>
                </button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-56">
                <DropdownMenuLabel className="flex flex-col gap-0.5">
                  <span className="truncate text-sm font-medium">
                    {user.name ?? "—"}
                  </span>
                  <span className="truncate text-xs font-normal text-text-muted">
                    {user.email}
                  </span>
                </DropdownMenuLabel>
                <DropdownMenuSeparator />
                <DropdownMenuItem disabled>
                  <UserIcon className="size-4" /> Profile
                </DropdownMenuItem>
                <DropdownMenuItem disabled>
                  <Settings className="size-4" /> Settings
                </DropdownMenuItem>
                <DropdownMenuSeparator />
                <DropdownMenuItem
                  onSelect={(event) => {
                    event.preventDefault();
                    void signOutAction();
                  }}
                >
                  <LogOut className="size-4" /> Sign out
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </header>

        <main className="flex-1 p-6">{children}</main>
      </div>
    </div>
  );
}
