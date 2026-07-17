import Link from "next/link";
import { CheckCircle2 } from "lucide-react";

import { AbsoluteTime } from "@/components/absolute-time";
import { UserAvatar } from "@/components/user-avatar";
import type { AssignableUser, SystemDetail as SystemDetailRow } from "@/lib/db/queries";
import type { SessionUser } from "@/lib/session";
import { isStaff } from "@/lib/roles";
import { cn } from "@/lib/utils";
import { DEPARTMENT_LABELS } from "@/lib/validators/ticket";
import { SystemActions } from "./system-actions";
import { SystemLink } from "./system-link";
import { SystemStatusChip, SystemTypeChip } from "./system-chips";

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section>
      <h2 className="mb-1.5 text-xs font-semibold uppercase tracking-wider text-text-muted">
        {title}
      </h2>
      {children}
    </section>
  );
}

/**
 * System detail (§13). Routed on `code` so the URL is a shareable handle
 * (/systems/SYS-001) rather than a uuid.
 *
 * A DEPRECATED or ARCHIVED system gets a clearly retired treatment: a banner saying
 * so, and the body dimmed. It stays fully readable — the whole point of keeping a
 * retired entry is that someone can still find where the thing lived.
 */
export function SystemDetailView({
  system,
  owners,
  currentUser,
}: {
  system: SystemDetailRow;
  owners: AssignableUser[];
  currentUser: SessionUser;
}) {
  const canWrite = isStaff(currentUser.role);
  const retired = system.status === "ARCHIVED" || system.status === "DEPRECATED";

  return (
    <div className="space-y-4">
      {retired ? (
        <div className="rounded-[var(--radius-input)] border border-border bg-surface-muted px-3 py-2 text-sm text-text-muted">
          <span className="font-medium text-foreground">
            {system.status === "ARCHIVED" ? "Archived" : "Deprecated"}
          </span>{" "}
          — this system is retired and kept for reference. Check with{" "}
          {system.ownerName ?? "the owner"} before relying on it.
        </div>
      ) : null}

      <div
        className={cn(
          "space-y-5 rounded-[var(--radius-card)] border border-border bg-surface p-4 shadow-[var(--shadow-elevation)] sm:p-5",
          retired && "opacity-75"
        )}
      >
        <div className="flex flex-wrap items-center gap-2">
          <span className="font-mono text-xs font-semibold text-text-muted">
            {system.code}
          </span>
          <SystemTypeChip type={system.systemType} />
          <SystemStatusChip status={system.status} />
        </div>
        <h1 className="font-display text-xl font-semibold tracking-tight">{system.name}</h1>

        <div className="grid gap-4 sm:grid-cols-2">
          <Section title="Department">
            <p className="text-sm text-foreground">{DEPARTMENT_LABELS[system.department]}</p>
          </Section>
          <Section title="Owner">
            <div className="flex items-center gap-2">
              <UserAvatar name={system.ownerName} image={system.ownerImage} />
              <span className="text-sm text-foreground">{system.ownerName ?? "—"}</span>
            </div>
          </Section>
          <Section title="Frontend">
            <SystemLink url={system.frontendUrl} label="Frontend link" />
          </Section>
          <Section title="Backend">
            <SystemLink url={system.backendUrl} label="Backend link" />
          </Section>
          {system.linkedTicketNumber ? (
            <Section title="Built for">
              <Link
                href={`/tickets/${system.linkedTicketNumber}`}
                className="text-sm text-primary hover:underline"
              >
                <span className="font-mono text-xs">{system.linkedTicketNumber}</span>
                {system.linkedTicketTitle ? ` · ${system.linkedTicketTitle}` : ""}
              </Link>
            </Section>
          ) : null}
          <Section title="Logged by">
            <p className="text-sm text-foreground">
              {system.loggedByName ?? "—"}{" "}
              <span className="text-text-muted">
                on <AbsoluteTime date={system.createdAt} dateOnly />
              </span>
            </p>
          </Section>
        </div>

        {system.notes ? (
          <Section title="Notes">
            <p className="whitespace-pre-wrap break-words text-sm text-foreground">
              {system.notes}
            </p>
          </Section>
        ) : null}

        {/* The compliance trail (§13.4) — who attested, and when. Self-attested: it
            records a human's word, it does not verify Google sharing. */}
        <Section title="Access sharing">
          <ul className="space-y-1.5">
            {system.confirmations.map((c) => (
              <li key={c.id} className="flex items-start gap-2 text-sm">
                <CheckCircle2
                  className={cn(
                    "mt-0.5 size-4 shrink-0",
                    c.confirmed ? "text-primary" : "text-text-muted"
                  )}
                />
                <span className="text-foreground">
                  <span className="font-medium">{c.granteeLabel}</span>{" "}
                  <span className="text-text-muted">
                    — confirmed by {c.confirmedByName ?? "—"} on{" "}
                    <AbsoluteTime date={c.confirmedAt} dateOnly />
                  </span>
                </span>
              </li>
            ))}
          </ul>
          <p className="mt-2 text-xs text-text-muted">
            Self-confirmed by the person who logged this system — it records their
            attestation, not a check against Google.
          </p>
        </Section>

        <Section title="Last updated">
          <AbsoluteTime
            date={system.updatedAt}
            className="font-mono text-xs tabular-nums text-foreground"
          />
        </Section>
      </div>

      {canWrite ? <SystemActions system={system} owners={owners} /> : null}
    </div>
  );
}
