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
  staffOnly?: boolean;
  adminOnly?: boolean;
  badge?: "myActive";
};

type NavSection = {
  id: string;
  /**
   * Optional BY DESIGN. A header costs a text row + a gap, so it must earn that space
   * by disambiguating something. Only the two pipelines do; a lone link is its own
   * label, and "Directory → Systems" just says Systems twice. Unlabeled groups render
   * as a bare run of links, separated by a rule instead of a word.
   */
  label?: string;
  staffOnly?: boolean;
  adminOnly?: boolean;
  items: NavItem[];
};

/**
 * The two pipelines get their OWN sections (§5 issues, §12 requests). They used to
 * share a "Tickets" section while the issue-only surfaces sat under a generic
 * "Overview" ("All Tickets", "Board"), which made it impossible to tell at a glance
 * which menu belonged to which pipeline. Each section now names its pipeline and the
 * issue-only entries say "issue" outright.
 *
 * The two pipeline sections are deliberately UNGATED at the section level, with each
 * item carrying its own flag: `sectionsFor` filters sections BEFORE items, so a
 * staff-only section would hide its employee-facing entries entirely.
 */
const NAV_SECTIONS: NavSection[] = [
  {
    // The dashboard reports on BOTH pipelines (its own Issues/Requests toggle), so
    // it stays above the split rather than living in either section. Unlabeled: an
    // "Overview" header over one self-explanatory link is pure chrome.
    id: "overview",
    staffOnly: true,
    items: [
      { href: "/dashboard", label: "Dashboard", icon: LayoutDashboard, staffOnly: true },
    ],
  },
  {
    id: "issues",
    label: "Issues",
    items: [
      { href: "/tickets", label: "All Issues", icon: ListChecks, staffOnly: true },
      { href: "/board", label: "Issue Board", icon: KanbanSquare, staffOnly: true },
      { href: "/new", label: "Report an issue", icon: PlusCircle },
    ],
  },
  {
    // REQUEST surfaces (§12.7) — visible to everyone; a USER sees only their own.
    // /requests/new now has its own entry so "New request" mirrors "Report an issue";
    // longest-prefix matching keeps it distinct from its /requests parent.
    id: "requests",
    label: "System Requests",
    items: [
      { href: "/requests", label: "All Requests", icon: Sparkles },
      { href: "/requests/board", label: "Request Board", icon: KanbanSquare },
      { href: "/requests/new", label: "New Request", icon: PlusCircle },
    ],
  },
  {
    // Personal work queue — deliberately OUTSIDE both pipelines, after them.
    //
    // Not just layout: for staff, /my renders MyWorkView with BOTH their assigned
    // issues AND the requests they're building (§12.3), and the page says so —
    // "Your work — issue tickets and the system requests you're building". Nesting it
    // under Issues claimed it was an issue surface, which for its main audience is
    // simply false. It answers "what's on my plate", a question that cuts across both
    // pipelines, so it sits on its own between them and the tail group.
    //
    // (For a USER the page IS issue-only — listMyTickets filters type = 'ISSUE' — but
    // their requests are one link up under "My Requests", so nothing is stranded.)
    id: "mine",
    items: [{ href: "/my", label: "My Tickets", icon: Inbox, badge: "myActive" }],
  },
  {
    // The two former singleton sections, "Directory" and "Administration", merged into
    // one unlabeled tail group — neither header disambiguated anything its own link
    // didn't already say.
    //
    // The GROUP stays ungated while Settings carries adminOnly ITSELF, and that split
    // is load-bearing: §13.3's systems directory is company-wide readable (the first
    // authenticated read-all surface, a deliberate departure from §6's row-scoping),
    // and `sectionsFor` filters sections BEFORE items — so an adminOnly group would
    // hide Systems from every USER no matter how the item is flagged.
    // /systems/new and /systems/[code] highlight this parent via longest-prefix match.
    // Users / Bulk Delete / Recycle Bin live inside the Settings screen, not here.
    id: "more",
    items: [
      { href: "/systems", label: "Systems", icon: Library },
      { href: "/settings", label: "Settings", icon: Settings, adminOnly: true },
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
  return NAV_SECTIONS.filter(allow)
    .map((s) => ({
      ...s,
      items: s.items.filter(allow).map((item) => {
        // Staff don't raise tickets from here — /my is their assigned work queue,
        // so "My Tickets" is misleading; show "Assigned to Me" for staff/admins.
        if (item.href === "/my" && isStaff) {
          return { ...item, label: "Assigned to Me" };
        }
        // A USER only ever sees requests they raised (§12.7 row-level visibility), so
        // "All Requests" would overpromise — matches the page's own title swap.
        if (item.href === "/requests" && !isStaff) {
          return { ...item, label: "My Requests" };
        }
        return item;
      }),
    }))
    // Now that groups are ungated so their items can carry their own flags, a group
    // can end up empty for a given role. Drop those — an empty group would still
    // render its header or divider, i.e. a label for nothing.
    .filter((s) => s.items.length > 0);
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

  // Only the MOST specific matching nav item lights up. A plain prefix test would
  // mark both "Requests" (/requests) and "Request a system" (/requests/new) active
  // on /requests/new; taking the longest match keeps nested routes unambiguous
  // while still highlighting a parent for its children (/tickets/MIS-001 → /tickets).
  const activeHref = useMemo(() => {
    const matches = NAV_SECTIONS.flatMap((s) => s.items)
      .map((i) => i.href)
      .filter((h) => pathname === h || pathname.startsWith(`${h}/`));
    return matches.sort((a, b) => b.length - a.length)[0] ?? null;
  }, [pathname]);

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
