"use client";

import { useEffect, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Controller, useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { toast } from "sonner";
import type { z } from "zod";

import { Eye, EyeOff, KeyRound } from "lucide-react";

import { adminSetUserPassword, adminUpdateUser } from "@/lib/actions/users";
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
  // The password is its OWN action with its own button (not folded into "Save
  // changes"): rewriting a credential should never ride along with a name edit.
  const [pwPending, startPwTransition] = useTransition();
  const [newPassword, setNewPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);

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
      // Never leave a typed password sitting in a re-opened dialog.
      setNewPassword("");
      setShowPassword(false);
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

  const submitPassword = () => {
    if (newPassword.length < 8) {
      toast.error("Use at least 8 characters.");
      return;
    }
    startPwTransition(async () => {
      const res = await adminSetUserPassword({
        userId: user.id,
        newPassword,
      });
      if (!res.ok) {
        toast.error(res.error);
        return;
      }
      toast.success(
        `Password updated — give it to ${user.name ?? user.email} yourself; it can't be looked up later.`
      );
      setNewPassword("");
      setShowPassword(false);
      router.refresh();
    });
  };

  const busy = pending || pwPending;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Edit user</DialogTitle>
          <DialogDescription>
            Update name, email, department, and password. Role and status are
            managed from the row.
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
              <Button type="button" variant="ghost" disabled={busy}>
                Cancel
              </Button>
            </DialogClose>
            <Button type="submit" disabled={busy}>
              {pending ? "Saving…" : "Save changes"}
            </Button>
          </DialogFooter>
        </form>

        {/* Password — a separate section, and a separate action, OUTSIDE the profile
            form (no nested <form>, and no chance of rewriting a credential while
            saving a name).

            There is no "current password" field on purpose: password_hash is a
            one-way bcrypt hash, so the existing password cannot be shown here or
            anywhere else — an admin RESETS it and passes the new one on. See
            adminSetUserPassword for the full reasoning. */}
        <div className="space-y-3 border-t border-border pt-4">
          <div className="flex items-center gap-2">
            <KeyRound className="size-4 text-text-muted" />
            <h3 className="text-sm font-medium">Password</h3>
            <span className="ml-auto text-xs text-text-muted">
              {user.hasPassword
                ? "Password sign-in enabled"
                : "Google-only — no password set"}
            </span>
          </div>

          <p className="text-xs text-text-muted">
            The current password can&apos;t be displayed — it&apos;s stored as a
            one-way hash, so nobody (including admins) can read it back. Set a new
            one here and tell {user.name ?? "the user"} directly; they can change it
            themselves in Profile.
          </p>

          <Field label={user.hasPassword ? "New password" : "Set a password"}>
            <div className="flex gap-2">
              <div className="relative flex-1">
                <Input
                  id="edit-user-password"
                  type={showPassword ? "text" : "password"}
                  placeholder="At least 8 characters"
                  autoComplete="new-password"
                  className="pr-9"
                  value={newPassword}
                  disabled={busy}
                  onChange={(e) => setNewPassword(e.target.value)}
                  onKeyDown={(e) => {
                    // The field sits outside the profile form, but Enter should still
                    // do the obvious thing rather than nothing.
                    if (e.key === "Enter") {
                      e.preventDefault();
                      submitPassword();
                    }
                  }}
                />
                <button
                  type="button"
                  onClick={() => setShowPassword((v) => !v)}
                  aria-label={showPassword ? "Hide password" : "Show password"}
                  className="absolute right-2 top-1/2 -translate-y-1/2 rounded-[6px] p-1 text-text-muted transition-colors hover:text-foreground"
                >
                  {showPassword ? (
                    <EyeOff className="size-4" />
                  ) : (
                    <Eye className="size-4" />
                  )}
                </button>
              </div>
              <Button
                type="button"
                variant="outline"
                onClick={submitPassword}
                disabled={busy || newPassword.length < 8}
              >
                {pwPending
                  ? "Saving…"
                  : user.hasPassword
                    ? "Update password"
                    : "Set password"}
              </Button>
            </div>
          </Field>
        </div>
      </DialogContent>
    </Dialog>
  );
}
