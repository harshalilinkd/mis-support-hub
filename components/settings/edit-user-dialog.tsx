"use client";

import { useEffect, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Controller, useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { toast } from "sonner";
import type { z } from "zod";

import { adminUpdateUser } from "@/lib/actions/users";
import { DEPARTMENT_LABELS, DEPARTMENTS } from "@/lib/validators/ticket";
import {
  editUserFormSchema,
  type EditUserFormInput,
} from "@/lib/validators/user";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
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
import type { AdminUserView } from "./users-table";

type FormValues = z.input<typeof editUserFormSchema>;

const NO_DEPARTMENT = "none";

function Field({
  label,
  htmlFor,
  error,
  children,
}: {
  label: string;
  htmlFor?: string;
  error?: string;
  children: React.ReactNode;
}) {
  return (
    <div>
      <label htmlFor={htmlFor} className="mb-1 block text-sm font-medium">
        {label}
      </label>
      {children}
      {error ? <p className="mt-1 text-xs text-destructive">{error}</p> : null}
    </div>
  );
}

export function EditUserDialog({
  user,
  open,
  onOpenChange,
}: {
  user: AdminUserView;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  const {
    register,
    handleSubmit,
    control,
    reset,
    formState: { errors },
  } = useForm<FormValues, unknown, EditUserFormInput>({
    resolver: zodResolver(editUserFormSchema),
    defaultValues: {
      name: user.name ?? "",
      email: user.email,
      department: user.department,
    },
  });

  // Sync the form to the latest user data whenever the dialog opens (it stays
  // mounted per row, so props can change under it after a refresh).
  useEffect(() => {
    if (open) {
      reset({
        name: user.name ?? "",
        email: user.email,
        department: user.department,
      });
    }
  }, [open, user.id, user.name, user.email, user.department, reset]);

  const onSubmit = (values: EditUserFormInput) => {
    startTransition(async () => {
      const res = await adminUpdateUser({ userId: user.id, ...values });
      if (!res.ok) {
        toast.error(res.error);
        return;
      }
      toast.success("User updated");
      onOpenChange(false);
      router.refresh();
    });
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Edit user</DialogTitle>
          <DialogDescription>
            Update name, email, and department. Role and status are managed from
            the row.
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
          <Field label="Name" htmlFor="edit-user-name" error={errors.name?.message}>
            <Input
              id="edit-user-name"
              placeholder="Full name"
              autoComplete="off"
              disabled={pending}
              {...register("name")}
            />
          </Field>

          <Field label="Email" htmlFor="edit-user-email" error={errors.email?.message}>
            <Input
              id="edit-user-email"
              type="email"
              placeholder="name@company.com"
              autoComplete="off"
              disabled={pending}
              {...register("email")}
            />
          </Field>

          <Field label="Department" error={errors.department?.message}>
            <Controller
              control={control}
              name="department"
              render={({ field }) => (
                <Select
                  value={field.value ?? NO_DEPARTMENT}
                  onValueChange={(v) =>
                    field.onChange(v === NO_DEPARTMENT ? null : v)
                  }
                  disabled={pending}
                >
                  <SelectTrigger className="w-full">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value={NO_DEPARTMENT}>No department</SelectItem>
                    {DEPARTMENTS.map((d) => (
                      <SelectItem key={d} value={d}>
                        {DEPARTMENT_LABELS[d]}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              )}
            />
          </Field>

          <DialogFooter>
            <DialogClose asChild>
              <Button type="button" variant="ghost" disabled={pending}>
                Cancel
              </Button>
            </DialogClose>
            <Button type="submit" disabled={pending}>
              {pending ? "Saving…" : "Save changes"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
