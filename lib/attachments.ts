/**
 * Shared attachment constants + helpers (CLAUDE.md §2/§4). Pure module — safe
 * to import from client components, the upload route, and server actions.
 */
export const MAX_ATTACHMENT_BYTES = 10 * 1024 * 1024; // 10MB

/** Content types accepted by the upload token flow (wildcards supported by Blob).
 * `audio/*` covers voice notes recorded in the browser (webm/mp4/ogg). */
export const ACCEPTED_CONTENT_TYPES = [
  "image/*",
  "application/pdf",
  "audio/*",
] as const;

/** For the file <input accept> attribute — screenshots/PDFs (voice notes have
 * their own recorder, not the file picker). */
export const ACCEPT_ATTR = "image/*,application/pdf";

export interface AttachmentMeta {
  url: string;
  filename: string;
  contentType: string;
  sizeBytes: number;
}

export function isImageType(contentType: string): boolean {
  return contentType.startsWith("image/");
}

export function isAudioType(contentType: string): boolean {
  return contentType.startsWith("audio/");
}

export function isAcceptedType(contentType: string): boolean {
  return (
    isImageType(contentType) ||
    contentType === "application/pdf" ||
    isAudioType(contentType)
  );
}

export function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}
