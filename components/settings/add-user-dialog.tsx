"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Controller, useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { toast } from "sonner";
import { UserPlus } from "lucide-react";
import type { z } from "zod";

import { adminCreateUser } from "@/lib/actions/users";
import { ROLE_LABELS, ROLES } from "@/lib/roles";
import { DEPARTMENT_LABELS, DEPARTMENTS } from "@/lib/validators/ticket";
import { createUserSchema, type CreateUserInput } from "@/lib/validators/user";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

type FormValues = z.input<typeof createUserSchema>;

const NO_DEPARTMENT = "none";

function Field({
  label,
  htmlFor,
  error,
  children,
  hint,
}: {
  label: string;
  htmlFor?: string;
  error?: string;
  children: React.ReactNode;
  hint?: string;
}) {
  return (
    <div>
      <label htmlFor={htmlFor} className="mb-1 block text-sm font-medium">
        {label}
      </label>
      {children}
      {error ? (
        <p className="mt-1 text-xs text-destructive">{error}</p>
      ) : hint ? (
        <p className="mt-1 text-xs text-text-muted">{hint}</p>
      ) : null}
    </div>
  );
}

export function AddUserDialog() {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [pending, startTransition] = useTransition();

  const {
    register,
    handleSubmit,
    control,
    reset,
    formState: { errors },
  } = useForm<FormValues, unknown, CreateUserInput>({
    resolver: zodResolver(createUserSchema),
    defaultValues: {
      name: "",
      email: "",
      password: "",
      role: "USER",
      department: null,
    },
  });

  function onOpenChange(next: boolean) {
    setOpen(next);
    if (!next) reset();
  }

  const onSubmit = (values: CreateUserInput) => {
    startTransition(async () => {
      const res = await adminCreateUser(values);
      if (!res.ok) {
        toast.error(res.error);
        return;
      }
      toast.success(`${values.name} added`);
      reset();
      setOpen(false);
      router.refresh();
    });
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogTrigger asChild>
        <Button size="sm">
          <UserPlus className="size-4" /> Add user
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Add user</DialogTitle>
          <DialogDescription>
            Creates an email + password account. Share the password with them —
            they sign in on the login page.
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
          <Field label="Name" htmlFor="new-user-name" error={errors.name?.message}>
            <Input
              id="new-user-name"
              placeholder="Full name"
              autoComplete="off"
              disabled={pending}
              {...register("name")}
            />
          </Field>

          <Field label="Email" htmlFor="new-user-email" error={errors.email?.message}>
            <Input
              id="new-user-email"
              type="email"
              placeholder="name@company.com"
              autoComplete="off"
              disabled={pending}
              {...register("email")}
            />
          </Field>

          <Field
            label="Initial password"
            htmlFor="new-user-password"
            error={errors.password?.message}
            hint="At least 8 characters. They can be told to change it after signing in."
          >
            <Input
              id="new-user-password"
              type="password"
              placeholder="At least 8 characters"
              autoComplete="new-password"
              disabled={pending}
              {...register("password")}
            />
          </Field>

          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Role" error={errors.role?.message}>
              <Controller
                control={control}
                name="role"
                render={({ field }) => (
                  <Select
                    value={field.value}
                    onValueChange={field.onChange}
                    disabled={pending}
                  >
                    <SelectTrigger className="w-full">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {ROLES.map((r) => (
                        <SelectItem key={r} value={r}>
                          {ROLE_LABELS[r]}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                )}
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
          </div>

          <DialogFooter>
            <DialogClose asChild>
              <Button type="button" variant="ghost" disabled={pending}>
                Cancel
              </Button>
            </DialogClose>
            <Button type="submit" disabled={pending}>
              {pending ? "Adding…" : "Add user"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
