"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Controller, useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { toast } from "sonner";
import { Send } from "lucide-react";
import type { z } from "zod";

import { UserAvatar } from "@/components/user-avatar";
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
 * A field group, introduced by a numbered step marker + eyebrow. The number turns a
 * flat form into a guided, three-step flow without a second description line — the
 * labels and placeholders already say what each field is.
 *
 * `first-of-type` (not `first`) because the identity header above is a div: the first
 * <section> genuinely is the first of its type, so the rule matches.
 */
function Section({
  step,
  title,
  children,
}: {
  step: number;
  title: string;
  children: React.ReactNode;
}) {
  return (
    <section className="border-t border-border pt-4 first-of-type:border-t-0 first-of-type:pt-0">
      <h2 className="mb-3 flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-text-muted">
        <span className="grid size-5 shrink-0 place-items-center rounded-full bg-accent-soft text-[11px] font-semibold text-primary tabular-nums">
          {step}
        </span>
        {title}
      </h2>
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
      requestedBy: "",
      currentProcess: "",
      currentSheetLink: "",
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
      className="space-y-5 overflow-hidden rounded-[var(--radius-card)] border border-border bg-surface p-5 shadow-[var(--shadow-elevation)] sm:p-6"
    >
      {/* Identity header — a designed strip that bleeds to the card edge, replacing the
          plain gray "requesting as" banner. Avatar + name + email, softly cobalt-tinted. */}
      <div className="-mx-5 -mt-5 flex items-center gap-3 border-b border-border bg-gradient-to-br from-accent-soft/70 to-surface px-5 py-4 sm:-mx-6 sm:-mt-6 sm:px-6">
        <UserAvatar
          name={requester.name}
          email={requester.email}
          className="size-10 shrink-0 ring-2 ring-surface shadow-[var(--shadow-elevation)]"
        />
        <div className="min-w-0">
          <div className="text-[11px] font-medium uppercase tracking-wider text-text-muted">
            Requesting as
          </div>
          <div className="truncate text-sm font-semibold text-foreground">
            {requester.name}
          </div>
          <div className="truncate text-xs text-text-muted">{requester.email}</div>
        </div>
      </div>

      <Section step={1} title="What you need">
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
        <div>
          <Label htmlFor="requestedBy">Who asked for this system?</Label>
          <Input
            id="requestedBy"
            placeholder="Name of the person who requested it — e.g. your manager or dept head"
            disabled={pending}
            {...register("requestedBy")}
          />
          <FieldError message={errors.requestedBy?.message} />
        </div>
      </Section>

      <Section step={2} title="Context">
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
        {/* MIS sets the priority on claim and commits to a delivery date at
            start-work (§12.3) — the requester states the need, not the schedule. */}
      </Section>

      <Section step={3} title="Attachments">
        <FileDropzone
          onChange={setAttachments}
          onBusyChange={setUploading}
          disabled={pending}
          compact
        />
      </Section>

      <div className="-mx-5 -mb-5 flex items-center justify-end gap-2 border-t border-border bg-surface-muted/40 px-5 py-4 sm:-mx-6 sm:-mb-6 sm:px-6">
        <Button type="button" variant="ghost" onClick={() => router.back()} disabled={pending}>
          Cancel
        </Button>
        <Button type="submit" disabled={pending || uploading} className="gap-2">
          <Send className="size-4" />
          {pending ? "Submitting…" : uploading ? "Uploading…" : "Submit request"}
        </Button>
      </div>
    </form>
  );
}
