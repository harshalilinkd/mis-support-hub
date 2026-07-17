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

/**
 * A field group. The eyebrow carries the grouping without a second description
 * line — the labels and placeholders already say what each field is, and this form
 * should fit the viewport rather than read like a document.
 *
 * `first-of-type` (not `first`) because the "requesting as" banner above is a div:
 * the first <section> genuinely is the first of its type, so the rule matches.
 */
function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="border-t border-border pt-3 first-of-type:border-t-0 first-of-type:pt-0">
      <h2 className="mb-2 text-xs font-semibold uppercase tracking-wider text-text-muted">
        {title}
      </h2>
      <div className="space-y-2.5">{children}</div>
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
      department: requester.department ?? undefined,
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
      className="space-y-3 rounded-[var(--radius-card)] border border-border bg-surface p-4 shadow-[var(--shadow-elevation)] sm:p-5"
    >
      <div className="truncate rounded-[var(--radius-input)] border border-border bg-surface-muted px-3 py-1.5 text-xs text-text-muted">
        Requesting as{" "}
        <span className="font-medium text-foreground">{requester.name}</span> ·{" "}
        {requester.email}
      </div>

      <Section title="What you need">
        <div className="grid gap-2.5 sm:grid-cols-2">
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
            rows={2}
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
      </Section>

      <Section title="Context">
        <div>
          <Label htmlFor="currentProcess" hint="optional">
            How it&apos;s handled today
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
        {/* Two single-line fields pair into one row — half the height of stacking. */}
        <div className="grid gap-2.5 sm:grid-cols-2">
          <div>
            <Label htmlFor="currentSheetLink" hint="optional">
              Sheet / app link
            </Label>
            <Input
              id="currentSheetLink"
              placeholder="Link to the sheet you use now"
              disabled={pending}
              {...register("currentSheetLink")}
            />
            <FieldError message={errors.currentSheetLink?.message} />
          </div>
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
        </div>
        {/* MIS sets the priority on claim and commits to a delivery date at
            start-work (§12.3) — the requester states the need, not the schedule. */}
      </Section>

      <Section title="Attachments">
        <FileDropzone
          onChange={setAttachments}
          onBusyChange={setUploading}
          disabled={pending}
          compact
        />
      </Section>

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
