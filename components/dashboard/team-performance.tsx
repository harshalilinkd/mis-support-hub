import { Users } from "lucide-react";

import type { AssigneePerf } from "@/lib/db/analytics";
import type { TicketType } from "@/lib/db/schema";
import { UserAvatar } from "@/components/user-avatar";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

/** Hours → a compact "5.9d" / "3.2h" / "—" label. */
function fmtDuration(hours: number, hasCompleted: boolean): string {
  if (!hasCompleted || hours <= 0) return "—";
  return hours >= 24 ? `${(hours / 24).toFixed(1)}d` : `${hours.toFixed(1)}h`;
}

/**
 * Per-member performance report (§10 — a detail report beside the six charts). One row
 * per MIS member with something assigned to them, for the current pipeline (issues or
 * requests): how many they've claimed, how many are in progress, how many completed,
 * and their average completion time. Server-rendered — no interactivity needed.
 */
export function TeamPerformance({
  rows,
  type,
}: {
  rows: AssigneePerf[];
  type: TicketType;
}) {
  const avgLabel = type === "REQUEST" ? "Avg build time" : "Avg resolution";
  const completedLabel = type === "REQUEST" ? "Delivered" : "Completed";

  return (
    <section className="rounded-[var(--radius-card)] border border-border bg-surface p-5 shadow-[var(--shadow-elevation)]">
      <div className="mb-3 flex items-center gap-2">
        <div className="grid size-7 place-items-center rounded-[var(--radius-input)] bg-accent-soft text-primary">
          <Users className="size-4" />
        </div>
        <div>
          <h2 className="font-display text-sm font-semibold text-foreground">Team performance</h2>
          <p className="text-xs text-foreground/70">
            {type === "REQUEST"
              ? "System requests each MIS member is building or has delivered."
              : "Issues each MIS member has claimed and worked."}
          </p>
        </div>
      </div>

      {rows.length === 0 ? (
        <p className="rounded-[var(--radius-input)] border border-border bg-surface-muted/50 px-3 py-6 text-center text-sm text-text-muted">
          Nothing assigned to anyone in this view yet.
        </p>
      ) : (
        <>
        {/* Phone: one card per member. A six-column report inside a horizontal
            scroller is unreadable on a 375px screen — you lose the member's name
            (the row's subject) the moment you scroll to the numbers. The card keeps
            the name fixed and lays the five figures out as a labelled grid. */}
        <ul className="space-y-2 md:hidden">
          {rows.map((r) => (
            <li
              key={r.id}
              className="rounded-[var(--radius-input)] border border-border bg-surface p-3"
            >
              <div className="flex items-center gap-2">
                <UserAvatar name={r.name} image={r.image} />
                <span className="truncate text-sm font-medium">{r.name ?? "—"}</span>
              </div>
              <dl className="mt-3 grid grid-cols-3 gap-x-3 gap-y-2 text-center">
                <Stat label="Claimed" value={r.claimed} />
                <Stat label="Not started" value={r.notStarted} />
                <Stat label="In progress" value={r.inProgress} />
                <Stat label={completedLabel} value={r.completed} />
                <div className="col-span-2">
                  <dt className="text-[11px] uppercase tracking-wider text-text-muted">
                    {avgLabel}
                  </dt>
                  <dd className="mt-0.5 font-mono text-sm tabular-nums">
                    {fmtDuration(r.avgHours, r.completed > 0)}
                  </dd>
                </div>
              </dl>
            </li>
          ))}
        </ul>

        <div className="hidden overflow-x-auto md:block">
          <Table>
            <TableHeader className="[&_th]:h-9 [&_th]:text-xs [&_th]:font-semibold [&_th]:uppercase [&_th]:tracking-wider [&_th]:text-foreground">
              <TableRow className="hover:bg-transparent">
                <TableHead>Member</TableHead>
                <TableHead className="text-right" title="Total assigned to them">
                  Claimed
                </TableHead>
                <TableHead
                  className="text-right"
                  title={
                    type === "REQUEST"
                      ? "Claimed but the build hasn't started"
                      : "Claimed but not started yet (still Open)"
                  }
                >
                  Not started
                </TableHead>
                <TableHead className="text-right">In progress</TableHead>
                <TableHead className="text-right">{completedLabel}</TableHead>
                <TableHead className="text-right">{avgLabel}</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.map((r) => (
                <TableRow key={r.id} className="[&>td]:py-2.5">
                  <TableCell>
                    <div className="flex items-center gap-2">
                      <UserAvatar name={r.name} image={r.image} />
                      <span className="truncate text-sm font-medium">
                        {r.name ?? "—"}
                      </span>
                    </div>
                  </TableCell>
                  <TableCell className="text-right font-mono text-sm font-semibold tabular-nums">
                    {r.claimed}
                  </TableCell>
                  <TableCell className="text-right font-mono text-sm tabular-nums">
                    {r.notStarted > 0 ? (
                      r.notStarted
                    ) : (
                      <span className="text-text-muted">0</span>
                    )}
                  </TableCell>
                  <TableCell className="text-right font-mono text-sm tabular-nums">
                    {r.inProgress > 0 ? (
                      r.inProgress
                    ) : (
                      <span className="text-text-muted">0</span>
                    )}
                  </TableCell>
                  <TableCell className="text-right font-mono text-sm tabular-nums">
                    {r.completed}
                  </TableCell>
                  <TableCell className="text-right font-mono text-sm tabular-nums text-foreground">
                    {fmtDuration(r.avgHours, r.completed > 0)}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
        </>
      )}
    </section>
  );
}

/** One labelled figure in the mobile card — mono numerals, like the table's cells. */
function Stat({ label, value }: { label: string; value: number }) {
  return (
    <div>
      <dt className="text-[11px] uppercase tracking-wider text-text-muted">
        {label}
      </dt>
      <dd
        className={
          "mt-0.5 font-mono text-sm tabular-nums " +
          (value > 0 ? "font-semibold" : "text-text-muted")
        }
      >
        {value}
      </dd>
    </div>
  );
}
