"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Library, Search } from "lucide-react";

import { AbsoluteTime } from "@/components/absolute-time";
import { EmptyState } from "@/components/shell/empty-state";
import { UserAvatar } from "@/components/user-avatar";
import { Input } from "@/components/ui/input";
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
import type { SystemListRow } from "@/lib/db/queries";
import { cn } from "@/lib/utils";
import {
  SYSTEM_STATUSES,
  SYSTEM_STATUS_LABELS,
  SYSTEM_TYPES,
  SYSTEM_TYPE_LABELS,
} from "@/lib/validators/systems";
import { DEPARTMENTS, DEPARTMENT_LABELS } from "@/lib/validators/ticket";
import { SystemLink } from "./system-link";
import { SystemStatusChip, SystemTypeChip, systemStatusColor } from "./system-chips";

/** "All" needs a non-empty value — Radix Select reserves "" for a cleared field. */
const ALL = "__all__";

function Facet({
  label,
  value,
  onChange,
  options,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  options: { value: string; label: string }[];
}) {
  return (
    <Select value={value} onValueChange={onChange}>
      <SelectTrigger className="h-9 w-full sm:w-[9.5rem]" aria-label={label}>
        <SelectValue placeholder={label} />
      </SelectTrigger>
      <SelectContent>
        <SelectItem value={ALL}>{label}: All</SelectItem>
        {options.map((o) => (
          <SelectItem key={o.value} value={o.value}>
            {o.label}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}

/**
 * The systems directory (§13). Filtering is client-side over rows the server already
 * loaded — the same approach as the tickets/requests lists, and "searching is
 * instant" is the point (§13). Search spans code + name + owner.
 *
 * Readable by every authenticated user (§13.3); only MIS sees the write affordances.
 */
export function SystemsView({
  systems,
  owners,
  canWrite,
}: {
  systems: SystemListRow[];
  /** Narrowed on purpose — this crosses to the client, so no emails (see the page). */
  owners: { id: string; name: string | null }[];
  canWrite: boolean;
}) {
  const router = useRouter();
  const [query, setQuery] = useState("");
  const [type, setType] = useState<string>(ALL);
  const [department, setDepartment] = useState<string>(ALL);
  const [status, setStatus] = useState<string>(ALL);
  const [owner, setOwner] = useState<string>(ALL);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return systems.filter((s) => {
      if (type !== ALL && s.systemType !== type) return false;
      if (department !== ALL && s.department !== department) return false;
      if (status !== ALL && s.status !== status) return false;
      if (owner !== ALL && s.ownerId !== owner) return false;
      if (!q) return true;
      return (
        s.code.toLowerCase().includes(q) ||
        s.name.toLowerCase().includes(q) ||
        (s.ownerName ?? "").toLowerCase().includes(q)
      );
    });
  }, [systems, query, type, department, status, owner]);

  const open = (code: string) => router.push(`/systems/${code}`);
  const onKeyOpen = (code: string) => (e: React.KeyboardEvent) => {
    if (e.target !== e.currentTarget) return;
    if (e.key === "Enter" || e.key === " ") {
      e.preventDefault();
      open(code);
    }
  };

  /** A retired system stays legible but stops competing with the live ones. */
  const retired = (s: SystemListRow) => s.status === "ARCHIVED";

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
        <div className="relative lg:w-72">
          <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-text-muted" />
          <Input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search systems…"
            className="pl-9"
            aria-label="Search systems"
          />
        </div>
        <div className="grid grid-cols-2 gap-2 sm:flex sm:flex-wrap sm:items-center">
          <Facet
            label="Type"
            value={type}
            onChange={setType}
            options={SYSTEM_TYPES.map((t) => ({ value: t, label: SYSTEM_TYPE_LABELS[t] }))}
          />
          <Facet
            label="Dept"
            value={department}
            onChange={setDepartment}
            options={DEPARTMENTS.map((d) => ({ value: d, label: DEPARTMENT_LABELS[d] }))}
          />
          <Facet
            label="Status"
            value={status}
            onChange={setStatus}
            options={SYSTEM_STATUSES.map((s) => ({
              value: s,
              label: SYSTEM_STATUS_LABELS[s],
            }))}
          />
          <Facet
            label="Owner"
            value={owner}
            onChange={setOwner}
            options={owners.map((o) => ({ value: o.id, label: o.name ?? "—" }))}
          />
        </div>
      </div>

      {filtered.length === 0 ? (
        systems.length === 0 ? (
          <EmptyState
            icon={<Library className="size-5" />}
            title="No systems logged yet"
            description="Every system MIS builds belongs here, so its links are never lost. Log the first one."
            {...(canWrite
              ? { actionHref: "/systems/new", actionLabel: "Log a system" }
              : {})}
          />
        ) : (
          <EmptyState
            icon={<Search className="size-5" />}
            title="Nothing here"
            description="No systems match this search and filter combination."
          />
        )
      ) : (
        <>
          {/* Mobile cards */}
          <div className="space-y-2 md:hidden">
            {filtered.map((s) => (
              <div
                key={s.id}
                role="button"
                tabIndex={0}
                aria-label={`Open ${s.code}: ${s.name}`}
                onClick={() => open(s.code)}
                onKeyDown={onKeyOpen(s.code)}
                className={cn(
                  "relative cursor-pointer overflow-hidden rounded-[var(--radius-card)] border border-border bg-surface py-2.5 pl-4 pr-3 shadow-[var(--shadow-elevation)] transition-shadow focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring active:shadow-[var(--shadow-hover)]",
                  retired(s) && "opacity-60"
                )}
              >
                <span
                  aria-hidden
                  className="absolute inset-y-0 left-0 w-1"
                  style={{ backgroundColor: systemStatusColor(s.status) }}
                />
                <div className="flex items-center gap-2">
                  <span className="shrink-0 font-mono text-xs font-semibold">{s.code}</span>
                  <span className="min-w-0 flex-1 truncate text-sm font-medium">{s.name}</span>
                  <SystemStatusChip status={s.status} className="shrink-0" />
                </div>
                <div className="mt-2 flex items-center gap-2 text-xs text-text-muted">
                  <SystemTypeChip type={s.systemType} className="shrink-0" />
                  <span className="min-w-0 flex-1 truncate">
                    {DEPARTMENT_LABELS[s.department]} · {s.ownerName ?? "—"}
                  </span>
                  <AbsoluteTime date={s.updatedAt} dateOnly className="shrink-0 font-mono" />
                </div>
                {/* Links stay reachable on mobile — stop the row's open-on-tap. */}
                <div
                  className="mt-2 flex items-center gap-1"
                  onClick={(e) => e.stopPropagation()}
                  onKeyDown={(e) => e.stopPropagation()}
                >
                  <SystemLink url={s.frontendUrl} label="Frontend link" />
                  {s.backendUrl ? (
                    <SystemLink url={s.backendUrl} label="Backend link" />
                  ) : null}
                </div>
              </div>
            ))}
          </div>

          {/* Desktop table */}
          <div className="hidden overflow-auto rounded-[var(--radius-card)] border border-border bg-surface shadow-[var(--shadow-elevation)] md:block">
            <Table>
              <TableHeader className="sticky top-0 z-10 bg-surface-muted/95 backdrop-blur [&_th]:h-11 [&_th]:text-xs [&_th]:font-semibold [&_th]:uppercase [&_th]:tracking-wider [&_th]:text-foreground">
                <TableRow>
                  <TableHead>Code</TableHead>
                  <TableHead>System</TableHead>
                  <TableHead>Type</TableHead>
                  <TableHead>Dept</TableHead>
                  <TableHead>Owner</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Frontend</TableHead>
                  <TableHead>Backend</TableHead>
                  <TableHead>Request</TableHead>
                  <TableHead className="text-right">Updated</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filtered.map((s) => (
                  <TableRow
                    key={s.id}
                    onClick={() => open(s.code)}
                    className={cn(
                      "cursor-pointer transition-colors hover:bg-surface-muted/50 [&>td]:py-2.5 [&>td]:align-middle",
                      retired(s) && "opacity-60"
                    )}
                  >
                    {/* A real link, not just a clickable row: a <tr> can't take
                        focus, so without this the directory is unreachable by
                        keyboard. The row's onClick stays as a convenience. */}
                    <TableCell className="whitespace-nowrap font-mono text-xs">
                      <Link
                        href={`/systems/${s.code}`}
                        onClick={(e) => e.stopPropagation()}
                        className="rounded-sm text-foreground hover:text-primary hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                      >
                        {s.code}
                      </Link>
                    </TableCell>
                    <TableCell>
                      <div className="max-w-[14rem] truncate text-sm font-medium">{s.name}</div>
                    </TableCell>
                    <TableCell><SystemTypeChip type={s.systemType} /></TableCell>
                    <TableCell className="whitespace-nowrap text-sm text-foreground">
                      {DEPARTMENT_LABELS[s.department]}
                    </TableCell>
                    <TableCell>
                      <div className="flex items-center gap-2">
                        <UserAvatar name={s.ownerName} image={s.ownerImage} />
                        <span className="max-w-[7rem] truncate text-sm">{s.ownerName ?? "—"}</span>
                      </div>
                    </TableCell>
                    <TableCell><SystemStatusChip status={s.status} /></TableCell>
                    {/* The links are the payload — clicking one must not also open the row. */}
                    <TableCell onClick={(e) => e.stopPropagation()}>
                      <SystemLink url={s.frontendUrl} label="Frontend link" />
                    </TableCell>
                    <TableCell onClick={(e) => e.stopPropagation()}>
                      <SystemLink url={s.backendUrl} label="Backend link" />
                    </TableCell>
                    <TableCell onClick={(e) => e.stopPropagation()}>
                      {s.linkedTicketNumber ? (
                        <Link
                          href={`/tickets/${s.linkedTicketNumber}`}
                          className="font-mono text-xs text-primary hover:underline"
                        >
                          {s.linkedTicketNumber}
                        </Link>
                      ) : (
                        <span className="text-sm text-text-muted">—</span>
                      )}
                    </TableCell>
                    <TableCell className="whitespace-nowrap text-right">
                      {/* §9: absolute IST in tables — never relative. */}
                      <AbsoluteTime
                        date={s.updatedAt}
                        stacked
                        className="font-mono text-xs leading-tight tabular-nums text-foreground"
                      />
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </>
      )}
    </div>
  );
}
