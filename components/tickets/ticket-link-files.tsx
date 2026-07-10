"use client";

import { ExternalLink, FileText } from "lucide-react";

import { isImageType } from "@/lib/attachments";
import type { TicketAttachmentThumb } from "@/lib/db/queries";
import { cn } from "@/lib/utils";

const MAX_THUMBS = 3;
const isUrl = (v: string) => /^https?:\/\//i.test(v);

/**
 * Compact "Link / Files" cell for the ticket list tables: the sheet link/system
 * on top, then small clickable attachment thumbnails (images) / file chips (PDFs).
 * Each opens in a new tab; clicks stop propagation so they don't also open the
 * row's detail. Type is imported type-only, so no server code enters the bundle.
 */
export function TicketLinkFiles({
  sheetLink,
  attachments,
  className,
}: {
  sheetLink: string | null;
  attachments: TicketAttachmentThumb[];
  className?: string;
}) {
  const shown = attachments.slice(0, MAX_THUMBS);
  const extra = attachments.length - shown.length;
  const stop = (e: React.MouseEvent) => e.stopPropagation();

  if (!sheetLink && attachments.length === 0) {
    return <span className="text-xs text-text-muted">—</span>;
  }

  return (
    <div className={cn("flex min-w-0 max-w-[15rem] flex-col gap-1.5", className)}>
      {sheetLink ? (
        isUrl(sheetLink) ? (
          <a
            href={sheetLink}
            target="_blank"
            rel="noreferrer"
            onClick={stop}
            title={sheetLink}
            className="inline-flex min-w-0 items-center gap-1 text-xs text-primary hover:underline"
          >
            <ExternalLink className="size-3 shrink-0" />
            <span className="truncate">{sheetLink}</span>
          </a>
        ) : (
          <span
            title={sheetLink}
            className="inline-flex min-w-0 items-center gap-1 text-xs text-text-muted"
          >
            <ExternalLink className="size-3 shrink-0" />
            <span className="truncate">{sheetLink}</span>
          </span>
        )
      ) : null}

      {attachments.length > 0 ? (
        <div className="flex items-center gap-1">
          {shown.map((a) =>
            isImageType(a.contentType) ? (
              <a
                key={a.id}
                href={a.url}
                target="_blank"
                rel="noreferrer"
                onClick={stop}
                title={a.filename}
                className="block size-8 shrink-0 overflow-hidden rounded border border-border bg-surface-muted transition-transform hover:scale-105"
              >
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={a.url}
                  alt={a.filename}
                  loading="lazy"
                  className="size-full object-cover"
                />
              </a>
            ) : (
              <a
                key={a.id}
                href={a.url}
                target="_blank"
                rel="noreferrer"
                onClick={stop}
                title={a.filename}
                className="grid size-8 shrink-0 place-items-center rounded border border-border bg-surface-muted text-text-muted hover:bg-surface"
              >
                <FileText className="size-4" />
              </a>
            )
          )}
          {extra > 0 ? (
            <span className="shrink-0 text-xs text-text-muted">+{extra}</span>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
