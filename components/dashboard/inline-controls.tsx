"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { ChevronDown } from "lucide-react";
import { toast } from "sonner";

import { assignTicket, setPriority, updateStatus } from "@/lib/actions/tickets";
import type { AssignableUser } from "@/lib/db/queries";
import type { Priority, Status } from "@/lib/db/schema";
import { humanizeEnum } from "@/lib/format";
import { STATUS_TRANSITIONS } from "@/lib/ticket-state";
import { PRIORITIES } from "@/lib/validators/ticket";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { PriorityChip, StatusChip } from "@/components/tickets/chips";
import { UserAvatar } from "@/components/user-avatar";

const stop = (e: { stopPropagation: () => void }) => e.stopPropagation();

export function StatusControl({
  ticketId,
  status,
}: {
  ticketId: string;
  status: Status;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const targets = STATUS_TRANSITIONS[status];

  function change(to: Status) {
    startTransition(async () => {
      const res = await updateStatus(ticketId, to);
      if (!res.ok) return void toast.error(res.error);
      toast.success(`Status → ${humanizeEnum(to)}`);
      router.refresh();
    });
  }

  if (targets.length === 0) return <StatusChip status={status} />;

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button
          type="button"
          disabled={pending}
          onClick={stop}
          aria-label="Change status"
          className="inline-flex items-center gap-1 rounded-[6px] transition-opacity focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-60"
        >
          <StatusChip status={status} />
          <ChevronDown className="size-3 text-text-muted" />
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" onClick={stop}>
        {targets.map((s) => (
          <DropdownMenuItem key={s} onSelect={() => change(s)}>
            Move to {humanizeEnum(s)}
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

export function PriorityControl({
  ticketId,
  priority,
}: {
  ticketId: string;
  priority: Priority;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  function change(to: Priority) {
    if (to === priority) return;
    startTransition(async () => {
      const res = await setPriority(ticketId, to);
      if (!res.ok) return void toast.error(res.error);
      toast.success(`Priority → ${humanizeEnum(to)}`);
      router.refresh();
    });
  }

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button
          type="button"
          disabled={pending}
          onClick={stop}
          aria-label="Change priority"
          className="inline-flex items-center gap-1 rounded-[6px] transition-opacity focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-60"
        >
          <PriorityChip priority={priority} />
          <ChevronDown className="size-3 text-text-muted" />
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" onClick={stop}>
        {PRIORITIES.map((p) => (
          <DropdownMenuItem key={p} onSelect={() => change(p)}>
            {humanizeEnum(p)}
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

export function AssigneeControl({
  ticketId,
  assigneeId,
  assigneeName,
  assigneeImage,
  users,
}: {
  ticketId: string;
  assigneeId: string | null;
  assigneeName: string | null;
  assigneeImage: string | null;
  users: AssignableUser[];
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  function change(userId: string | null) {
    if (userId === assigneeId) return;
    startTransition(async () => {
      const res = await assignTicket(ticketId, userId);
      if (!res.ok) return void toast.error(res.error);
      toast.success(userId ? "Assigned" : "Unassigned");
      router.refresh();
    });
  }

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button
          type="button"
          disabled={pending}
          onClick={stop}
          aria-label="Change assignee"
          className="inline-flex items-center gap-1.5 rounded-[var(--radius-input)] px-1 py-0.5 text-sm transition-colors hover:bg-surface-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-60"
        >
          {assigneeId ? (
            <>
              <UserAvatar name={assigneeName} image={assigneeImage} />
              <span className="max-w-[7rem] truncate">{assigneeName ?? "—"}</span>
            </>
          ) : (
            <span className="text-text-muted">Unassigned</span>
          )}
          <ChevronDown className="size-3 text-text-muted" />
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent
        align="start"
        className="max-h-64 overflow-y-auto"
        onClick={stop}
      >
        <DropdownMenuItem onSelect={() => change(null)}>
          Unassigned
        </DropdownMenuItem>
        {users.map((u) => (
          <DropdownMenuItem key={u.id} onSelect={() => change(u.id)}>
            <UserAvatar name={u.name} email={u.email} image={u.image} />
            {u.name ?? u.email}
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
