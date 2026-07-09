"use client";

import { useEffect, useRef, useState } from "react";
import { upload } from "@vercel/blob/client";
import { AlertCircle, FileText, Loader2, UploadCloud, X } from "lucide-react";

import {
  ACCEPT_ATTR,
  formatBytes,
  isAcceptedType,
  isImageType,
  MAX_ATTACHMENT_BYTES,
  type AttachmentMeta,
} from "@/lib/attachments";
import { cn } from "@/lib/utils";

type Item = {
  id: string;
  file: File;
  previewUrl?: string;
  status: "uploading" | "done" | "error";
  progress: number;
  error?: string;
  meta?: AttachmentMeta;
};

// Local dev has no Vercel Blob token, so uploads go to a local route that stores
// under public/uploads; production (Vercel) uploads straight to Blob. Either path
// returns the URL that becomes the AttachmentMeta.
const UPLOAD_LOCAL = process.env.NODE_ENV !== "production";

async function uploadFile(
  file: File,
  onProgress: (pct: number) => void
): Promise<string> {
  if (UPLOAD_LOCAL) {
    const body = new FormData();
    body.append("file", file);
    const res = await fetch("/api/upload/local", { method: "POST", body });
    if (!res.ok) {
      const data = (await res.json().catch(() => null)) as { error?: string } | null;
      throw new Error(data?.error ?? "Upload failed.");
    }
    onProgress(100);
    return ((await res.json()) as { url: string }).url;
  }
  const result = await upload(file.name, file, {
    access: "public",
    handleUploadUrl: "/api/upload",
    contentType: file.type,
    onUploadProgress: (p) => onProgress(Math.round(p.percentage)),
  });
  return result.url;
}

/**
 * Drag-drop uploader (design-system styled). Uploads to Vercel Blob in production
 * and to a local route in dev (see uploadFile), then reports the completed
 * AttachmentMeta[] to the parent form via onChange. The parent persists them with
 * attachTo() once it has a ticket id.
 */
