"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Controller, useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { toast } from "sonner";
import type { z } from "zod";

import { attachTo } from "@/lib/actions/attachments";
import { createTicket } from "@/lib/actions/tickets";
import { updateMyProfile } from "@/lib/actions/users";
import type { AttachmentMeta } from "@/lib/attachments";
import type { Department } from "@/lib/db/schema";
import {
  createTicketSchema,
  DEPARTMENT_LABELS,
  DEPARTMENTS,
  type CreateTicketInput,
} from "@/lib/validators/ticket";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { FileDropzone } from "./file-dropzone";
import { VoiceRecorder } from "./voice-recorder";

type FormValues = z.input<typeof createTicketSchema>;

function FieldError({ message }: { message?: string }) {
  if (!message) return null;
  return <p className="mt-1 text-xs text-destructive">{message}</p>;
}

function Label({
  children,
  htmlFor,
}: {
  children: React.ReactNode;
  htmlFor?: string;
}) {
  return (
    <label htmlFor={htmlFor} className="mb-1 block text-sm font-medium">
      {children}
    </label>
  );
}

export function NewTicketForm({
  requester,
}: {
  requester: { name: string; email: string; department: Department | null };
}) {
  const router = useRouter();
  const [attachments, setAttachments] = useState<AttachmentMeta[]>([]);
  const [voiceNote, setVoiceNote] = useState<AttachmentMeta | null>(null);
  const [uploading, setUploading] = useState(false);
  const [voiceBusy, setVoiceBusy] = useState(false);
  const [pending, startTransition] = useTransition();
  // The dropzone isn't a react-hook-form field, so its requirement is tracked here
  // and rendered next to the dropzone (not as a toast the user has to remember).
  const [fileError, setFileError] = useState<string | null>(null);

  // Either an upload path can be in flight; block submit until both are idle.
  const busy = uploading || voiceBusy;

  const {
    register,
    handleSubmit,
    control,
    setError,
    clearErrors,
    formState: { errors },
  } = useForm<FormValues, unknown, CreateTicketInput>({
    resolver: zodResolver(createTicketSchema),
    defaultValues: {
      title: "",
      description: "",
      sheetLink: "",
      department: requester.department ?? undefined,
    },
  });

  const onSubmit = (values: CreateTicketInput) => {
    if (busy) {
      toast.error("Please wait for the recording/uploads to finish.");
      return;
    }
    // Both get stored as attachments, but they are TWO SEPARATE requirements and
    // must never be pooled into one count (doing so let a voice note stand in for
    // the mandatory file, and made a file stand in for the description):
    //   · a file attachment (screenshot/PDF) is REQUIRED, always;
    //   · the voice note is OPTIONAL — an alternative to typing, nothing more.
    const allAttachments = voiceNote ? [...attachments, voiceNote] : attachments;

    // Describe the problem: typed text OR a voice note — either alone is enough,
    // and a voice note is never required on top of text.
    const hasText = values.description.trim().length > 0;
    const missingDescription = !hasText && !voiceNote;
    // Only real files count here — the voice note does NOT satisfy this.
    const missingFile = attachments.length === 0;

    if (missingDescription) {
      setError("description", {
        type: "manual",
        message: "Describe the problem — type it here, or record a voice note.",
      });
    }
    if (missingFile) {
      setFileError("Attach at least one screenshot or PDF.");
    }
    if (missingDescription || missingFile) {
      toast.error(
        missingDescription && missingFile
          ? "Describe the problem (type it or record it) and attach a screenshot or PDF."
          : missingDescription
            ? "Describe the problem — type it in, or record a voice note."
            : "Attach at least one screenshot or PDF."
      );
      return;
    }
    // A voice-only ticket has no typed body — give MIS a hint to play the audio.
    const description = hasText
      ? values.description
      : "🎤 Voice note attached — please listen to the recording below.";
    startTransition(async () => {
      // Remember the requester's department for next time (name is fixed to the
      // signed-in account). Best-effort.
      await updateMyProfile(requester.name, values.department);

      const res = await createTicket({ ...values, description });
      if (!res.ok) {
        toast.error(res.error);
        return;
      }
      const { id, number } = res.data;

      const results = await Promise.allSettled(
        allAttachments.map((m) => attachTo(id, null, m))
      );
      const failed = results.filter(
        (r) => r.status === "rejected" || !r.value.ok
      ).length;

      if (failed > 0) {
        toast.warning(
          `Ticket ${number} created, but ${failed} attachment(s) couldn't be saved. Open the ticket to check — you may need to raise it again if the recording is missing.`
        );
      } else {
        toast.success(`Ticket ${number} created`);
      }
      router.push(`/tickets/${number}`);
    });
  };

  return (
    <form
      onSubmit={handleSubmit(onSubmit)}
      className="space-y-3 rounded-[var(--radius-card)] border border-border bg-surface p-4 shadow-[var(--shadow-elevation)] sm:p-5"
    >
      {/* Who's raising this — a compact locked banner (name is fixed to the
          signed-in account) + the department field. */}
      <div className="truncate rounded-[var(--radius-input)] border border-border bg-surface-muted px-3 py-2 text-xs text-text-muted">
        Raising as{" "}
        <span className="font-medium text-foreground">{requester.name}</span> ·{" "}
        {requester.email}
      </div>
      <div>
        <Label>Department</Label>
        <Controller
          control={control}
          name="department"
          render={({ field }) => (
            <Select
              value={field.value}
              onValueChange={field.onChange}
              disabled={pending}
            >
              <SelectTrigger className="w-full">
                <SelectValue placeholder="Select department" />
              </SelectTrigger>
              <SelectContent>
                {DEPARTMENTS.map((d) => (
                  <SelectItem key={d} value={d}>
                    {DEPARTMENT_LABELS[d]}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}
        />
        <FieldError message={errors.department?.message} />
      </div>

      <div>
        <Label htmlFor="title">Subject</Label>
        <Input
          id="title"
          placeholder="A short one-line title for the issue"
          disabled={pending}
          {...register("title")}
        />
        <FieldError message={errors.title?.message} />
      </div>

      <div>
        <Label htmlFor="sheetLink">
          Sheet link / System <span className="text-destructive">*</span>
        </Label>
        <Input
          id="sheetLink"
          placeholder="Sheet/app URL, or just the system name"
          disabled={pending}
          {...register("sheetLink")}
        />
        <p className="mt-1 text-xs text-text-muted">
          Paste a link, or just type the system’s name.
        </p>
        <FieldError message={errors.sheetLink?.message} />
      </div>

      <div>
        <Label htmlFor="description">
          Describe the problem / Summary{" "}
          <span className="text-destructive">*</span>
        </Label>
        <Textarea
          id="description"
          rows={3}
          placeholder="What's happening, what you expected, and any steps to reproduce."
          disabled={pending}
          {...register("description", {
            onChange: () => clearErrors("description"),
          })}
        />
        <p className="mt-1 text-xs text-text-muted">
          Type it here <span className="font-medium">or</span> record a voice
          note — either one is enough.
        </p>
        <FieldError message={errors.description?.message} />
        {/* Accessibility: not everyone is comfortable typing — record the issue
            as a voice note instead. A voice note STANDS IN for the text; it is
            never required alongside it. */}
        <VoiceRecorder
          onChange={(meta) => {
            setVoiceNote(meta);
            if (meta) clearErrors("description");
          }}
          onBusyChange={setVoiceBusy}
          disabled={pending}
        />
      </div>

      <div>
        <Label>
          Attachments <span className="text-destructive">*</span>
        </Label>
        <FileDropzone
          onChange={(files) => {
            setAttachments(files);
            if (files.length > 0) setFileError(null);
          }}
          onBusyChange={setUploading}
          disabled={pending}
          compact
        />
        {attachments.length === 0 ? (
          <p className="mt-1 text-xs text-text-muted">
            Required — attach at least one screenshot or PDF of the problem.
          </p>
        ) : null}
        <FieldError message={fileError ?? undefined} />
      </div>

      <div className="-mx-4 flex justify-end gap-2 border-t border-border px-4 pt-3 sm:-mx-5 sm:px-5">
        <Button
          type="button"
          variant="ghost"
          onClick={() => router.back()}
          disabled={pending}
        >
          Cancel
        </Button>
        <Button type="submit" disabled={pending || busy}>
          {pending ? "Creating…" : busy ? "Uploading…" : "Raise ticket"}
        </Button>
      </div>
    </form>
  );
}
