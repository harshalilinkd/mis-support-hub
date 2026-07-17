"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Controller, useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { toast } from "sonner";
import type { z } from "zod";

import { attachTo } from "@/lib/actions/attachments";
import { createRequest } from "@/lib/actions/requests";
import { updateMyProfile } from "@/lib/actions/users";
import type { AttachmentMeta } from "@/lib/attachments";
import type { Department } from "@/lib/db/schema";
import {
  createRequestSchema,
  DEPARTMENT_LABELS,
  DEPARTMENTS,
  PRIORITIES,
  type CreateRequestInput,
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

type FormValues = z.input<typeof createRequestSchema>;

const URGENCY_LABELS: Record<(typeof PRIORITIES)[number], string> = {
  LOW: "Low — nice to have",
  MEDIUM: "Medium — would help",
  HIGH: "High — needed soon",
  URGENT: "Urgent — blocking work",
};

function FieldError({ message }: { message?: string }) {
  if (!message) return null;
  return <p className="mt-1 text-xs text-destructive">{message}</p>;
}

function Label({
  children,
  htmlFor,
  hint,
}: {
  children: React.ReactNode;
  htmlFor?: string;
  hint?: string;
}) {
  return (
    <label htmlFor={htmlFor} className="mb-1 block text-sm font-medium">
      {children}
      {hint ? <span className="ml-1 font-normal text-text-muted">· {hint}</span> : null}
    </label>
  );
}

/** A titled group of related fields (§12.7 intake grouping). */
function Group({
  title,
  description,
  children,
}: {
  title: string;
  description: string;
  children: React.ReactNode;
}) {
  return (
    // A Group is never the first child (the "requesting as" banner is), so a
    // `first:` modifier would never match — the divider is drawn unconditionally.
    <section className="border-t border-border pt-4">
      <h2 className="font-display text-sm font-semibold">{title}</h2>
      <p className="mb-3 text-xs text-text-muted">{description}</p>
      <div className="space-y-3">{children}</div>
    </section>
  );
}

export function RequestForm({
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
  } = useForm<FormValues, unknown, CreateRequestInput>({
    resolver: zodResolver(createRequestSchema),
    defaultValues: {
      systemName: "",
      problemStatement: "",
      expectedBenefit: "",
      currentProcess: "",
      currentSheetLink: "",
      intendedUsers: "",
      urgency: undefined,
      department: requester.department ?? undefined,
      targetDate: "",
    },
  });

  const onSubmit = (values: CreateRequestInput) => {
    if (uploading) {
      toast.error("Please wait for the uploads to finish.");
      return;
    }
    startTransition(async () => {
      // Remember the requester's department for next time (best-effort).
      await updateMyProfile(requester.name, values.department);

      const res = await createRequest(values);
      if (!res.ok) {
        toast.error(res.error);
        return;
      }
      const { id, number } = res.data;

      // Link uploads with the shared P4 attachment action (same flow as the
      // raise-ticket form) — a failed attach must not lose the created request.
      let failed = 0;
      if (attachments.length > 0) {
        const results = await Promise.allSettled(
          attachments.map((m) => attachTo(id, null, m))
        );
        failed = results.filter((r) => r.status === "rejected" || !r.value.ok).length;
      }

      if (failed > 0) {
        toast.warning(
          `Request ${number} submitted, but ${failed} attachment(s) couldn't be saved.`
        );
      } else {
        toast.success(`Request ${number} submitted`);
      }
      router.push(`/tickets/${number}`);
    });
  };

  return (
    <form
      onSubmit={handleSubmit(onSubmit)}
      className="space-y-4 rounded-[var(--radius-card)] border border-border bg-surface p-4 shadow-[var(--shadow-elevation)] sm:p-5"
    >
      <div className="truncate rounded-[var(--radius-input)] border border-border bg-surface-muted px-3 py-2 text-xs text-text-muted">
        Requesting as{" "}
        <span className="font-medium text-foreground">{requester.name}</span> ·{" "}
        {requester.email}
      </div>

      <Group title="What you need" description="The system you're asking for and why it matters.">
        <div className="grid gap-3 sm:grid-cols-2">
          <div>
            <Label htmlFor="systemName">System name</Label>
            <Input
              id="systemName"
              placeholder="e.g. Purchase Order System"
              disabled={pending}
              {...register("systemName")}
            />
            <FieldError message={errors.systemName?.message} />
          </div>
          <div>
            <Label>Department</Label>
            <Controller
              control={control}
              name="department"
              render={({ field }) => (
                <Select value={field.value} onValueChange={field.onChange} disabled={pending}>
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
          <Label htmlFor="problemStatement">Problem it solves</Label>
          <Textarea
            id="problemStatement"
            rows={3}
            placeholder="The pain point today, and what a new system would fix."
            disabled={pending}
            {...register("problemStatement")}
          />
          <FieldError message={errors.problemStatement?.message} />
        </div>
        <div>
          <Label htmlFor="expectedBenefit">Expected benefit</Label>
          <Textarea
            id="expectedBenefit"
            rows={2}
            placeholder="Time saved, errors avoided, visibility gained…"
            disabled={pending}
            {...register("expectedBenefit")}
          />
          <FieldError message={errors.expectedBenefit?.message} />
        </div>
      </Group>

      <Group title="Today's process" description="How this is handled right now, if at all.">
        <div>
          <Label htmlFor="currentProcess" hint="optional">
            Current process
          </Label>
          <Textarea
            id="currentProcess"
            rows={2}
            placeholder="The current manual/sheet process, if any."
            disabled={pending}
            {...register("currentProcess")}
          />
          <FieldError message={errors.currentProcess?.message} />
        </div>
        <div>
          <Label htmlFor="currentSheetLink" hint="optional">
            Sheet / app link
          </Label>
          <Input
            id="currentSheetLink"
            placeholder="Link to the sheet or app you use now"
            disabled={pending}
            {...register("currentSheetLink")}
          />
          <FieldError message={errors.currentSheetLink?.message} />
        </div>
      </Group>

      <Group title="Who & when" description="Who will use it, and how soon you need it.">
        <div className="grid gap-3 sm:grid-cols-2">
          <div>
            <Label htmlFor="intendedUsers">Intended users</Label>
            <Input
              id="intendedUsers"
              placeholder="e.g. Purchase team, store managers"
              disabled={pending}
              {...register("intendedUsers")}
            />
            <FieldError message={errors.intendedUsers?.message} />
          </div>
          <div>
            <Label>Urgency</Label>
            <Controller
              control={control}
              name="urgency"
              render={({ field }) => (
                <Select value={field.value} onValueChange={field.onChange} disabled={pending}>
                  <SelectTrigger className="w-full">
                    <SelectValue placeholder="How urgent is it?" />
                  </SelectTrigger>
                  <SelectContent>
                    {PRIORITIES.map((p) => (
                      <SelectItem key={p} value={p}>
                        {URGENCY_LABELS[p]}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              )}
            />
            <FieldError message={errors.urgency?.message} />
          </div>
        </div>
        <div>
          <Label htmlFor="targetDate" hint="optional">
            Needed by
          </Label>
          <Input id="targetDate" type="date" disabled={pending} {...register("targetDate")} />
          <FieldError message={errors.targetDate?.message} />
        </div>
      </Group>

      <Group title="Attachments" description="Anything that helps — a mock-up, a sample sheet, a screenshot.">
        <FileDropzone
          onChange={setAttachments}
          onBusyChange={setUploading}
          disabled={pending}
          compact
        />
      </Group>

      <div className="-mx-4 flex justify-end gap-2 border-t border-border px-4 pt-3 sm:-mx-5 sm:px-5">
        <Button type="button" variant="ghost" onClick={() => router.back()} disabled={pending}>
          Cancel
        </Button>
        <Button type="submit" disabled={pending || uploading}>
          {pending ? "Submitting…" : uploading ? "Uploading…" : "Submit request"}
        </Button>
      </div>
    </form>
  );
}
