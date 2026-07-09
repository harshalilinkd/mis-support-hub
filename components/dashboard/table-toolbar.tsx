"use client";

import { useEffect, useState } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { Search, X } from "lucide-react";

import type { AssignableUser } from "@/lib/db/queries";
import { humanizeEnum } from "@/lib/format";
import {
  DEPARTMENT_LABELS,
  DEPARTMENTS,
  PRIORITIES,
} from "@/lib/validators/ticket";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

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
      <SelectTrigger className="w-auto min-w-[8.5rem]" size="sm">
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

/** Search + faceted filters that reflect into the URL query (shareable views). */
export function TableToolbar({ users }: { users: AssignableUser[] }) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [search, setSearch] = useState(searchParams.get("q") ?? "");

  function apply(params: URLSearchParams) {
    const qs = params.toString();
    router.push(qs ? `${pathname}?${qs}` : pathname);
  }

  function setParam(key: string, value: string) {
    const params = new URLSearchParams(searchParams.toString());
    if (value && value !== ALL) params.set(key, value);
    else params.delete(key);
    apply(params);
  }

  // Debounced search → URL. Read the LIVE url at fire time (not the captured
  // snapshot) so a facet change or Clear during the debounce isn't reverted.
  useEffect(() => {
    const timer = setTimeout(() => {
      const params = new URLSearchParams(window.location.search);
      const q = search.trim();
      if (q === (params.get("q") ?? "")) return;
      if (q) params.set("q", q);
      else params.delete("q");
      apply(params);
    }, 300);
    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [search]);

  const dept = searchParams.get("department") ?? ALL;
  const priority = searchParams.get("priority") ?? ALL;
  const assignee = searchParams.get("assignee") ?? ALL;
  const hasFilters =
    [dept, priority, assignee].some((v) => v !== ALL) ||
    !!searchParams.get("q");

  return (
    <div className="flex flex-wrap items-center gap-2">
      <div className="relative w-full min-w-[200px] sm:w-auto sm:flex-1">
        <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-text-muted" />
        <Input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search tickets…"
          className="pl-9"
          aria-label="Search tickets"
        />
      </div>
      <Facet
        label="Department"
        value={dept}
        onValueChange={(v) => setParam("department", v)}
        options={DEPARTMENTS.map((d) => ({ value: d, label: DEPARTMENT_LABELS[d] }))}
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
      {hasFilters ? (
        <Button
          variant="ghost"
          size="sm"
          onClick={() => {
            setSearch("");
            // Clear the filters but keep the active status tab (`tab`).
            const params = new URLSearchParams(searchParams.toString());
            for (const key of ["department", "priority", "assignee", "q"]) {
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
