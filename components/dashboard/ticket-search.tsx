"use client";

import { useEffect, useRef, useState } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { Search } from "lucide-react";

import { cn } from "@/lib/utils";
import { Input } from "@/components/ui/input";

/**
 * Ticket search box — debounced into the `?q=` URL param (shareable view). Split
 * out of the filter toolbar so it can sit next to the Table/Board toggle in the
 * page header. When the filters' "Clear" removes `q` from the URL, this syncs
 * back to empty — but only while the box isn't focused, so it never overwrites
 * what someone is actively typing.
 */
export function TicketSearch({ className }: { className?: string }) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const urlQ = searchParams.get("q") ?? "";
  const spString = searchParams.toString();
  const [search, setSearch] = useState(urlQ);
  const focusedRef = useRef(false);

  // Adopt the URL's `q` on ANY external navigation (keyed on the whole query
  // string, not just `q`) — so "Clear" resets the box even when the typed query
  // hadn't yet reached the URL. Skipped while the user is mid-type so their
  // keystrokes are never overwritten.
  useEffect(() => {
    if (!focusedRef.current) setSearch(searchParams.get("q") ?? "");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [spString]);

  // Debounce the typed value into the URL. Read the LIVE url at fire time so a
  // facet change during the debounce isn't reverted.
  useEffect(() => {
    const timer = setTimeout(() => {
      const params = new URLSearchParams(window.location.search);
      const q = search.trim();
      if (q === (params.get("q") ?? "")) return;
      if (q) params.set("q", q);
      else params.delete("q");
      const qs = params.toString();
      router.push(qs ? `${pathname}?${qs}` : pathname);
    }, 300);
    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [search]);

  return (
    <div className={cn("relative", className)}>
      <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-text-muted" />
      <Input
        value={search}
        onChange={(e) => setSearch(e.target.value)}
        onFocus={() => (focusedRef.current = true)}
        onBlur={() => (focusedRef.current = false)}
        placeholder="Search tickets…"
        className="pl-9"
        aria-label="Search tickets"
      />
    </div>
  );
}
