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
  const [pending, startTransition] = useTransition();

  function submit() {
    const text = body.trim();
    if (!text) {
      toast.error("Write a comment first.");
      return;
    }
    startTransition(async () => {
      const res = await addComment(ticketId, text);
      if (!res.ok) {
        toast.error(res.error);
        return;
      }
      if (attachments.length > 0) {
        await Promise.all(
          attachments.map((m) => attachTo(ticketId, res.data.id, m))
        );
      }
      setBody("");
      setAttachments([]);
      setShowDrop(false);
      toast.success("Comment added");
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
      {showDrop ? <FileDropzone onChange={setAttachments} disabled={pending} /> : null}
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
        <Button type="button" onClick={submit} disabled={pending || !body.trim()}>
          {pending ? "Posting…" : "Comment"}
        </Button>
      </div>
    </div>
  );
}
