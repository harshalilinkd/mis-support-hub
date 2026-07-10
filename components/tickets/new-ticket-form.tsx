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
  const [uploading, setUploading] = useState(false);
  const [pending, startTransition] = useTransition();

  const {
    register,
    handleSubmit,
    control,
    formState: { errors },
  } = useForm<FormValues, unknown, CreateTicketInput>({
    resolver: zodResolver(createTicketSchema),
    defaultValues: {
      title: "",
      description: "",
      sheetLink: "",
      // Priority is set by the MIS team when they claim the ticket, not here.
      priority: "MEDIUM",
      department: requester.department ?? undefined,
    },
  });

  const onSubmit = (values: CreateTicketInput) => {
    if (uploading) {
      toast.error("Please wait for uploads to finish.");
      return;
    }
    if (attachments.length === 0) {
      toast.error("Please attach at least one file (a screenshot, sheet, or PDF).");
      return;
    }
    startTransition(async () => {
      // Remember the requester's department for next time (name is fixed to the
      // signed-in account). Best-effort.
      await updateMyProfile(requester.name, values.department);

      const res = await createTicket(values);
      if (!res.ok) {
        toast.error(res.error);
        return;
      }
      const { id, number } = res.data;

      const results = await Promise.allSettled(
        attachments.map((m) => attachTo(id, null, m))
      );
      const failed = results.filter(
        (r) => r.status === "rejected" || !r.value.ok
      ).length;

      if (failed > 0) {
        toast.warning(
          `Ticket ${number} created, but ${failed} attachment(s) couldn't be attached — reattach them on the ticket.`
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
      className="space-y-4 rounded-[var(--radius-card)] border border-border bg-surface p-5 shadow-[var(--shadow-elevation)]"
    >
      {/* Who's raising this — name (locked to the account) + department */}
      <div className="grid gap-4 sm:grid-cols-2">
        <div>
          <Label htmlFor="requesterName">Your name</Label>
          <Input
            id="requesterName"
            value={requester.name}
            readOnly
            aria-readonly
            tabIndex={-1}
            className="cursor-not-allowed bg-surface-muted text-text-muted"
          />
          <p className="mt-1 truncate text-xs text-text-muted">
            Signed in as {requester.email}
          </p>
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
          placeholder="Sheet URL, web app URL, or the system name (e.g. Data entry Interface)"
          disabled={pending}
          {...register("sheetLink")}
        />
        <p className="mt-1 text-xs text-text-muted">
          The sheet, app, or system the issue is about — paste a link or just type
          its name.
        </p>
        <FieldError message={errors.sheetLink?.message} />
      </div>

      <div>
        <Label htmlFor="description">Describe the problem / Summary</Label>
        <Textarea
          id="description"
          rows={4}
          placeholder="Explain the issue in detail — what's happening, what you expected, and any steps to reproduce."
          disabled={pending}
          {...register("description")}
        />
        <FieldError message={errors.description?.message} />
      </div>

      <div>
        <Label>
          Attachments <span className="text-destructive">*</span>
        </Label>
        <FileDropzone
          onChange={setAttachments}
          onBusyChange={setUploading}
          disabled={pending}
          compact
        />
        {attachments.length === 0 ? (
          <p className="mt-1 text-xs text-text-muted">
            At least one image or PDF is required — e.g. a screenshot of the issue.
          </p>
        ) : null}
      </div>

      <div className="-mx-5 flex justify-end gap-2 border-t border-border px-5 pt-4">
        <Button
          type="button"
          variant="ghost"
          onClick={() => router.back()}
          disabled={pending}
        >
          Cancel
        </Button>
        <Button type="submit" disabled={pending || uploading}>
          {pending ? "Creating…" : uploading ? "Uploading…" : "Raise ticket"}
        </Button>
      </div>
    </form>
  );
}
