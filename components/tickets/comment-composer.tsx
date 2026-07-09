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

export function CommentComposer({
  ticketId,
  onDone,
}: {
  ticketId: string;
  onDone?: () => void;
}) {
  const router = useRouter();
  const [body, setBody] = useState("");
  const [attachments, setAttachments] = useState<AttachmentMeta[]>([]);
  const [showDrop, setShowDrop] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [pending, startTransition] = useTransition();

  function submit() {
    const text = body.trim();
    if (!text && attachments.length === 0) {
      toast.error("Write a comment or attach a file.");
      return;
    }
    if (uploading) {
      toast.error("Please wait for uploads to finish.");
      return;
    }
    startTransition(async () => {
      // With text: post a comment and hang the files off it. Attachment-only:
      // attach the files to the ticket itself (commentId null) so they show in
      // the Attachments section — no empty comment is created.
      let commentId: string | null = null;
      if (text) {
        const res = await addComment(ticketId, text);
        if (!res.ok) {
          toast.error(res.error);
          return;
        }
        commentId = res.data.id;
      }

      // Link uploaded files; a failed attach must not lose the success state
      // (the comment already exists) — surface a partial-failure warning.
      let failed = 0;
      if (attachments.length > 0) {
        const results = await Promise.allSettled(
          attachments.map((m) => attachTo(ticketId, commentId, m))
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
          text
            ? `Comment added, but ${failed} attachment(s) couldn't be attached.`
            : `${failed} attachment(s) couldn't be attached.`
        );
      } else {
        toast.success(text ? "Comment added" : "Attachment added");
      }
      router.refresh();
      onDone?.();
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
          disabled={pending || uploading || (!body.trim() && attachments.length === 0)}
        >
          {pending ? "Saving…" : body.trim() ? "Comment" : "Attach"}
        </Button>
      </div>
    </div>
  );
}
