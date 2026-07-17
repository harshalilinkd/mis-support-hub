"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { CheckCircle2, Library } from "lucide-react";

import type { RequestDetail } from "@/lib/db/queries";
import type { SessionUser } from "@/lib/session";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  SystemForm,
  type GranteeOption,
  type OwnerOption,
} from "@/components/systems/system-form";

/**
 * §13.5 — log the built system into the directory, off the back of a REQUEST.
 *
 * A SOFT prompt, deliberately: it never gates the request lifecycle. The requester's
 * accept/close (§12.4) is untouched, and "not logged" is a visible flag, never a block.
 *
 * The dialog lives ONLY here, on the detail. The board refuses the drag and routes
 * people here rather than growing a second copy — one source of truth for a flow that
 * carries a mandatory compliance checklist.
 *
 * owners/grantees are fetched by the server page and passed in, so this needs no
 * client round-trip and no loading state.
 */
export function RequestLogSystem({
  request,
  currentUser,
  canBuild,
  owners,
  grantees,
  /** Set right after markComplete succeeds, to open the prompt without a second click. */
  autoOpen = false,
  onAutoOpenHandled,
}: {
  request: RequestDetail;
  currentUser: SessionUser;
  canBuild: boolean;
  owners: OwnerOption[] | null;
  /** null = this host didn't supply the checklist (route to the full detail instead). */
  grantees: GranteeOption[] | null;
  autoOpen?: boolean;
  onAutoOpenHandled?: () => void;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);

  useEffect(() => {
    if (!autoOpen) return;
    setOpen(true);
    onAutoOpenHandled?.();
  }, [autoOpen, onAutoOpenHandled]);

  // Already logged → the ✓ side of §13.5's flag, shown to everyone who can see the
  // request (the directory is company-wide readable anyway, §13.3).
  if (request.systemCode) {
    return (
      <div className="flex flex-wrap items-center gap-2 rounded-[var(--radius-input)] border border-border bg-surface-muted/50 px-3 py-2 text-sm">
        <CheckCircle2 className="size-4 shrink-0 text-primary" />
        <span className="text-foreground">System logged</span>
        <Link
          href={`/systems/${request.systemCode}`}
          className="rounded-sm font-mono text-xs text-primary hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          {request.systemCode}
        </Link>
      </div>
    );
  }

  // Nothing exists to log before the build is finished.
  const finished =
    request.status === "IN_TESTING" ||
    request.status === "CLOSED" ||
    request.status === "CHANGES_REQUESTED";
  if (!finished) return null;

  if (!canBuild) {
    // The requester should see the trail is incomplete, but can't fix it (§13.3).
    return (
      <div className="rounded-[var(--radius-input)] border border-border bg-surface-muted/50 px-3 py-2 text-sm text-text-muted">
        This build isn&apos;t in the systems directory yet.
      </div>
    );
  }

  const notLogged = (
    <span className="inline-flex items-center gap-2 text-sm">
      <Library className="size-4 shrink-0 text-text-muted" />
      <span className="text-foreground">Not logged in the systems directory</span>
    </span>
  );

  // Hosted somewhere without the form's data (the request sheet is a preview, not
  // the detail page) — flag it and route to the one place the dialog lives, rather
  // than opening a form that would wrongly report "no grantees configured".
  // null = not supplied; [] = genuinely none configured. Never conflate them.
  if (!owners || !grantees) {
    return (
      <div className="flex flex-wrap items-center gap-3 rounded-[var(--radius-input)] border border-border bg-surface-muted/50 p-2.5">
        {notLogged}
        <Button asChild size="sm" variant="outline" className="ml-auto">
          <Link href={`/tickets/${request.number}`}>Open to log it</Link>
        </Button>
      </div>
    );
  }

  /**
   * §13.5 pre-fills owner = assignee, but the picker is fed by listAssignableUsers()
   * — ACTIVE MIS_STAFF/MIS_ADMIN only. Those sets legitimately diverge: deactivating
   * a member releases their ISSUE tickets but deliberately NOT their requests
   * (queries.ts — "requests have their own claim/assignment model"), so a request can
   * still be assigned to someone since deactivated or demoted.
   *
   * The pre-filled id would then match no option, and Radix renders the trigger BLANK
   * while the form still holds a valid uuid — the field looks unset, submits anyway,
   * and nobody sees who they just made the owner. The assignee IS the right owner
   * (they built it), so add them to the list rather than drop the default: the value
   * becomes visible and changeable instead of silent.
   */
  const ownersWithAssignee: OwnerOption[] =
    request.assignedToId && !owners.some((o) => o.id === request.assignedToId)
      ? [...owners, { id: request.assignedToId, name: request.assignedToName }]
      : owners;

  return (
    <>
      <div className="flex flex-wrap items-center gap-3 rounded-[var(--radius-input)] border border-border bg-surface-muted/50 p-2.5">
        {notLogged}
        <Button size="sm" className="ml-auto" onClick={() => setOpen(true)}>
          Log the built system
        </Button>
      </div>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-h-[85vh] overflow-y-auto sm:max-w-2xl">
          <DialogHeader>
            <DialogTitle>Log the system built for {request.number}</DialogTitle>
          </DialogHeader>
          <SystemForm
            owners={ownersWithAssignee}
            grantees={grantees}
            currentUser={currentUser}
            embedded
            // Pre-filled from the request (§13.5).
            linkedTicketId={request.id}
            defaultName={request.systemName}
            defaultDepartment={request.department}
            defaultOwnerId={request.assignedToId ?? undefined}
            onCancel={() => setOpen(false)}
            onDone={() => {
              setOpen(false);
              // Stay on the request — logging is a side errand, not a departure.
              router.refresh();
            }}
          />
        </DialogContent>
      </Dialog>
    </>
  );
}
