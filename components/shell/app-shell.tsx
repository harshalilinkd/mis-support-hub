"use client";

import { useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  Inbox,
  KanbanSquare,
  LayoutDashboard,
  ListChecks,
  LogOut,
  Menu,
  PlusCircle,
  Search,
  Settings,
  Ticket,
  Trash2,
  User as UserIcon,
  Users,
} from "lucide-react";

import { signOutAction } from "@/lib/actions/auth";
import type { Role } from "@/lib/db/schema";
import type { SessionUser } from "@/lib/session";
import { cn } from "@/lib/utils";
import { UserAvatar } from "@/components/user-avatar";
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
import { NotificationBell, type BellNotification } from "./notification-bell";
import { ThemeToggle } from "./theme-toggle";

type NavItem = {
  href: string;
  label: string;
  icon: React.ComponentType<{ className?: string }>;
  staffOnly?: boolean;
  adminOnly?: boolean;
  badge?: "myActive";
};

type NavSection = {
  label: string;
  staffOnly?: boolean;
  adminOnly?: boolean;
  items: NavItem[];
};

// Resequenced: Overview (Dashboard, Board) then Tickets (My Tickets, Raise Ticket).
const NAV_SECTIONS: NavSection[] = [
  {
    label: "Overview",
    staffOnly: true,
    items: [
      { href: "/dashboard", label: "Dashboard", icon: LayoutDashboard, staffOnly: true },
      { href: "/tickets", label: "All Tickets", icon: ListChecks, staffOnly: true },
      { href: "/board", label: "Board", icon: KanbanSquare, staffOnly: true },
    ],
  },
  {
    label: "Tickets",
    items: [
      { href: "/my", label: "My Tickets", icon: Inbox, badge: "myActive" },
      { href: "/new", label: "Raise Ticket", icon: PlusCircle },
    ],
  },
  {
    label: "Administration",
    adminOnly: true,
    items: [
      { href: "/settings/users", label: "Users", icon: Users, adminOnly: true },
      {
        href: "/settings/recycle-bin",
        label: "Recycle Bin",
        icon: Trash2,
        adminOnly: true,
      },
    ],
  },
];

const ROLE_LABELS: Record<Role, string> = {
  USER: "Employee",
  MIS_STAFF: "MIS Staff",
  MIS_ADMIN: "MIS Admin",
};

function sectionsFor(role: Role) {
  const isStaff = role !== "USER";
  const isAdmin = role === "MIS_ADMIN";
  const allow = (x: { staffOnly?: boolean; adminOnly?: boolean }) =>
    (!x.staffOnly || isStaff) && (!x.adminOnly || isAdmin);
  return NAV_SECTIONS.filter(allow).map((s) => ({
    ...s,
    items: s.items.filter(allow).map((item) =>
      // Staff don't raise tickets from here — /my is their assigned work queue,
      // so "My Tickets" is misleading; show "Assigned to Me" for staff/admins.
      item.href === "/my" && isStaff
        ? { ...item, label: "Assigned to Me" }
        : item
    ),
  }));
}

