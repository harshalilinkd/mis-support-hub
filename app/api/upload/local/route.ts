import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { NextResponse } from "next/server";

import { isAcceptedType, MAX_ATTACHMENT_BYTES } from "@/lib/attachments";
import { getCurrentUser } from "@/lib/session";

/**
 * Dev-only local attachment storage. In local development there's no Vercel Blob
 * token, so the FileDropzone posts files here instead of to Blob; we save them
 * under public/uploads (served statically by Next in dev) and return an absolute
 * URL. Production ALWAYS uses Vercel Blob — this route 404s there. Mirrors the
 * Blob token route's checks: authenticated user, accepted type, size limit.
 */
export async function POST(request: Request): Promise<NextResponse> {
  if (process.env.NODE_ENV === "production") {
    return NextResponse.json(
      { error: "Local uploads are disabled in production; Vercel Blob is used." },
      { status: 404 }
    );
  }

  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const form = await request.formData();
  const file = form.get("file");
  if (!(file instanceof File)) {
    return NextResponse.json({ error: "No file provided." }, { status: 400 });
  }
  if (!isAcceptedType(file.type)) {
    return NextResponse.json(
      { error: "This file type isn't supported." },
      { status: 400 }
    );
  }
  if (file.size > MAX_ATTACHMENT_BYTES) {
    return NextResponse.json({ error: "File is too large." }, { status: 400 });
  }

  const rawExt = path.extname(file.name).toLowerCase();
  const ext = /^\.[a-z0-9]{1,8}$/.test(rawExt)
    ? rawExt
    : file.type === "application/pdf"
      ? ".pdf"
      : "";
  const name = `${crypto.randomUUID()}${ext}`;

  const dir = path.join(process.cwd(), "public", "uploads");
  await mkdir(dir, { recursive: true });
  await writeFile(path.join(dir, name), Buffer.from(await file.arrayBuffer()));

  // Absolute URL so it satisfies the attachment schema (.url()) and renders.
  const url = new URL(`/uploads/${name}`, request.url).toString();
  return NextResponse.json({ url });
}
