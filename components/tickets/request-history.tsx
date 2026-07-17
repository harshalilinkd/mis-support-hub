"use client";

import { useMemo, useState } from "react";
import { ChevronDown, Copy, Download, History } from "lucide-react";
import { toast } from "sonner";

import type { RequestDetail } from "@/lib/db/queries";
import { toIso } from "@/lib/format";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";

/**
 * The complete start-to-end story (§12.5): every activity row, comment, and progress
 * log in ONE chronological stream — every actor, every timestamp. This is the
 * auditable view; the Progress and Conversation sections above stay separate
 * concepts. Exportable so it can leave the app for a review or a paper trail.
 */

// Fixed timezone + locale → deterministic, and the export reads the same for everyone.
const TS = new Intl.DateTimeFormat("en-GB", {
  timeZone: "Asia/Kolkata",
  day: "2-digit",
  month: "short",
  year: "numeric",
  hour: "2-digit",
  minute: "2-digit",
  second: "2-digit",
  hour12: false,
});
const stamp = (iso: string) => {
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? iso : TS.format(d);
};

type Entry = {
  at: string;
  actor: string;
  kind: "Event" | "Comment" | "Progress";
  detail: string;
};

const ACTIVITY_TEXT: Record<string, string> = {
  SUBMITTED: "submitted the request",
  MOVED_TO_REVIEW: "moved it into review",
  SENT_FOR_APPROVAL: "sent it for approval",
  APPROVAL_RECORDED: "recorded the decision: Approved",
  REJECTION_RECORDED: "recorded the decision: Rejected",
  DROPPED: "dropped the request",
  REVIVED: "revived the request",
  CLAIMED: "claimed the build",
  UNCLAIMED: "released the claim",
  DEADLINE_SET: "set the delivery date",
  STARTED: "started building",
  MARKED_COMPLETE: "marked the build complete",
  CHANGES_REQUESTED: "requested changes",
  ACCEPTED: "accepted the build",
  EDITED: "edited the request",
};

function buildEntries(request: RequestDetail): Entry[] {
  const rows: Entry[] = [
    ...request.activity
      // The comment/progress bodies are rendered from their own rows below, so the
      // bare marker events would just be noise.
      .filter((a) => a.type !== "COMMENTED" && a.type !== "PROGRESS_LOGGED")
      .map((a) => {
        const base = ACTIVITY_TEXT[a.type] ?? `did: ${a.type}`;
        const extra =
          a.type === "CHANGES_REQUESTED" && a.toValue
            ? ` (round ${a.toValue})`
            : a.type === "DEADLINE_SET" && a.toValue
              ? ` → ${stamp(a.toValue).slice(0, 11)}`
              : a.fromValue && a.toValue
                ? ` (${a.fromValue} → ${a.toValue})`
                : "";
        return {
          at: toIso(a.createdAt),
          actor: a.actorName ?? "Unknown",
          kind: "Event" as const,
          detail: base + extra,
        };
      }),
    ...request.comments.map((c) => ({
      at: toIso(c.createdAt),
      actor: c.authorName ?? "Unknown",
      kind: "Comment" as const,
      detail: c.body,
    })),
    ...request.progressLogs.map((l) => ({
      at: toIso(l.createdAt),
      actor: l.authorName ?? "Unknown",
      kind: "Progress" as const,
      detail: `[${l.type}]${l.percentComplete != null ? ` ${l.percentComplete}% ·` : ""} ${l.body}`,
    })),
  ];
  return rows.sort((a, b) => a.at.localeCompare(b.at));
}

const KIND_COLOR: Record<Entry["kind"], string> = {
  Event: "var(--text-muted)",
  Comment: "var(--accent)",
  Progress: "var(--status-in-progress)",
};

export function RequestHistory({ request }: { request: RequestDetail }) {
  const [open, setOpen] = useState(false);
  const entries = useMemo(() => buildEntries(request), [request]);

  const asText = () =>
    [
      `${request.number} — ${request.systemName}`,
      `Full history · ${entries.length} entries · exported ${stamp(new Date().toISOString())} IST`,
      "",
      ...entries.map(
        (e) => `${stamp(e.at)} IST\t${e.kind}\t${e.actor}\t${e.detail.replace(/\s*\n\s*/g, " ")}`
      ),
    ].join("\n");

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(asText());
      toast.success("Full history copied");
    } catch {
      toast.error("Couldn't copy — your browser blocked clipboard access.");
    }
  };

  const download = () => {
    const blob = new Blob([asText()], { type: "text/plain;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${request.number}-history.txt`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <section className="rounded-[var(--radius-input)] border border-border">
      <button
        type="button"
        aria-expanded={open}
        onClick={() => setOpen((o) => !o)}
        className="flex w-full items-center gap-2 px-3 py-2.5 text-left transition-colors hover:bg-surface-muted/60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
      >
        <History className="size-4 text-text-muted" />
        <span className="text-sm font-medium">Full history</span>
        <span className="font-mono text-xs tabular-nums text-text-muted">
          {entries.length}
        </span>
        <ChevronDown
          className={cn(
            "ml-auto size-4 text-text-muted transition-transform",
            open && "rotate-180"
          )}
        />
      </button>

      {open ? (
        <div className="border-t border-border p-3">
          <div className="mb-2 flex justify-end gap-2">
            <Button type="button" size="sm" variant="outline" onClick={copy}>
              <Copy className="size-3.5" /> Copy
            </Button>
            <Button type="button" size="sm" variant="outline" onClick={download}>
              <Download className="size-3.5" /> Export
            </Button>
          </div>
          {entries.length === 0 ? (
            <p className="text-sm text-text-muted">Nothing recorded yet.</p>
          ) : (
            <ol className="space-y-1.5">
              {entries.map((e, i) => (
                <li key={`${e.at}-${i}`} className="flex gap-2 text-xs leading-relaxed">
                  <span className="w-36 shrink-0 font-mono tabular-nums text-text-muted">
                    {stamp(e.at)}
                  </span>
                  <span
                    className="w-16 shrink-0 font-medium"
                    style={{ color: KIND_COLOR[e.kind] }}
                  >
                    {e.kind}
                  </span>
                  <span className="w-28 shrink-0 truncate text-foreground">{e.actor}</span>
                  <span className="min-w-0 flex-1 whitespace-pre-wrap break-words text-foreground">
                    {e.detail}
                  </span>
                </li>
              ))}
            </ol>
          )}
        </div>
      ) : null}
    </section>
  );
}
