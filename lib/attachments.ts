/**
 * Shared attachment constants + helpers (CLAUDE.md §2/§4). Pure module — safe
 * to import from client components, the upload route, and server actions.
 */
export const MAX_ATTACHMENT_BYTES = 10 * 1024 * 1024; // 10MB

/** Content types accepted by the upload token flow (wildcards supported by Blob). */
export const ACCEPTED_CONTENT_TYPES = ["image/*", "application/pdf"] as const;

/** For the <input accept> attribute. */
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

export function isAcceptedType(contentType: string): boolean {
  return isImageType(contentType) || contentType === "application/pdf";
}

export function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}
