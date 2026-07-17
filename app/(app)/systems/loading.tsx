import { Skeleton } from "@/components/ui/skeleton";

/**
 * Directory loading state. /systems is server-rendered and hits the DB, so a route
 * skeleton keeps the shell stable instead of flashing an empty page.
 *
 * The pulse honours prefers-reduced-motion for free — app/globals.css collapses
 * every animation under that query globally, so no per-component opt-out is needed.
 * The shape mirrors the real toolbar + table so nothing jumps when data lands.
 */
export default function SystemsLoading() {
  return (
    <div className="space-y-6">
      {/* PageHeader */}
      <div className="mb-6 flex items-start justify-between gap-4">
        <div className="space-y-2">
          <Skeleton className="h-7 w-32" />
          <Skeleton className="h-4 w-72" />
        </div>
        <Skeleton className="h-8 w-28 shrink-0" />
      </div>

      {/* Toolbar: search + four facets */}
      <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
        <Skeleton className="h-9 w-full lg:w-72" />
        <div className="grid grid-cols-2 gap-2 sm:flex sm:flex-wrap">
          {Array.from({ length: 4 }).map((_, i) => (
            <Skeleton key={i} className="h-9 w-full sm:w-[9.5rem]" />
          ))}
        </div>
      </div>

      {/* Table */}
      <div className="overflow-hidden rounded-[var(--radius-card)] border border-border bg-surface shadow-[var(--shadow-elevation)]">
        <div className="h-11 border-b border-border bg-surface-muted/95" />
        <div className="divide-y divide-border">
          {Array.from({ length: 6 }).map((_, i) => (
            <div key={i} className="flex items-center gap-4 px-4 py-3">
              <Skeleton className="h-4 w-16 shrink-0" />
              <Skeleton className="h-4 w-40" />
              <Skeleton className="ml-auto h-5 w-20 shrink-0" />
              <Skeleton className="h-5 w-24 shrink-0" />
              <Skeleton className="hidden h-4 w-20 shrink-0 sm:block" />
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