export function AppShell({
  user,
  notifications,
  unreadCount,
  myActiveCount = 0,
  children,
}: {
  user: SessionUser;
  notifications: BellNotification[];
  unreadCount: number;
  myActiveCount?: number;
  children: React.ReactNode;
}) {
  const pathname = usePathname();
  const [mobileOpen, setMobileOpen] = useState(false);
  const sections = sectionsFor(user.role);

  const isActive = (href: string) =>
    pathname === href || pathname.startsWith(`${href}/`);

  const badgeValue = (item: NavItem) =>
    item.badge === "myActive" && myActiveCount > 0 ? myActiveCount : null;

  function NavLink({
    item,
    onNavigate,
    dense,
  }: {
    item: NavItem;
    onNavigate?: () => void;
    dense?: boolean;
  }) {
    const active = isActive(item.href);
    const badge = badgeValue(item);
    return (
      <Link
        href={item.href}
        title={item.label}
        onClick={onNavigate}
        className={cn(
          "group flex items-center gap-3 rounded-[var(--radius-input)] px-3 py-2 text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
          dense && "justify-center lg:justify-start",
          active
            ? "bg-accent-soft text-primary"
            : "text-text-muted hover:bg-surface-muted hover:text-foreground"
        )}
      >
        <item.icon className="size-[18px] shrink-0" />
        <span className={cn("truncate", dense && "hidden lg:inline")}>
          {item.label}
        </span>
        {badge !== null ? (
          <span
            className={cn(
              "ml-auto shrink-0 rounded-full px-1.5 py-px text-[11px] font-semibold tabular-nums",
              dense && "hidden lg:inline-block",
              active
                ? "bg-primary/15 text-primary"
                : "bg-surface-muted text-text-muted"
            )}
          >
            {badge}
          </span>
        ) : null}
      </Link>
    );
  }

  const brand = (
    <div className="flex items-center gap-2.5">
      <div className="grid size-8 shrink-0 place-items-center rounded-[10px] bg-primary text-primary-foreground shadow-[var(--shadow-elevation)]">
        <Ticket className="size-[18px]" />
      </div>
      <span className="font-display text-[15px] font-semibold tracking-tight">
        MIS Support Hub
      </span>
    </div>
  );

  const userCard = (
    <div className="flex items-center gap-2.5 rounded-[var(--radius-input)] border border-border bg-surface-muted/60 p-2">
      <UserAvatar
        name={user.name}
        email={user.email}
        image={user.image}
        className="size-8"
      />
      <div className="min-w-0">
        <div className="truncate text-sm font-medium">
          {user.name ?? "Unknown user"}
        </div>
        <div className="truncate text-xs text-text-muted">
          {ROLE_LABELS[user.role]}
        </div>
      </div>
    </div>
  );

  return (
    <div className="min-h-screen bg-background">
      {/* Desktop sidebar — fixed to the viewport so it never scrolls; full (≥ lg)
          collapsing to an icon rail (md..lg). Content is offset by its width. */}
      <aside className="fixed inset-y-0 left-0 z-30 hidden w-[68px] flex-col border-r border-border bg-surface md:flex lg:w-64">
        <div className="flex h-16 items-center justify-center border-b border-border px-0 lg:justify-start lg:px-4">
          <span className="hidden lg:block">{brand}</span>
          <div className="grid size-8 place-items-center rounded-[10px] bg-primary text-primary-foreground lg:hidden">
            <Ticket className="size-[18px]" />
          </div>
        </div>

        <nav className="flex-1 space-y-5 overflow-y-auto px-3 py-4">
          {sections.map((section) => (
            <div key={section.label} className="space-y-1">
              <div className="hidden px-3 pb-1 text-[11px] font-semibold uppercase tracking-wider text-text-muted lg:block">
                {section.label}
              </div>
              {section.items.map((item) => (
                <NavLink key={item.href} item={item} dense />
              ))}
            </div>
          ))}
        </nav>

        <div className="hidden border-t border-border p-3 lg:block">{userCard}</div>
      </aside>

      <div className="flex min-h-screen min-w-0 flex-col md:pl-[68px] lg:pl-64">
        {/* Topbar */}
        <header className="sticky top-0 z-20 flex h-16 items-center gap-3 border-b border-border bg-surface/80 px-4 backdrop-blur-md">
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
              <div className="flex h-16 items-center border-b border-border px-4">
                {brand}
              </div>
              <nav className="space-y-5 p-3">
                {sections.map((section) => (
                  <div key={section.label} className="space-y-1">
                    <div className="px-3 pb-1 text-[11px] font-semibold uppercase tracking-wider text-text-muted">
                      {section.label}
                    </div>
                    {section.items.map((item) => (
                      <NavLink
                        key={item.href}
                        item={item}
                        onNavigate={() => setMobileOpen(false)}
                      />
                    ))}
                  </div>
                ))}
              </nav>
              <div className="border-t border-border p-3">{userCard}</div>
            </SheetContent>
          </Sheet>

          {/* Search */}
          <div className="relative hidden max-w-md flex-1 sm:block">
            <Search className="pointer-events-none absolute left-3.5 top-1/2 size-4 -translate-y-1/2 text-text-muted" />
            <Input
              type="search"
              placeholder="Search tickets…"
              className="h-10 rounded-full border-transparent bg-surface-muted pl-10 pr-16 focus-visible:bg-surface"
              disabled
              aria-label="Search (coming soon)"
            />
            <kbd className="pointer-events-none absolute right-3 top-1/2 hidden -translate-y-1/2 items-center gap-0.5 rounded-md border border-border bg-surface px-1.5 py-0.5 font-mono text-[10px] text-text-muted md:flex">
              ⌘K
            </kbd>
          </div>

          <div className="ml-auto flex items-center gap-1">
            <NotificationBell
              notifications={notifications}
              unreadCount={unreadCount}
            />
            <ThemeToggle />
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <button
                  className="ml-1 flex items-center rounded-full outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background"
                  aria-label="Account menu"
                >
                  <UserAvatar
                    name={user.name}
                    email={user.email}
                    image={user.image}
                    className="size-8"
                  />
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
                <DropdownMenuItem asChild>
                  <Link href="/profile">
                    <UserIcon className="size-4" /> Profile
                  </Link>
                </DropdownMenuItem>
                {user.role === "MIS_ADMIN" ? (
                  <DropdownMenuItem asChild>
                    <Link href="/settings/users">
                      <Settings className="size-4" /> Settings
                    </Link>
                  </DropdownMenuItem>
                ) : (
                  <DropdownMenuItem disabled>
                    <Settings className="size-4" /> Settings
                  </DropdownMenuItem>
                )}
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

        <main className="flex-1 p-4 sm:p-6 lg:p-8">{children}</main>
      </div>
    </div>
  );
}
