"use client";

import { useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ShieldAlert } from "lucide-react";
import { Controller, useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { toast } from "sonner";
import type { z } from "zod";

import { createSystem } from "@/lib/actions/systems";
import type { AssignableUser } from "@/lib/db/queries";
import type { SessionUser } from "@/lib/session";
import {
  SYSTEM_TYPES,
  SYSTEM_TYPE_LABELS,
  createSystemSchema,
  type CreateSystemInput,
} from "@/lib/validators/systems";
import { DEPARTMENTS, DEPARTMENT_LABELS } from "@/lib/validators/ticket";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";

type FormValues = z.input<typeof createSystemSchema>;

export type GranteeOption = { id: string; label: string };

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

/**
 * Blocked state (§13.4). With no active grantees the server refuses every create, so
 * showing a submittable form would only produce a rejection after the user typed
 * everything. Fail closed in the UI the way the server does — and say who can fix it.
 */
function NoGranteesBlocked({ isAdmin }: { isAdmin: boolean }) {
  return (
    <div className="rounded-[var(--radius-card)] border border-border bg-surface p-6 shadow-[var(--shadow-elevation)]">
      <div className="flex items-start gap-3">
        <span className="mt-0.5 rounded-[var(--radius-input)] bg-surface-muted p-2 text-text-muted">
          <ShieldAlert className="size-5" />
        </span>
        <div className="min-w-0">
          <h2 className="text-sm font-semibold">No access-grantees configured</h2>
          <p className="mt-1 text-sm text-text-muted">
            A system can&apos;t be logged until at least one access-grantee exists — the
            sharing checklist is what makes the record accountable.
          </p>
          <div className="mt-4 flex flex-wrap gap-2">
            {isAdmin ? (
              <Button asChild size="sm">
                <Link href="/settings/grantees">Configure access-grantees</Link>
              </Button>
            ) : (
              <p className="text-sm text-text-muted">
                Ask an MIS admin to add one in Settings → Access grantees.
              </p>
            )}
            <Button asChild size="sm" variant="ghost">
              <Link href="/systems">Back to the directory</Link>
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}

export function SystemForm({
  owners,
  grantees,
  currentUser,
  linkedTicketId,
  defaultName,
  defaultDepartment,
}: {
  owners: AssignableUser[];
  grantees: GranteeOption[];
  currentUser: SessionUser;
  /** Pre-fill when logging off the back of a REQUEST (§13.5). */
  linkedTicketId?: string;
  defaultName?: string;
  defaultDepartment?: (typeof DEPARTMENTS)[number];
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  const {
    register,
    handleSubmit,
    control,
    watch,
    formState: { errors },
  } = useForm<FormValues, unknown, CreateSystemInput>({
    resolver: zodResolver(createSystemSchema),
    defaultValues: {
      name: defaultName ?? "",
      systemType: undefined,
      department: defaultDepartment ?? undefined,
      ownerId: undefined,
      frontendUrl: "",
      backendUrl: "",
      notes: "",
      linkedTicketId,
      // Seed a real boolean per grantee — an undefined `checked` would flip the
      // checkbox from uncontrolled to controlled and warn.
      confirmations: grantees.map((g) => ({ granteeId: g.id, confirmed: false })),
    },
  });

  // The schema deliberately does NOT enforce "all confirmed" (the server owns that
  // rule, §13.4), so the submit gate is computed here for immediate feedback.
  const confirmations = watch("confirmations");
  const allConfirmed =
    grantees.length > 0 && confirmations?.every((c) => c.confirmed === true);

  if (grantees.length === 0) {
    return <NoGranteesBlocked isAdmin={currentUser.role === "MIS_ADMIN"} />;
  }

  const onSubmit = (values: CreateSystemInput) => {
    startTransition(async () => {
      const res = await createSystem(values);
      if (!res.ok) {
        toast.error(res.error);
        return;
      }
      toast.success(`${res.data.code} logged`);
      router.push(`/systems/${res.data.code}`);
    });
  };

  return (
    <form
      onSubmit={handleSubmit(onSubmit)}
      className="space-y-3 rounded-[var(--radius-card)] border border-border bg-surface p-4 shadow-[var(--shadow-elevation)] sm:p-5"
    >
      <Section title="The system">
        <div className="grid gap-2.5 sm:grid-cols-2">
          <div>
            <Label htmlFor="name">System name</Label>
            <Input
              id="name"
              placeholder="e.g. Purchase Order System"
              disabled={pending}
              {...register("name")}
            />
            <FieldError message={errors.name?.message} />
          </div>
          <div>
            <Label>Type</Label>
            <Controller
              control={control}
              name="systemType"
              render={({ field }) => (
                <Select value={field.value} onValueChange={field.onChange} disabled={pending}>
                  <SelectTrigger className="w-full">
                    <SelectValue placeholder="What kind of system?" />
                  </SelectTrigger>
                  <SelectContent>
                    {SYSTEM_TYPES.map((t) => (
                      <SelectItem key={t} value={t}>
                        {SYSTEM_TYPE_LABELS[t]}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              )}
            />
            <FieldError message={errors.systemType?.message} />
          </div>
        </div>

        <div className="grid gap-2.5 sm:grid-cols-2">
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
          <div>
            <Label>Owner</Label>
            <Controller
              control={control}
              name="ownerId"
              render={({ field }) => (
                <Select value={field.value} onValueChange={field.onChange} disabled={pending}>
                  <SelectTrigger className="w-full">
                    <SelectValue placeholder="Who owns it day-to-day?" />
                  </SelectTrigger>
                  <SelectContent>
                    {owners.map((o) => (
                      <SelectItem key={o.id} value={o.id}>
                        {o.name ?? o.email ?? "—"}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              )}
            />
            <FieldError message={errors.ownerId?.message} />
          </div>
        </div>
      </Section>

      <Section title="Links">
        <div>
          <Label htmlFor="frontendUrl">Frontend URL</Label>
          <Input
            id="frontendUrl"
            placeholder="https://… — the link people actually open"
            disabled={pending}
            {...register("frontendUrl")}
          />
          <FieldError message={errors.frontendUrl?.message} />
        </div>
        <div>
          <Label htmlFor="backendUrl" hint="optional">
            Backend URL
          </Label>
          <Input
            id="backendUrl"
            placeholder="https://… — the sheet, script, or console behind it"
            disabled={pending}
            {...register("backendUrl")}
          />
          <FieldError message={errors.backendUrl?.message} />
        </div>
        <div>
          <Label htmlFor="notes" hint="optional">
            Notes
          </Label>
          <Textarea
            id="notes"
            rows={2}
            placeholder="Anything the next person needs to know."
            disabled={pending}
            {...register("notes")}
          />
          <FieldError message={errors.notes?.message} />
        </div>
      </Section>

      <Section title="Access sharing confirmation">
        <p className="text-xs text-text-muted">
          This is a self-confirmation, recorded against your name.
        </p>
        <div className="space-y-2 rounded-[var(--radius-input)] border border-border bg-surface-muted/50 p-3">
          {grantees.map((g, i) => (
            <div key={g.id} className="flex items-start gap-2.5">
              <Controller
                control={control}
                name={`confirmations.${i}.confirmed`}
                render={({ field }) => (
                  <Checkbox
                    id={`grantee-${g.id}`}
                    checked={field.value}
                    // onCheckedChange emits boolean | "indeterminate"; the schema
                    // wants a strict boolean.
                    onCheckedChange={(v) => field.onChange(v === true)}
                    onBlur={field.onBlur}
                    ref={field.ref}
                    disabled={pending}
                    className="mt-0.5"
                  />
                )}
              />
              <label
                htmlFor={`grantee-${g.id}`}
                className="cursor-pointer select-none text-sm leading-snug"
              >
                I have shared this system and granted access to{" "}
                <span className="font-medium">{g.label}</span>
              </label>
            </div>
          ))}
        </div>
        {!allConfirmed ? (
          <p className="text-xs text-text-muted">
            Confirm every person above to enable submitting.
          </p>
        ) : null}
      </Section>

      <div className="-mx-4 flex justify-end gap-2 border-t border-border px-4 pt-3 sm:-mx-5 sm:px-5">
        <Button type="button" variant="ghost" onClick={() => router.back()} disabled={pending}>
          Cancel
        </Button>
        {/* The server re-validates the whole checklist regardless (§13.4) — this
            only spares the user a round-trip. */}
        <Button type="submit" disabled={pending || !allConfirmed}>
          {pending ? "Logging…" : "Log system"}
        </Button>
      </div>
    </form>
  );
}
