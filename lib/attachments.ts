/**
 * Shared attachment constants + helpers (CLAUDE.md §2/§4). Pure module — safe
 * to import from client components, the upload route, and server actions.
 */
export const MAX_ATTACHMENT_BYTES = 50 * 1024 * 1024; // 50MB

/**
 * There is NO content-type allowlist, by product decision.
 *
 * It used to be images + PDF (+ audio for voice notes), which refused the files people
 * actually needed to send MIS: an .xlsx export, a .csv, a .docx spec, a .zip of logs.
 * A reporter who cannot attach the file that shows the problem describes it in prose
 * instead, which is worse for everyone. The upload route therefore passes no
 * `allowedContentTypes`, the picker no `accept`, and the validator no type refinement.
 *
 * What still guards the flow: only an authenticated user can mint an upload token, the
 * size cap above is enforced on the token AND in the validator, and every stored URL
 * must be a Vercel Blob (or, in dev, a local /uploads) URL. Files are served from
 * Blob's own domain, not ours, so a stored file cannot execute as same-origin script.
 */

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

export function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}
