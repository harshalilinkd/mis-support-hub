"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Archive, Pencil } from "lucide-react";
import { Controller, useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { toast } from "sonner";

import { archiveSystem, updateSystem } from "@/lib/actions/systems";
import type { AssignableUser, SystemDetail } from "@/lib/db/queries";
import {
  SYSTEM_STATUSES,
  SYSTEM_STATUS_LABELS,
  SYSTEM_TYPES,
  SYSTEM_TYPE_LABELS,
  updateSystemSchema,
  type UpdateSystemInput,
} from "@/lib/validators/systems";
import { DEPARTMENTS, DEPARTMENT_LABELS } from "@/lib/validators/ticket";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";

function FieldError({ message }: { message?: string }) {
  if (!message) return null;
  return <p className="mt-1 text-xs text-destructive">{message}</p>;
}

function Label({ children, htmlFor }: { children: React.ReactNode; htmlFor?: string }) {
  return (
    <label htmlFor={htmlFor} className="mb-1 block text-sm font-medium">
      {children}
    </label>
  );
}

/**
 * MIS-only edit + archive for a system (§13.3).
 *
 * `linked_ticket_id` and the access checklist are deliberately absent: updateSystem
 * accepts neither (§13.6), because the compliance trail is a record of what was
 * attested at creation and must not be editable after the fact.
 */
export function SystemActions({
  system,
  owners,
}: {
  system: SystemDetail;
  owners: AssignableUser[];
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [dialog, setDialog] = useState<null | "edit" | "archive">(null);

  const {
    register,
    handleSubmit,
    control,
    reset,
    formState: { errors },
  } = useForm<UpdateSystemInput>({
    resolver: zodResolver(updateSystemSchema),
  });

  /**
   * Seed the form from the live row and open, in one gesture.
   *
   * Deliberately NOT a useEffect keyed on `system`: AutoRefresh calls
   * router.refresh() every 15s, which re-renders this server-rendered prop with a
   * new object identity. An effect would fire on every tick and reset() the form
   * out from under someone mid-edit — losing their typing roughly every 15 seconds.
   * Seeding on open gets the same freshness with no such window.
   */
  const openEdit = () => {
    reset({
      id: system.id,
      name: system.name,
      systemType: system.systemType,
      department: system.department,
      ownerId: system.ownerId,
      frontendUrl: system.frontendUrl,
      backendUrl: system.backendUrl ?? "",
      notes: system.notes ?? "",
      status: system.status,
    });
    setDialog("edit");
  };

  const onSave = (values: UpdateSystemInput) => {
    startTransition(async () => {
      const res = await updateSystem(values);
      if (!res.ok) {
        toast.error(res.error);
        return;
      }
      toast.success("System updated");
      setDialog(null);
      router.refresh();
    });
  };

  const onArchive = () => {
    startTransition(async () => {
      const res = await archiveSystem(system.id);
      if (!res.ok) {
        toast.error(res.error);
        return;
      }
      toast.success(`${system.code} archived`);
      setDialog(null);
      router.refresh();
    });
  };

  return (
    <>
      <div className="flex flex-wrap items-center gap-2 rounded-[var(--radius-input)] border border-border bg-surface-muted/50 p-2.5">
        <Button size="sm" disabled={pending} onClick={openEdit}>
          <Pencil className="size-4" /> Edit
        </Button>
        {system.status !== "ARCHIVED" ? (
          <Button
            size="sm"
            variant="outline"
            disabled={pending}
            onClick={() => setDialog("archive")}
          >
            <Archive className="size-4" /> Archive
          </Button>
        ) : null}
      </div>

      <Dialog open={dialog === "edit"} onOpenChange={(o) => !o && setDialog(null)}>
        <DialogContent className="sm:max-w-xl">
          <DialogHeader>
            <DialogTitle>Edit {system.code}</DialogTitle>
          </DialogHeader>
          <form onSubmit={handleSubmit(onSave)} className="space-y-2.5">
            <div className="grid gap-2.5 sm:grid-cols-2">
              <div>
                <Label htmlFor="edit-name">System name</Label>
                <Input id="edit-name" disabled={pending} {...register("name")} />
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
                        <SelectValue />
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
                        <SelectValue />
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
              </div>
              <div>
                <Label>Owner</Label>
                <Controller
                  control={control}
                  name="ownerId"
                  render={({ field }) => (
                    <Select value={field.value} onValueChange={field.onChange} disabled={pending}>
                      <SelectTrigger className="w-full">
                        <SelectValue />
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
              </div>
            </div>

            <div>
              <Label htmlFor="edit-frontend">Frontend URL</Label>
              <Input id="edit-frontend" disabled={pending} {...register("frontendUrl")} />
              <FieldError message={errors.frontendUrl?.message} />
            </div>
            <div>
              <Label htmlFor="edit-backend">Backend URL</Label>
              <Input id="edit-backend" disabled={pending} {...register("backendUrl")} />
              <FieldError message={errors.backendUrl?.message} />
            </div>
            <div>
              <Label htmlFor="edit-notes">Notes</Label>
              <Textarea id="edit-notes" rows={2} disabled={pending} {...register("notes")} />
              <FieldError message={errors.notes?.message} />
            </div>
            <div>
              <Label>Status</Label>
              <Controller
                control={control}
                name="status"
                render={({ field }) => (
                  <Select value={field.value} onValueChange={field.onChange} disabled={pending}>
                    <SelectTrigger className="w-full">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {SYSTEM_STATUSES.map((s) => (
                        <SelectItem key={s} value={s}>
                          {SYSTEM_STATUS_LABELS[s]}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                )}
              />
            </div>

            <DialogFooter>
              <Button
                type="button"
                variant="ghost"
                onClick={() => setDialog(null)}
                disabled={pending}
              >
                Cancel
              </Button>
              <Button type="submit" disabled={pending}>
                {pending ? "Saving…" : "Save changes"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      <Dialog open={dialog === "archive"} onOpenChange={(o) => !o && setDialog(null)}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Archive {system.code}?</DialogTitle>
          </DialogHeader>
          <p className="text-sm text-text-muted">
            It stays in the directory as a retired record — nothing is deleted, and its
            links and access trail remain readable. You can set it back to Active from
            Edit at any time.
          </p>
          <DialogFooter>
            <Button
              type="button"
              variant="ghost"
              onClick={() => setDialog(null)}
              disabled={pending}
            >
              Cancel
            </Button>
            <Button type="button" onClick={onArchive} disabled={pending}>
              {pending ? "Archiving…" : "Archive"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
