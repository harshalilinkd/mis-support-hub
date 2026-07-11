"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";

import { updateUserRole } from "@/lib/actions/users";
import type { Department, Role } from "@/lib/db/schema";
import { ROLE_LABELS, ROLES } from "@/lib/roles";
import { DEPARTMENT_LABELS } from "@/lib/validators/ticket";
import { RelativeTime } from "@/components/relative-time";
import { UserAvatar } from "@/components/user-avatar";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { UserRowActions } from "./user-row-actions";

/** Serializable row shape passed from the server page (never includes the hash). */
export type AdminUserView = {
  id: string;
  name: string | null;
  email: string;
  image: string | null;
  role: Role;
  isActive: boolean;
  department: Department | null;
  hasPassword: boolean;
  ticketCount: number;
  createdAt: string; // ISO
};

export function UsersTable({
  users,
  currentUserId,
}: {
  users: AdminUserView[];
  currentUserId: string;
}) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [busyId, setBusyId] = useState<string | null>(null);

  function run(id: string, fn: () => Promise<{ ok: boolean; error?: string }>, success: string) {
    setBusyId(id);
    startTransition(async () => {
      const res = await fn();
      if (!res.ok) {
        toast.error(res.error ?? "Something went wrong.");
      } else {
        toast.success(success);
        router.refresh();
      }
      setBusyId(null);
    });
  }

  return (
    <div className="overflow-hidden rounded-[var(--radius-card)] border border-border bg-surface shadow-[var(--shadow-elevation)]">
      <Table>
        <TableHeader className="[&_th]:h-11 [&_th]:text-xs [&_th]:font-semibold [&_th]:uppercase [&_th]:tracking-wider [&_th]:text-foreground">
          <TableRow className="hover:bg-transparent">
            <TableHead className="pl-4">User</TableHead>
            <TableHead>Role</TableHead>
            <TableHead>Status</TableHead>
            <TableHead className="hidden md:table-cell">Sign-in</TableHead>
            <TableHead className="hidden lg:table-cell">Department</TableHead>
            <TableHead className="hidden lg:table-cell text-right">Tickets</TableHead>
            <TableHead className="hidden sm:table-cell">Joined</TableHead>
            <TableHead className="pr-4 text-right">Manage</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {users.length === 0 ? (
            <TableRow className="hover:bg-transparent">
              <TableCell
                colSpan={8}
                className="py-10 text-center text-sm text-text-muted"
              >
                No users yet — use the Add user button to create the first
                account.
              </TableCell>
            </TableRow>
          ) : null}
          {users.map((u) => {
            const isSelf = u.id === currentUserId;
            const rowBusy = busyId === u.id && isPending;
            return (
              <TableRow key={u.id} className={u.isActive ? undefined : "opacity-55"}>
                <TableCell className="pl-4">
                  <div className="flex items-center gap-3">
                    <UserAvatar
                      name={u.name}
                      email={u.email}
                      image={u.image}
                      className="size-8"
                    />
                    <div className="min-w-0">
                      <div className="flex items-center gap-1.5">
                        <span className="truncate text-sm font-medium">
                          {u.name ?? "Unnamed"}
                        </span>
                        {isSelf ? (
                          <Badge variant="outline" className="px-1.5 py-0 text-[10px]">
                            You
                          </Badge>
                        ) : null}
                      </div>
                      <div className="truncate text-xs text-text-muted">
                        {u.email}
                      </div>
                    </div>
                  </div>
                </TableCell>

                <TableCell>
                  <Select
                    value={u.role}
                    onValueChange={(v) =>
                      run(u.id, () => updateUserRole(u.id, v), "Role updated")
                    }
                    disabled={isSelf || rowBusy}
                  >
                    <SelectTrigger size="sm" className="w-[132px]">
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
                </TableCell>

                <TableCell>
                  {u.isActive ? (
                    <Badge variant="secondary" className="gap-1.5">
                      <span className="size-1.5 rounded-full bg-emerald-500" />
                      Active
                    </Badge>
                  ) : (
                    <Badge variant="outline" className="gap-1.5 text-text-muted">
                      <span className="size-1.5 rounded-full bg-text-muted" />
                      Inactive
                    </Badge>
                  )}
                </TableCell>

                <TableCell className="hidden md:table-cell text-xs text-foreground">
                  {u.hasPassword ? "Email + password" : "Google"}
                </TableCell>

                <TableCell className="hidden lg:table-cell text-xs text-foreground">
                  {u.department ? DEPARTMENT_LABELS[u.department] : "—"}
                </TableCell>

                <TableCell className="hidden lg:table-cell text-right text-sm tabular-nums text-foreground">
                  {u.ticketCount}
                </TableCell>

                <TableCell className="hidden sm:table-cell text-xs text-foreground">
                  <RelativeTime date={u.createdAt} />
                </TableCell>

                <TableCell className="pr-4 text-right">
                  <div className="flex justify-end">
                    <UserRowActions user={u} isSelf={isSelf} />
                  </div>
                </TableCell>
              </TableRow>
            );
          })}
        </TableBody>
      </Table>
    </div>
  );
}