export function FileDropzone({
  onChange,
  onBusyChange,
  disabled = false,
  maxFiles = 8,
  compact = false,
}: {
  onChange: (metas: AttachmentMeta[]) => void;
  onBusyChange?: (busy: boolean) => void;
  disabled?: boolean;
  maxFiles?: number;
  compact?: boolean;
}) {
  const [items, setItems] = useState<Item[]>([]);
  const [dragOver, setDragOver] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  // Report completed metadata whenever the set of finished uploads changes.
  const onChangeRef = useRef(onChange);
  onChangeRef.current = onChange;
  const doneKey = items
    .filter((i) => i.status === "done")
    .map((i) => i.meta?.url)
    .join("|");
  useEffect(() => {
    onChangeRef.current(
      items
        .filter((i): i is Item & { meta: AttachmentMeta } =>
          Boolean(i.status === "done" && i.meta)
        )
        .map((i) => i.meta)
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [doneKey]);

  // Report in-flight uploads so parents can block submit until they finish.
  const busy = items.some((i) => i.status === "uploading");
  const onBusyChangeRef = useRef(onBusyChange);
  onBusyChangeRef.current = onBusyChange;
  useEffect(() => {
    onBusyChangeRef.current?.(busy);
  }, [busy]);

  const update = (id: string, patch: Partial<Item>) =>
    setItems((prev) => prev.map((i) => (i.id === id ? { ...i, ...patch } : i)));

  async function handleFiles(fileList: FileList | File[]) {
    if (disabled) return;
    const files = Array.from(fileList);
    const room = Math.max(0, maxFiles - items.length);

    for (const file of files.slice(0, room)) {
      const id = crypto.randomUUID();

      if (!isAcceptedType(file.type)) {
        setItems((prev) => [
          ...prev,
          { id, file, status: "error", progress: 0, error: "Only images and PDFs are allowed." },
        ]);
        continue;
      }
      if (file.size > MAX_ATTACHMENT_BYTES) {
        setItems((prev) => [
          ...prev,
          { id, file, status: "error", progress: 0, error: `Too large (max ${formatBytes(MAX_ATTACHMENT_BYTES)}).` },
        ]);
        continue;
      }

      const previewUrl = isImageType(file.type)
        ? URL.createObjectURL(file)
        : undefined;
      setItems((prev) => [
        ...prev,
        { id, file, previewUrl, status: "uploading", progress: 0 },
      ]);

      try {
        const url = await uploadFile(file, (pct) => update(id, { progress: pct }));
        update(id, {
          status: "done",
          progress: 100,
          meta: {
            url,
            filename: file.name,
            contentType: file.type,
            sizeBytes: file.size,
          },
        });
      } catch (e) {
        update(id, { status: "error", error: (e as Error).message || "Upload failed." });
      }
    }
  }

  function removeItem(id: string) {
    setItems((prev) => {
      const item = prev.find((i) => i.id === id);
      if (item?.previewUrl) URL.revokeObjectURL(item.previewUrl);
      return prev.filter((i) => i.id !== id);
    });
  }

  return (
    <div className="space-y-3">
      <div
        role="button"
        tabIndex={disabled ? -1 : 0}
        aria-disabled={disabled}
        onClick={() => !disabled && inputRef.current?.click()}
        onKeyDown={(e) => {
          if ((e.key === "Enter" || e.key === " ") && !disabled) {
            e.preventDefault();
            inputRef.current?.click();
          }
        }}
        onDragOver={(e) => {
          e.preventDefault();
          if (!disabled) setDragOver(true);
        }}
        onDragLeave={() => setDragOver(false)}
        onDrop={(e) => {
          e.preventDefault();
          setDragOver(false);
          if (!disabled && e.dataTransfer.files.length) {
            void handleFiles(e.dataTransfer.files);
          }
        }}
        className={cn(
          "flex flex-col items-center justify-center gap-1.5 rounded-[var(--radius-card)] border border-dashed px-4 text-center transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
          compact ? "py-5" : "py-8",
          disabled ? "cursor-not-allowed opacity-60" : "cursor-pointer",
          dragOver
            ? "border-primary bg-accent-soft"
            : "border-border bg-surface-muted/40 hover:bg-surface-muted"
        )}
      >
        <UploadCloud className="size-6 text-text-muted" />
        <div className="text-sm">
          <span className="font-medium text-primary">Click to upload</span>
          <span className="text-text-muted"> or drag and drop</span>
        </div>
        <p className="text-xs text-text-muted">
          Images or PDF · up to {formatBytes(MAX_ATTACHMENT_BYTES)}
        </p>
        <input
          ref={inputRef}
          type="file"
          multiple
          accept={ACCEPT_ATTR}
          className="hidden"
          disabled={disabled}
          onChange={(e) => {
            if (e.target.files) void handleFiles(e.target.files);
            e.target.value = "";
          }}
        />
      </div>

      {items.length > 0 && (
        <ul className="space-y-2">
          {items.map((item) => (
            <li
              key={item.id}
              className="flex items-center gap-3 rounded-[var(--radius-input)] border border-border bg-surface p-2"
            >
              <div className="flex size-10 shrink-0 items-center justify-center overflow-hidden rounded-[6px] bg-surface-muted">
                {item.previewUrl ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={item.previewUrl} alt="" className="size-full object-cover" />
                ) : (
                  <FileText className="size-4 text-text-muted" />
                )}
              </div>
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2">
                  <span className="truncate text-sm">{item.file.name}</span>
                  <span className="ml-auto shrink-0 font-mono text-xs text-text-muted">
                    {formatBytes(item.file.size)}
                  </span>
                </div>
                {item.status === "uploading" && (
                  <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-surface-muted">
                    <div
                      className="h-full rounded-full bg-primary transition-all"
                      style={{ width: `${item.progress}%` }}
                    />
                  </div>
                )}
                {item.status === "error" && (
                  <p className="mt-0.5 flex items-center gap-1 text-xs text-destructive">
                    <AlertCircle className="size-3 shrink-0" /> {item.error}
                  </p>
                )}
                {item.status === "done" && (
                  <p className="mt-0.5 text-xs text-status-resolved">Uploaded</p>
                )}
              </div>
              {item.status === "uploading" ? (
                <Loader2 className="size-4 shrink-0 animate-spin text-text-muted" />
              ) : (
                <button
                  type="button"
                  aria-label={`Remove ${item.file.name}`}
                  onClick={() => removeItem(item.id)}
                  className="shrink-0 rounded-[6px] p-1 text-text-muted transition-colors hover:bg-surface-muted hover:text-foreground"
                >
                  <X className="size-4" />
                </button>
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
