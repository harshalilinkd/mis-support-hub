"use client";

import { useState } from "react";
import { AudioLines, Download, FileText } from "lucide-react";

import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";
import { formatBytes, isAudioType, isImageType } from "@/lib/attachments";
import { AudioPlayer } from "./audio-player";

export type AttachmentView = {
  id: string;
  url: string;
  filename: string;
  contentType: string;
  sizeBytes: number;
};

/** Thumbnail grid for image attachments (lightbox on click) + download chips for the rest. */
export function AttachmentGrid({
  attachments,
}: {
  attachments: AttachmentView[];
}) {
  const [active, setActive] = useState<AttachmentView | null>(null);

  if (attachments.length === 0) {
    return <p className="text-sm text-text-muted">No attachments.</p>;
  }

  const images = attachments.filter((a) => isImageType(a.contentType));
  const audios = attachments.filter((a) => isAudioType(a.contentType));
  const files = attachments.filter(
    (a) => !isImageType(a.contentType) && !isAudioType(a.contentType)
  );

  return (
    <div className="space-y-3">
      {images.length > 0 && (
        <div className="grid grid-cols-3 gap-2 sm:grid-cols-4">
          {images.map((a) => (
            <button
              key={a.id}
              type="button"
              onClick={() => setActive(a)}
              title={a.filename}
              className="group relative aspect-square overflow-hidden rounded-[var(--radius-input)] border border-border bg-surface-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={a.url}
                alt={a.filename}
                loading="lazy"
                className="size-full object-cover transition-transform group-hover:scale-105"
              />
            </button>
          ))}
        </div>
      )}

      {audios.length > 0 && (
        <ul className="space-y-2">
          {audios.map((a) => (
            <li
              key={a.id}
              className="rounded-[var(--radius-input)] border border-border bg-surface p-3"
            >
              <div className="mb-2 flex items-center gap-2 text-sm">
                <AudioLines className="size-4 shrink-0 text-primary" />
                <span className="min-w-0 flex-1 truncate font-medium">
                  Voice note
                </span>
                <span className="shrink-0 font-mono text-xs text-text-muted">
                  {formatBytes(a.sizeBytes)}
                </span>
                {/* Fallback for browsers that can't play the recorded container
                    inline (e.g. some Safari/iOS builds with WebM) — download it. */}
                <a
                  href={a.url}
                  target="_blank"
                  rel="noreferrer"
                  download={a.filename}
                  title="Download voice note"
                  className="shrink-0 rounded-[6px] p-1 text-text-muted transition-colors hover:bg-surface-muted hover:text-foreground"
                >
                  <Download className="size-4" />
                </a>
              </div>
              <AudioPlayer src={a.url} className="w-full" />
            </li>
          ))}
        </ul>
      )}

      {files.length > 0 && (
        <ul className="space-y-1.5">
          {files.map((a) => (
            <li key={a.id}>
              <a
                href={a.url}
                target="_blank"
                rel="noreferrer"
                download={a.filename}
                className="flex items-center gap-3 rounded-[var(--radius-input)] border border-border bg-surface px-3 py-2 text-sm transition-colors hover:bg-surface-muted"
              >
                <FileText className="size-4 shrink-0 text-text-muted" />
                <span className="min-w-0 flex-1 truncate">{a.filename}</span>
                <span className="shrink-0 font-mono text-xs text-text-muted">
                  {formatBytes(a.sizeBytes)}
                </span>
                <Download className="size-4 shrink-0 text-text-muted" />
              </a>
            </li>
          ))}
        </ul>
      )}

      <Dialog open={!!active} onOpenChange={(open) => !open && setActive(null)}>
        <DialogContent
          className="max-w-3xl p-2"
          // Lightbox: clicking the backdrop or pressing Escape should dismiss
          // the image (nothing to lose) — opt out of the app-wide
          // close-only-via-X default by allowing the default dismiss.
          onInteractOutside={() => {}}
          onEscapeKeyDown={() => {}}
        >
          <DialogTitle className="sr-only">
            {active?.filename ?? "Attachment"}
          </DialogTitle>
          {active ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={active.url}
              alt={active.filename}
              className="mx-auto max-h-[80vh] w-auto rounded-[var(--radius-input)]"
            />
          ) : null}
        </DialogContent>
      </Dialog>
    </div>
  );
}
