import { z } from "zod";

import { MAX_ATTACHMENT_BYTES } from "@/lib/attachments";

// Blob URLs look like https://<store>.public.blob.vercel-storage.com/<path>.
const BLOB_HOST = /^https:\/\/[a-z0-9-]+\.public\.blob\.vercel-storage\.com\//i;

export const attachToSchema = z.object({
  ticketId: z.string().uuid(),
  commentId: z.string().uuid().nullish(),
  url: z
    .string()
    .url()
    .refine((u) => BLOB_HOST.test(u), "Not a valid Vercel Blob URL"),
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
