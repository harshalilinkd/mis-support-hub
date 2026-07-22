"use client";

import { useState } from "react";
import { AudioLines, Download, FileText, Maximize2, X } from "lucide-react";

import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogTitle,
} from "@/components/ui/dialog";
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
          // Image-first lightbox. The width overrides are load-bearing: the base
          // DialogContent sets `sm:max-w-lg` (512px), and a bare `max-w-*` only
          // replaces the UNPREFIXED width — so on a desktop screen the old
          // `max-w-3xl` was silently beaten by `sm:max-w-lg` and a wide screenshot
          // got crushed into 512px. We override every breakpoint and let the box
          // size to the image (up to 96vw × 90vh), floating frameless on the
          // backdrop so nothing steals room from the picture.
          showCloseButton={false}
          className="w-auto max-w-[96vw] gap-0 border-0 bg-transparent p-0 shadow-none sm:max-w-[96vw]"
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
            <div className="relative flex flex-col items-center">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={active.url}
                alt={active.filename}
                className="max-h-[90vh] w-auto max-w-[96vw] rounded-[var(--radius-card)] object-contain shadow-2xl"
              />
              {/* Toolbar on a solid pill so the controls stay legible over any
                  image. "Open full size" escapes the 96vw cap for pixel-level
                  detail (a dense table screenshot); download + close beside it. */}
              <div className="absolute right-2 top-2 flex items-center gap-0.5 rounded-full bg-black/60 p-1 backdrop-blur">
                <a
                  href={active.url}
                  target="_blank"
                  rel="noreferrer"
                  title="Open full size in a new tab"
                  className="rounded-full p-1.5 text-white/90 transition-colors hover:bg-white/20 hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white"
                >
                  <Maximize2 className="size-4" />
                </a>
                <a
                  href={active.url}
                  download={active.filename}
                  title="Download"
                  className="rounded-full p-1.5 text-white/90 transition-colors hover:bg-white/20 hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white"
                >
                  <Download className="size-4" />
                </a>
                <DialogClose
                  title="Close"
                  className="rounded-full p-1.5 text-white/90 transition-colors hover:bg-white/20 hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white"
                >
                  <X className="size-4" />
                  <span className="sr-only">Close</span>
                </DialogClose>
              </div>
              {/* Filename caption — small, unobtrusive, helps when several similar
                  screenshots are attached. */}
              <div className="pointer-events-none absolute inset-x-0 bottom-0 truncate rounded-b-[var(--radius-card)] bg-gradient-to-t from-black/70 to-transparent px-4 pb-2 pt-8 text-center text-xs font-medium text-white/90">
                {active.filename}
              </div>
            </div>
          ) : null}
        </DialogContent>
      </Dialog>
    </div>
  );
}
