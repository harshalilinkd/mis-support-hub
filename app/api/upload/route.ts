import { handleUpload, type HandleUploadBody } from "@vercel/blob/client";
import { NextResponse } from "next/server";

import { ACCEPTED_CONTENT_TYPES, MAX_ATTACHMENT_BYTES } from "@/lib/attachments";
import { auth } from "@/lib/auth";

/**
 * Vercel Blob client-upload token endpoint (CLAUDE.md §2). Server Action bodies
 * are capped ~4.5MB, so the browser uploads directly to Blob using a short-lived
 * token minted here (handleUpload), which lets larger images through (max 10MB).
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
          allowedContentTypes: [...ACCEPTED_CONTENT_TYPES],
          maximumSizeInBytes: MAX_ATTACHMENT_BYTES,
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
