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
  PRIORITIES,
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

const PRIORITY_LABELS: Record<(typeof PRIORITIES)[number], string> = {
  LOW: "Low",
  MEDIUM: "Medium",
  HIGH: "High",
  URGENT: "Urgent",
};

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
  const [requesterName, setRequesterName] = useState(requester.name);
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
      priority: "MEDIUM",
      department: requester.department ?? undefined,
    },
  });

  const onSubmit = (values: CreateTicketInput) => {
    if (uploading) {
      toast.error("Please wait for uploads to finish.");
      return;
    }
    if (!requesterName.trim()) {
      toast.error("Enter your name.");
      return;
    }
    startTransition(async () => {
      // Remember the requester's name + department for next time (best-effort).
      await updateMyProfile(requesterName.trim(), values.department);

      const res = await createTicket(values);
      if (!res.ok) {
        toast.error(res.error);
        return;
      }
      const { id, number } = res.data;

      let failed = 0;
      if (attachments.length > 0) {
        const results = await Promise.allSettled(
          attachments.map((m) => attachTo(id, null, m))
        );
        failed = results.filter(
          (r) => r.status === "rejected" || !r.value.ok
        ).length;
      }

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
      {/* Who's raising this — name + department */}
      <div className="grid gap-4 sm:grid-cols-2">
        <div>
          <Label htmlFor="requesterName">Your name</Label>
          <Input
            id="requesterName"
            value={requesterName}
            onChange={(e) => setRequesterName(e.target.value)}
            placeholder="Your full name"
            disabled={pending}
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
        <Label htmlFor="title">Summary</Label>
        <Input
          id="title"
          placeholder="Short summary of the issue"
          disabled={pending}
          {...register("title")}
        />
        <FieldError message={errors.title?.message} />
      </div>

      <div>
        <Label>Priority</Label>
        <Controller
          control={control}
          name="priority"
          render={({ field }) => (
            <Select
              value={field.value}
              onValueChange={field.onChange}
              disabled={pending}
            >
              <SelectTrigger className="w-full sm:max-w-xs">
                <SelectValue placeholder="Select priority" />
              </SelectTrigger>
              <SelectContent>
                {PRIORITIES.map((p) => (
                  <SelectItem key={p} value={p}>
                    {PRIORITY_LABELS[p]}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}
        />
        <p className="mt-1 text-xs text-text-muted">
          MIS may adjust this after triage.
        </p>
      </div>

      <div>
        <Label htmlFor="sheetLink">Sheet link (optional)</Label>
        <Input
          id="sheetLink"
          type="url"
          placeholder="https://docs.google.com/spreadsheets/…"
          disabled={pending}
          {...register("sheetLink")}
        />
        <p className="mt-1 text-xs text-text-muted">
          Link a Google Sheet, AppSheet, or Apps Script so MIS can jump to it.
        </p>
        <FieldError message={errors.sheetLink?.message} />
      </div>

      <div>
        <Label htmlFor="description">Describe the problem</Label>
        <Textarea
          id="description"
          rows={4}
          placeholder="What's happening, what you expected, and any steps to reproduce."
          disabled={pending}
          {...register("description")}
        />
        <FieldError message={errors.description?.message} />
      </div>

      <div>
        <Label>
          Attachments{" "}
          <span className="font-normal text-text-muted">(optional)</span>
        </Label>
        <FileDropzone
          onChange={setAttachments}
          onBusyChange={setUploading}
          disabled={pending}
          compact
        />
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
