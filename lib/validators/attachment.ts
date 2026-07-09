import { z } from "zod";

import { MAX_ATTACHMENT_BYTES } from "@/lib/attachments";

// Blob URLs look like https://<store>.public.blob.vercel-storage.com/<path>.
const BLOB_HOST = /^https:\/\/[a-z0-9-]+\.public\.blob\.vercel-storage\.com\//i;
// Dev-only local uploads (app/api/upload/local) live at <origin>/uploads/…
const LOCAL_UPLOAD = /^https?:\/\/[^/]+\/uploads\/[^/]+$/i;

/** Accept Vercel Blob URLs always; local /uploads/ URLs only in development. */
function isAllowedUploadUrl(u: string): boolean {
  if (BLOB_HOST.test(u)) return true;
  return process.env.NODE_ENV !== "production" && LOCAL_UPLOAD.test(u);
}

export const attachToSchema = z.object({
  ticketId: z.string().uuid(),
  commentId: z.string().uuid().nullish(),
  url: z.string().url().refine(isAllowedUploadUrl, "Not a valid upload URL"),
  filename: z.string().trim().min(1).max(255),
  contentType: z
    .string()
    .refine(
      (c) => c.startsWith("image/") || c === "application/pdf",
      "Unsupported file type"
    ),
  sizeBytes: z
    .number()
    .int()
    .positive()
    .max(MAX_ATTACHMENT_BYTES, "File exceeds the 10MB limit"),
});
export type AttachToInput = z.infer<typeof attachToSchema>;
