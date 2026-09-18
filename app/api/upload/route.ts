import { handleUpload, type HandleUploadBody } from "@vercel/blob/client";
import { NextResponse } from "next/server";

import { MAX_ATTACHMENT_BYTES } from "@/lib/attachments";
import { auth } from "@/lib/auth";

/**
 * Vercel Blob client-upload token endpoint (CLAUDE.md §2). Server Action bodies
 * are capped ~4.5MB, so the browser uploads directly to Blob using a short-lived
 * token minted here (handleUpload), which carries the size cap (MAX_ATTACHMENT_BYTES)
 * and no type restriction.
 * The corresponding ticket_attachments row is written by the `attachTo` action.
 */
export async function POST(request: Request): Promise<NextResponse> {
  const body = (await request.json()) as HandleUploadBody;

  try {
    const jsonResponse = await handleUpload({
      body,
      request,
      onBeforeGenerateToken: async () => {
        // Only authenticated users may mint an upload token.
        const session = await auth();
        if (!session?.user) {
          throw new Error("Unauthorized");
        }
        return {
          // No allowedContentTypes: any file type is accepted (see lib/attachments).
          // The size cap and the authenticated-session check above are the guards.
          maximumSizeInBytes: MAX_ATTACHMENT_BYTES,
          // Give every upload a unique filename so two files with the same name
          // (e.g. "Screenshot ….png") don't collide with a "blob already exists".
          addRandomSuffix: true,
          tokenPayload: JSON.stringify({ userId: session.user.id }),
        };
      },
      onUploadCompleted: async () => {
        // Persistence happens in the `attachTo` server action, which has the
        // ticket/comment context; nothing to do here.
      },
    });
    return NextResponse.json(jsonResponse);
  } catch (error) {
    return NextResponse.json(
      { error: (error as Error).message },
      { status: 400 }
    );
  }
}
