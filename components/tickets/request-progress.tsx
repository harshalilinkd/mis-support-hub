"use client";

import { useState, useTransition } from "react";
import { AlertTriangle, GitCommitHorizontal, Users } from "lucide-react";
import { toast } from "sonner";

import { addProgressLog } from "@/lib/actions/requests";
import type { RequestDetail } from "@/lib/db/queries";
import type { SessionUser } from "@/lib/session";
import { canLogProgress } from "@/lib/ticket-state";
import { cn } from "@/lib/utils";
import { PROGRESS_LOG_TYPES } from "@/lib/validators/ticket";
import { AbsoluteTime } from "@/components/absolute-time";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";

type LogRow = RequestDetail["progressLogs"][number];
type LogType = (typeof PROGRESS_LOG_TYPES)[number];

/**
 * Progress logs are the MIS team's STRUCTURED build record (§12.2) — deliberately
 * separate from the free-form comment thread, which is the two-way conversation.
 * Do not merge the two.
 */
const LOG_META: Record<LogType, { label: string; icon: typeof GitCommitHorizontal; color: string }> = {
  UPDATE: { label: "Update", icon: GitCommitHorizontal, color: "var(--status-in-progress)" },
  REVIEW_SESSION: { label: "Review session", icon: Users, color: "var(--priority-high)" },
  // A blocker is the warning colour — it's the entry that needs attention.
  BLOCKER: { label: "Blocker", icon: AlertTriangle, color: "var(--priority-urgent)" },
};

export function RequestProgress({
  request,
  currentUser,
  onMutate,
}: {
  request: RequestDetail;
  currentUser: SessionUser;
  onMutate?: () => void;
}) {
  // ONE shared, unit-tested predicate (§12.4) — the same call the server makes.
  // Assignee-only, no admin override: a progress log is a first-person claim about a
  // build, so only the person doing it can make one. Keeping the rule here rather
  // than re-deriving it locally is the point — the bug this replaces was the composer
  // and the action drifting apart.
  const canLog = canLogProgress(
    currentUser.role,
    request.assignedToId === currentUser.id,
    request.status
  );

  const logs = request.progressLogs;
  // Nothing to show and nothing to add — don't render an empty shell.
  if (!canLog && logs.length === 0) return null;

  /**
   * The CURRENT progress of the request — the single number of record.
   *
   * Derived from the newest log that reported a %, not stored on the request: the log
   * history already IS that fact, and listRequests computes the same value for the
   * board card. A stored column would be a second source of truth for one number,
   * free to drift from the history it summarises — which is the ambiguity this
   * section exists to remove. Logs arrive ordered by createdAt asc.
   */
  const latest = [...logs].reverse().find((l) => l.percentComplete != null) ?? null;

  return (
    <section>
      <h2 className="mb-1 text-xs font-semibold uppercase tracking-wider text-text-muted">
        Progress
      </h2>

      {latest ? <CurrentProgress log={latest} /> : null}

      {canLog ? (
        <div className={cn(latest && "mt-3")}>
          <ProgressComposer ticketId={request.id} onDone={onMutate} />
        </div>
      ) : null}

      {logs.length === 0 ? (
        <p className="text-sm text-text-muted">No build updates logged yet.</p>
      ) : (
        <ol className={cn("space-y-3", (canLog || latest) && "mt-4")}>
          {logs.map((log) => (
            <ProgressEntry key={log.id} log={log} />
          ))}
        </ol>
      )}
    </section>
  );
}

/**
 * The one bar, the one number (§12.2). Percent-complete is the state of the REQUEST,
 * not of a log entry — so it is stated once, at the top, attributed and timestamped.
 * The entries below are history.
 */
function CurrentProgress({ log }: { log: LogRow }) {
  const pct = log.percentComplete ?? 0;
  return (
    <div className="rounded-[var(--radius-input)] border border-border bg-surface p-3">
      <div className="flex flex-wrap items-baseline gap-x-2">
        <span className="text-sm font-medium text-foreground">Progress</span>
        <span className="font-mono text-lg font-semibold tabular-nums text-foreground">
          {pct}%
        </span>
        <span className="text-xs text-text-muted">
          · updated by {log.authorName ?? "the assignee"}{" "}
          <AbsoluteTime date={log.createdAt} />
        </span>
      </div>
      <div
        className="mt-2 h-2 overflow-hidden rounded-full bg-surface-muted"
        role="img"
        aria-label={`${pct}% complete`}
      >
        <div
          className="h-full rounded-full bg-[var(--primary)] transition-[width] duration-300 motion-reduce:transition-none"
          style={{ width: `${pct}%` }}
        />
      </div>
    </div>
  );
}

