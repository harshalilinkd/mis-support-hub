"use client";

import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

/** Sentinel for the "all" option — Radix Select can't hold an empty string value. */
export const FACET_ALL = "__all__";

export type FacetOption = { value: string; label: string };

/**
 * A single client-state facet dropdown. Same look as the URL-driven <Facet> in
 * table-toolbar, but controlled by React state — used by the in-memory list views
 * (requests, my-tickets) that filter their rows client-side rather than via the URL.
 */
export function FacetSelect({
  label,
  value,
  onValueChange,
  options,
}: {
  label: string;
  value: string;
  onValueChange: (value: string) => void;
  options: FacetOption[];
}) {
  return (
    <Select value={value} onValueChange={onValueChange}>
      <SelectTrigger className="w-full min-w-0 sm:w-auto sm:min-w-[8.5rem]" size="sm">
        <SelectValue placeholder={label} />
      </SelectTrigger>
      <SelectContent>
        <SelectItem value={FACET_ALL}>{label}: all</SelectItem>
        {options.map((o) => (
          <SelectItem key={o.value} value={o.value}>
            {o.label}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}
