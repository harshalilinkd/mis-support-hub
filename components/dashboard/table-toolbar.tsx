"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { X } from "lucide-react";

import type { AssignableUser } from "@/lib/db/queries";
import { humanizeEnum } from "@/lib/format";
import {
  DEPARTMENT_LABELS,
  DEPARTMENTS,
  PRIORITIES,
} from "@/lib/validators/ticket";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { TicketSearch } from "./ticket-search";

const ALL = "__all__";

type Option = { value: string; label: string };

function Facet({
  label,
  value,
  onValueChange,
  options,
}: {
  label: string;
  value: string;
  onValueChange: (value: string) => void;
  options: Option[];
}) {
  return (
    <Select value={value} onValueChange={onValueChange}>
      {/* Full width on mobile (3 fit in one grid row); natural width on desktop. */}
      <SelectTrigger
        className="w-full min-w-0 sm:w-auto sm:min-w-[8.5rem]"
        size="sm"
      >
        <SelectValue placeholder={label} />
      </SelectTrigger>
      <SelectContent>
        <SelectItem value={ALL}>{label}: all</SelectItem>
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
 * Faceted filters (department / priority / assignee / reporter) that reflect into
 * the URL query. Search lives separately in <TicketSearch> (up by the Table/Board
 * toggle); the Clear here still removes `q` too, so one button resets everything.
 * On mobile the dropdowns sit in a 3-column grid.
 */
export function TableToolbar({
  users,
  reporters,
}: {
  users: AssignableUser[];
  reporters: AssignableUser[];
}) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  function setParam(key: string, value: string) {
    const params = new URLSearchParams(searchParams.toString());
    if (value && value !== ALL) params.set(key, value);
    else params.delete(key);
    const qs = params.toString();
    router.push(qs ? `${pathname}?${qs}` : pathname);
  }

  const dept = searchParams.get("department") ?? ALL;
  const priority = searchParams.get("priority") ?? ALL;
  const assignee = searchParams.get("assignee") ?? ALL;
  const reporter = searchParams.get("reporter") ?? ALL;
  const hasFilters =
    [dept, priority, assignee, reporter].some((v) => v !== ALL) ||
    !!searchParams.get("q");

  return (
    <div className="grid grid-cols-3 gap-2 sm:flex sm:flex-wrap sm:items-center">
      <Facet
        label="Department"
        value={dept}
        onValueChange={(v) => setParam("department", v)}
        options={DEPARTMENTS.map((d) => ({
          value: d,
          label: DEPARTMENT_LABELS[d],
        }))}
      />
      <Facet
        label="Priority"
        value={priority}
        onValueChange={(v) => setParam("priority", v)}
        options={PRIORITIES.map((p) => ({ value: p, label: humanizeEnum(p) }))}
      />
      <Facet
        label="Assignee"
        value={assignee}
        onValueChange={(v) => setParam("assignee", v)}
        options={[
          { value: "unassigned", label: "Unassigned only" },
          ...users.map((u) => ({ value: u.id, label: u.name ?? u.email ?? "—" })),
        ]}
      />
      <Facet
        label="Reporter"
        value={reporter}
        onValueChange={(v) => setParam("reporter", v)}
        options={reporters.map((u) => ({
          value: u.id,
          label: u.name ?? u.email ?? "—",
        }))}
      />
      {/* Desktop: search sits next to the dropdowns (on mobile it's up in the
          header instead, so it's hidden here). */}
      <TicketSearch className="hidden sm:block sm:w-60" />
      {hasFilters ? (
        <Button
          variant="ghost"
          size="sm"
          className="col-span-3 justify-self-start sm:col-auto"
          onClick={() => {
            // Clear the facets AND the search, but keep the active status tab.
            const params = new URLSearchParams(searchParams.toString());
            for (const key of [
              "department",
              "priority",
              "assignee",
              "reporter",
              "q",
            ]) {
              params.delete(key);
            }
            const qs = params.toString();
            router.push(qs ? `${pathname}?${qs}` : pathname);
          }}
        >
          <X className="size-4" />
          Clear
        </Button>
      ) : null}
    </div>
  );
}
