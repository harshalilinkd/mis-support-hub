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
        <div className="overflow-x-auto">
          <Table>
            <TableHeader className="[&_th]:h-9 [&_th]:text-xs [&_th]:font-semibold [&_th]:uppercase [&_th]:tracking-wider [&_th]:text-foreground">
              <TableRow className="hover:bg-transparent">
                <TableHead>Member</TableHead>
                <TableHead className="text-right">Claimed</TableHead>
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
                  <TableCell className="text-right font-mono text-sm tabular-nums">
                    {r.claimed}
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
      )}
    </section>
  );
}
