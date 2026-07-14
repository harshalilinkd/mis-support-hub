"use client";

import { upload } from "@vercel/blob/client";

// Local dev has no Vercel Blob token, so uploads go to a local route that stores
// under public/uploads; production (Vercel) uploads straight to Blob. Either path
// returns the URL that becomes the AttachmentMeta. Shared by the file dropzone
// and the voice-note recorder.
const UPLOAD_LOCAL = process.env.NODE_ENV !== "production";

/** Upload a File and return its public URL (Blob in prod, local route in dev). */
export async function uploadFile(
  file: File,
  onProgress?: (pct: number) => void
): Promise<string> {
  if (UPLOAD_LOCAL) {
    const body = new FormData();
    body.append("file", file);
    const res = await fetch("/api/upload/local", { method: "POST", body });
    if (!res.ok) {
      const data = (await res
        .json()
        .catch(() => null)) as { error?: string } | null;
      throw new Error(data?.error ?? "Upload failed.");
    }
    onProgress?.(100);
    return ((await res.json()) as { url: string }).url;
  }
  const result = await upload(file.name, file, {
    access: "public",
    handleUploadUrl: "/api/upload",
    contentType: file.type,
    onUploadProgress: (p) => onProgress?.(Math.round(p.percentage)),
  });
  return result.url;
}
