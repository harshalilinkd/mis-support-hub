"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";

import { updateMyProfile } from "@/lib/actions/users";
import type { Department, Role } from "@/lib/db/schema";
import { DEPARTMENTS, DEPARTMENT_LABELS } from "@/lib/validators/ticket";
import { UserAvatar } from "@/components/user-avatar";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

const ROLE_LABELS: Record<Role, string> = {
  USER: "Employee",
  MIS_STAFF: "MIS Staff",
  MIS_ADMIN: "MIS Admin",
};

const NO_DEPT = "__none__";

function Card({ children }: { children: React.ReactNode }) {
  return (
    <div className="rounded-[var(--radius-card)] border border-border bg-surface p-5 shadow-[var(--shadow-elevation)]">
      {children}
    </div>
  );
}

function InfoRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between gap-4 py-1.5 text-sm">
      <span className="text-text-muted">{label}</span>
      <span className="truncate font-medium">{value}</span>
    </div>
  );
}

export function ProfileForm({
  name: initialName,
  email,
  role,
  image,
  department,
  memberSince,
  hasPassword,
}: {
  name: string;
  email: string;
  role: Role;
  image: string | null;
  department: Department | null;
  memberSince: string;
  hasPassword: boolean;
}) {
  const router = useRouter();
  const [name, setName] = useState(initialName);
  const [dept, setDept] = useState<string>(department ?? NO_DEPT);
  const [pending, startTransition] = useTransition();

  const nextDept = dept === NO_DEPT ? null : (dept as Department);
  const dirty = name.trim() !== initialName || nextDept !== (department ?? null);

  function save() {
    if (!name.trim()) {
      toast.error("Enter your name.");
      return;
    }
    startTransition(async () => {
      const res = await updateMyProfile(name.trim(), nextDept);
      if (!res.ok) {
        toast.error(res.error);
        return;
      }
      toast.success("Profile updated");
      router.refresh();
    });
  }

  return (
    <div className="max-w-2xl space-y-4">
      {/* Identity */}
      <Card>
        <div className="flex items-center gap-4">
          <UserAvatar
            name={initialName}
            email={email}
            image={image}
            className="size-14 text-base"
          />
          <div className="min-w-0">
            <div className="truncate text-lg font-semibold">
              {initialName || "Unnamed"}
            </div>
            <div className="truncate text-sm text-text-muted">{email}</div>
          </div>
          <span className="ml-auto shrink-0 rounded-full bg-accent-soft px-2.5 py-1 text-xs font-medium text-primary">
            {ROLE_LABELS[role]}
          </span>
        </div>
      </Card>

      {/* Editable */}
      <Card>
        <div className="space-y-4">
          <div>
            <label htmlFor="profile-name" className="mb-1 block text-sm font-medium">
              Display name
            </label>
            <Input
              id="profile-name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              maxLength={120}
              disabled={pending}
            />
          </div>
          <div>
            <label className="mb-1 block text-sm font-medium">
              Home department
            </label>
            <Select value={dept} onValueChange={setDept} disabled={pending}>
              <SelectTrigger className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={NO_DEPT}>No department</SelectItem>
                {DEPARTMENTS.map((d) => (
                  <SelectItem key={d} value={d}>
                    {DEPARTMENT_LABELS[d]}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <p className="mt-1 text-xs text-text-muted">
              Pre-fills the department when you raise a ticket.
            </p>
          </div>
          <div className="flex justify-end">
            <Button onClick={save} disabled={pending || !dirty}>
              {pending ? "Saving…" : "Save changes"}
            </Button>
          </div>
        </div>
      </Card>

      {/* Account (read-only) */}
      <Card>
        <h2 className="mb-2 text-sm font-semibold">Account</h2>
        <InfoRow label="Email" value={email} />
        <InfoRow label="Role" value={ROLE_LABELS[role]} />
        <InfoRow label="Member since" value={memberSince} />
        <p className="mt-2 border-t border-border pt-3 text-xs text-text-muted">
          {hasPassword
            ? "You can sign in with Google or your email + password. To reset your password, ask an MIS admin to update your account."
            : "You sign in with Google — your email and photo come from your Google account, so there's no password to manage here."}
        </p>
      </Card>
    </div>
  );
}