function ProgressEntry({ log }: { log: LogRow }) {
  const meta = LOG_META[log.type];
  const Icon = meta.icon;
  return (
    <li className="flex gap-3">
      <div
        className="flex size-7 shrink-0 items-center justify-center rounded-full"
        style={{
          backgroundColor: `color-mix(in srgb, ${meta.color} 14%, transparent)`,
          color: meta.color,
        }}
      >
        <Icon className="size-3.5" />
      </div>
      <div className="min-w-0 flex-1 rounded-[var(--radius-input)] border border-border bg-surface p-3">
        <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-xs">
          {/* Type chip — dot + label, never colour alone (design-system §5). */}
          <span
            className="inline-flex items-center gap-1.5 rounded-[var(--radius-chip)] px-2 py-0.5 font-medium"
            style={{
              backgroundColor: `color-mix(in srgb, ${meta.color} 12%, transparent)`,
              color: meta.color,
            }}
          >
            <span aria-hidden className="size-1.5 rounded-full" style={{ backgroundColor: meta.color }} />
            {meta.label}
          </span>
          <span className="font-medium text-foreground">{log.authorName ?? "Unknown"}</span>
          <AbsoluteTime date={log.createdAt} className="text-text-muted" />
          {log.percentComplete != null ? (
            <span
              title="The figure this update reported at the time"
              className="ml-auto font-mono tabular-nums text-text-muted"
            >
              set {log.percentComplete}%
            </span>
          ) : null}
        </div>
        <p className="mt-1.5 whitespace-pre-wrap break-words text-sm text-foreground">{log.body}</p>
        {/* NO per-entry bar. The % an entry set is history — noted inline above, small.
            One bar, one number, at the top of the section (§12.2): a bar per entry
            competes with the current figure and leaves the reader guessing which one
            is the request's actual state. */}
      </div>
    </li>
  );
}

function ProgressComposer({
  ticketId,
  onDone,
}: {
  ticketId: string;
  onDone?: () => void;
}) {
  const [type, setType] = useState<LogType>("UPDATE");
  const [body, setBody] = useState("");
  const [withPercent, setWithPercent] = useState(false);
  const [percent, setPercent] = useState(50);
  const [pending, startTransition] = useTransition();

  const submit = () => {
    if (!body.trim()) {
      toast.error("Add a note describing the update.");
      return;
    }
    startTransition(async () => {
      const res = await addProgressLog({
        ticketId,
        type,
        body,
        percentComplete: withPercent ? percent : undefined,
      });
      if (!res.ok) {
        toast.error(res.error);
        return;
      }
      toast.success("Progress logged");
      setBody("");
      setWithPercent(false);
      setPercent(50);
      setType("UPDATE");
      onDone?.();
    });
  };

  return (
    <div className="space-y-2 rounded-[var(--radius-input)] border border-border bg-surface-muted/40 p-3">
      <div className="flex items-center gap-2">
        <Select value={type} onValueChange={(v) => setType(v as LogType)} disabled={pending}>
          <SelectTrigger className="w-44 bg-surface">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {PROGRESS_LOG_TYPES.map((t) => (
              <SelectItem key={t} value={t}>
                {LOG_META[t].label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <label className="inline-flex cursor-pointer items-center gap-1.5 text-xs text-text-muted">
          <input
            type="checkbox"
            checked={withPercent}
            onChange={(e) => setWithPercent(e.target.checked)}
            disabled={pending}
            className="size-3.5 accent-[var(--primary)]"
          />
          Report % complete
        </label>
        {withPercent ? (
          <div className="flex flex-1 items-center gap-2">
            <input
              type="range"
              min={0}
              max={100}
              step={5}
              value={percent}
              onChange={(e) => setPercent(Number(e.target.value))}
              disabled={pending}
              aria-label="Percent complete"
              className="h-1.5 flex-1 cursor-pointer accent-[var(--primary)]"
            />
            <span className="w-10 shrink-0 text-right font-mono text-xs font-medium tabular-nums">
              {percent}%
            </span>
          </div>
        ) : null}
      </div>
      <Textarea
        value={body}
        onChange={(e) => setBody(e.target.value)}
        rows={2}
        placeholder="What got done, what's next, any blocker…"
        disabled={pending}
        className="bg-surface"
      />
      <div className="flex justify-end">
        <Button type="button" size="sm" onClick={submit} disabled={pending || !body.trim()}>
          {pending ? "Logging…" : "Log progress"}
        </Button>
      </div>
    </div>
  );
}
