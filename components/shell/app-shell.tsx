"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  Inbox,
  KanbanSquare,
  LayoutDashboard,
  Library,
  ListChecks,
  LogOut,
  Menu,
  PlusCircle,
  Search,
  Settings,
  Sparkles,
  Ticket,
  User as UserIcon,
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
  badge?: "myActive";
};

type NavSection = {
  id: string;
  /**
   * Optional BY DESIGN. A header costs a text row + a gap, so it must earn that space
   * by disambiguating something. Only the two staff pipelines do; a lone link is its
   * own label. Unlabeled groups render as a bare run of links split by a rule.
   */
  label?: string;
  items: NavItem[];
};

/**
 * The sidebar is built PER ROLE — not one list filtered by flags — because the two
 * audiences want genuinely different SHAPES, not the same menu with rows hidden.
 * (The flag approach also couldn't reorder: an employee needs "My Tickets" at the
 * TOP, staff need it in the middle. Construction handles order and labels directly.)
 *
 * EMPLOYEE — they never triage: no dashboard, no all-lists, no boards. Their whole job
 * is "see what I raised" and "raise something", and the ONE thing that confused them
 * was telling a broken-system report apart from a new-system request. So the nav is
 * exactly those jobs, nothing else:
 *   1. My Tickets (/my) — one home showing BOTH their issues and requests, via
 *      MyWorkView's Issues | System Requests sub-tabs. (This is why the old "My
 *      Requests" and "Request Board" links are gone for employees: redundant with the
 *      sub-tab, and a kanban board of your own two requests is noise.)
 *   2. The two RAISE actions, kept deliberately distinct so the confusion can't recur —
 *      "Report an issue" (something's broken) vs "Request a system" (build a new one).
 *   3. Systems — the company-wide directory (§13.3).
 *
 * MIS STAFF / ADMIN — the pipeline-grouped triage nav: Dashboard over both pipelines,
 * then Issues and System Requests named outright, then "Assigned to Me" (their
 * cross-pipeline work queue — assigned issues AND requests they're building, §12.3),
 * then Systems + admin Settings.
 */
function navSectionsFor(role: Role): NavSection[] {
  if (role === "USER") {
    return [
      {
        id: "home",
        items: [{ href: "/my", label: "My Tickets", icon: Inbox, badge: "myActive" }],
      },
      {
        id: "raise",
        items: [
          { href: "/new", label: "Report an issue", icon: PlusCircle },
          { href: "/requests/new", label: "Request a system", icon: Sparkles },
        ],
      },
      {
        id: "directory",
        items: [{ href: "/systems", label: "Systems", icon: Library }],
      },
    ];
  }

  const isAdmin = role === "MIS_ADMIN";
  return [
    {
      id: "overview",
      items: [{ href: "/dashboard", label: "Dashboard", icon: LayoutDashboard }],
    },
    {
      id: "issues",
      label: "Issues",
      items: [
        { href: "/tickets", label: "All Issues", icon: ListChecks },
        { href: "/board", label: "Issue Board", icon: KanbanSquare },
        { href: "/new", label: "Report an issue", icon: PlusCircle },
      ],
    },
    {
      id: "requests",
      label: "System Requests",
      items: [
        { href: "/requests", label: "All Requests", icon: Sparkles },
        { href: "/requests/board", label: "Request Board", icon: KanbanSquare },
        { href: "/requests/new", label: "New Request", icon: PlusCircle },
      ],
    },
    {
      id: "mine",
      items: [{ href: "/my", label: "Assigned to Me", icon: Inbox, badge: "myActive" }],
    },
    {
      // Systems (company-wide, §13.3) + admin Settings — unlabeled tail. /systems/new
      // and /systems/[code] highlight this parent via longest-prefix match.
      id: "more",
      items: [
        { href: "/systems", label: "Systems", icon: Library },
        ...(isAdmin
          ? [{ href: "/settings", label: "Settings", icon: Settings } as NavItem]
          : []),
      ],
    },
  ];
}

const ROLE_LABELS: Record<Role, string> = {
  USER: "Employee",
  MIS_STAFF: "MIS Staff",
  MIS_ADMIN: "MIS Admin",
};

function sectionsFor(role: Role) {
  // Per-role construction already yields the right items in the right order; the
  // filter is a safety net so a group that is somehow empty never renders a bare
  // header or divider over nothing.
  return navSectionsFor(role).filter((s) => s.items.length > 0);
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
  const sections = useMemo(() => sectionsFor(user.role), [user.role]);

  // Only the MOST specific matching nav item lights up. A plain prefix test would
  // mark both "Requests" (/requests) and "Request a system" (/requests/new) active
  // on /requests/new; taking the longest match keeps nested routes unambiguous
  // while still highlighting a parent for its children (/tickets/MIS-001 → /tickets).
  const activeHref = useMemo(() => {
    const matches = sections
      .flatMap((s) => s.items)
      .map((i) => i.href)
      .filter((h) => pathname === h || pathname.startsWith(`${h}/`));
    return matches.sort((a, b) => b.length - a.length)[0] ?? null;
  }, [pathname, sections]);

  const isActive = (href: string) => href === activeHref;

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
          "group flex items-center gap-2.5 rounded-[var(--radius-input)] px-3 py-1.5 text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
          dense && "justify-center lg:justify-start",
          active
            ? "bg-accent-soft text-primary"
            : "text-foreground hover:bg-surface-muted"
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

        <nav className="flex-1 space-y-3 overflow-y-auto px-3 py-3">
          {sections.map((section, i) => (
            <div key={section.id} className="space-y-0.5">
              {section.label ? (
                <div className="hidden px-3 pb-0.5 pt-1 text-[11px] font-semibold uppercase tracking-wider text-text-muted lg:block">
                  {section.label}
                </div>
              ) : i > 0 ? (
                // An unlabeled tail group still needs to read as separate — a hairline
                // does that in 1px where a header costs a whole text row.
                <div className="mx-3 mb-2 border-t border-border" />
              ) : null}
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
              <nav className="space-y-3 p-3">
                {sections.map((section, i) => (
                  <div key={section.id} className="space-y-0.5">
                    {section.label ? (
                      <div className="px-3 pb-0.5 pt-1 text-[11px] font-semibold uppercase tracking-wider text-text-muted">
                        {section.label}
                      </div>
                    ) : i > 0 ? (
                      <div className="mx-3 mb-2 border-t border-border" />
                    ) : null}
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
                    <Link href="/settings">
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
