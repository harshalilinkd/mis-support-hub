"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Paperclip } from "lucide-react";
import { toast } from "sonner";

import { attachTo } from "@/lib/actions/attachments";
import { addComment } from "@/lib/actions/comments";
import type { AttachmentMeta } from "@/lib/attachments";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { FileDropzone } from "./file-dropzone";

export function CommentComposer({ ticketId }: { ticketId: string }) {
  const router = useRouter();
  const [body, setBody] = useState("");
  const [attachments, setAttachments] = useState<AttachmentMeta[]>([]);
  const [showDrop, setShowDrop] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [pending, startTransition] = useTransition();

  function submit() {
    const text = body.trim();
    if (!text) {
      toast.error("Write a comment first.");
      return;
    }
    if (uploading) {
      toast.error("Please wait for uploads to finish.");
      return;
    }
    startTransition(async () => {
      const res = await addComment(ticketId, text);
      if (!res.ok) {
        toast.error(res.error);
        return;
      }
      // Link uploaded blobs; a thrown/failed attach must not lose the success
      // state (the comment already exists) — surface a partial-failure warning.
      let failed = 0;
      if (attachments.length > 0) {
        const results = await Promise.allSettled(
          attachments.map((m) => attachTo(ticketId, res.data.id, m))
        );
        failed = results.filter(
          (r) => r.status === "rejected" || !r.value.ok
        ).length;
      }
      setBody("");
      setAttachments([]);
      setShowDrop(false);
      if (failed > 0) {
        toast.warning(
          `Comment added, but ${failed} attachment(s) couldn't be attached.`
        );
      } else {
        toast.success("Comment added");
      }
      router.refresh();
    });
  }

  return (
    <div className="space-y-2">
      <Textarea
        value={body}
        onChange={(e) => setBody(e.target.value)}
        placeholder="Add a comment…"
        rows={3}
        disabled={pending}
      />
      {showDrop ? (
        <FileDropzone
          onChange={setAttachments}
          onBusyChange={setUploading}
          disabled={pending}
        />
      ) : null}
      <div className="flex items-center justify-between">
        <Button
          type="button"
          variant="ghost"
          size="sm"
          onClick={() => setShowDrop((s) => !s)}
          disabled={pending}
        >
          <Paperclip className="size-4" />
          {showDrop ? "Hide files" : "Attach files"}
        </Button>
        <Button
          type="button"
          onClick={submit}
          disabled={pending || uploading || !body.trim()}
        >
          {pending ? "Posting…" : "Comment"}
        </Button>
      </div>
    </div>
  );
}
