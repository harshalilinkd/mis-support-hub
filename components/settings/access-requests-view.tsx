"use client";

import { useState, useTransition } from "react";
import { Check, Inbox, X } from "lucide-react";
import { toast } from "sonner";

import {
  approveAccessRequest,
  rejectAccessRequestAction,
} from "@/lib/actions/access-requests";
import type { AccessRequestRow } from "@/lib/db/queries";
import { cn } from "@/lib/utils";
import { AbsoluteTime } from "@/components/absolute-time";
import { EmptyState } from "@/components/shell/empty-state";
import { Button } from "@/components/ui/button";
import { UserAvatar } from "@/components/user-avatar";

/**
 * Google access requests (§7) — MIS_ADMIN only, gated at the page. Pending requests
 * are actionable (Approve → creates the account as an Employee; Reject → sticky). The
 * decided history stays visible as the accountability trail (who, when).
 */
export function AccessRequestsView({
  requests,
}: {
  requests: AccessRequestRow[];
}) {
  const [pending, startTransition] = useTransition();
  // Track the row being acted on so only its buttons show the busy state.
  const [busyId, setBusyId] = useState<string | null>(null);

  const waiting = requests.filter((r) => r.status === "PENDING");
  const decided = requests.filter((r) => r.status !== "PENDING");

  const run = (
    id: string,
    fn: (id: string) => Promise<{ ok: boolean; error?: string }>,
    okMsg: string
  ) => {
    setBusyId(id);
    startTransition(async () => {
      const res = await fn(id);
      setBusyId(null);
      if (!res.ok) {
        toast.error(res.error ?? "Something went wrong.");
        return;
      }
      toast.success(okMsg);
    });
  };

  return (
    <div className="space-y-6">
      <section className="space-y-3">
        <h2 className="text-sm font-semibold">
          Pending{" "}
          <span className="ml-1 rounded-full bg-accent-soft px-1.5 py-px text-xs font-semibold tabular-nums text-primary">
            {waiting.length}
          </span>
        </h2>

        {waiting.length === 0 ? (
          <EmptyState
            icon={<Inbox className="size-5" />}
            title="No pending requests"
            description="When someone new signs in with Google, their request to join shows up here for you to approve."
          />
        ) : (
          <ul className="divide-y divide-border overflow-hidden rounded-[var(--radius-card)] border border-border bg-surface shadow-[var(--shadow-elevation)]">
            {waiting.map((r) => {
              const busy = pending && busyId === r.id;
              return (
                <li key={r.id} className="flex items-center gap-3 px-4 py-3">
                  <UserAvatar
                    name={r.name}
                    email={r.email}
                    image={r.image}
                    className="size-9"
                  />
                  <div className="min-w-0 flex-1">
                    <div className="truncate text-sm font-medium">
                      {r.name ?? r.email}
                    </div>
                    <div className="truncate text-xs text-text-muted">{r.email}</div>
                  </div>
                  <AbsoluteTime
                    date={r.requestedAt}
                    dateOnly
                    className="hidden shrink-0 font-mono text-xs text-text-muted sm:block"
                  />
                  <div className="flex shrink-0 items-center gap-2">
                    <Button
                      size="sm"
                      variant="outline"
                      disabled={busy}
                      onClick={() =>
                        run(r.id, rejectAccessRequestAction, `${r.email} rejected`)
                      }
                    >
                      <X className="size-4" /> Reject
                    </Button>
                    <Button
                      size="sm"
                      disabled={busy}
                      onClick={() =>
                        run(
                          r.id,
                          approveAccessRequest,
                          `${r.email} approved — added as an Employee`
                        )
                      }
                    >
                      <Check className="size-4" /> Approve
                    </Button>
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </section>

      {decided.length > 0 ? (
        <section className="space-y-3">
          <h2 className="text-sm font-semibold text-text-muted">Decided</h2>
          <ul className="divide-y divide-border overflow-hidden rounded-[var(--radius-card)] border border-border bg-surface shadow-[var(--shadow-elevation)]">
            {decided.map((r) => (
              <li key={r.id} className="flex items-center gap-3 px-4 py-2.5 opacity-80">
                <UserAvatar
                  name={r.name}
                  email={r.email}
                  image={r.image}
                  className="size-8"
                />
                <div className="min-w-0 flex-1">
                  <div className="truncate text-sm font-medium">
                    {r.name ?? r.email}
                  </div>
                  <div className="truncate text-xs text-text-muted">{r.email}</div>
                </div>
                <span
                  className={cn(
                    "shrink-0 rounded-full px-2 py-0.5 text-xs font-semibold",
                    r.status === "APPROVED"
                      ? "bg-[var(--priority-low)]/15 text-[var(--priority-low)]"
                      : "bg-surface-muted text-text-muted"
                  )}
                >
                  {r.status === "APPROVED" ? "Approved" : "Rejected"}
                </span>
                <div className="hidden shrink-0 text-right text-xs text-text-muted sm:block">
                  {r.decidedByName ? `by ${r.decidedByName}` : null}
                  {r.decidedAt ? (
                    <AbsoluteTime
                      date={r.decidedAt}
                      dateOnly
                      className="ml-1 font-mono"
                    />
                  ) : null}
                </div>
              </li>
            ))}
          </ul>
        </section>
      ) : null}
    </div>
  );
}
