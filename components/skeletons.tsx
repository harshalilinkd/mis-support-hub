import { Skeleton } from "@/components/ui/skeleton";

function HeaderSkeleton() {
  return (
    <div className="mb-6 space-y-2">
      <Skeleton className="h-7 w-40" />
      <Skeleton className="h-4 w-64" />
    </div>
  );
}

/** /my — card list. */
export function MyTicketsSkeleton() {
  return (
    <div>
      <HeaderSkeleton />
      <div className="mb-4 flex items-center justify-between">
        <Skeleton className="h-8 w-48" />
        <Skeleton className="h-9 w-64" />
      </div>
      <div className="grid gap-3">
        {Array.from({ length: 4 }).map((_, i) => (
          <div
            key={i}
            className="rounded-[var(--radius-card)] border border-border bg-surface p-4"
          >
            <div className="flex items-center justify-between">
              <Skeleton className="h-4 w-40" />
              <Skeleton className="h-5 w-16 rounded-full" />
            </div>
            <Skeleton className="mt-2 h-4 w-3/4" />
            <Skeleton className="mt-3 h-3 w-52" />
          </div>
        ))}
      </div>
    </div>
  );
}

/** /dashboard — KPI row (with sparklines) + six-chart bento. */
export function DashboardSkeleton() {
  // lg column spans mirroring the bento in the dashboard page.
  const charts = [
    "lg:col-span-4",
    "lg:col-span-2",
    "lg:col-span-3",
    "lg:col-span-3",
    "lg:col-span-4",
    "lg:col-span-2",
  ];
  return (
    <div className="space-y-6">
      <HeaderSkeleton />
      <div className="grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-3 xl:grid-cols-6">
        {Array.from({ length: 6 }).map((_, i) => (
          <div
            key={i}
            className="rounded-[var(--radius-card)] border border-border bg-surface p-4 sm:p-5"
          >
            <div className="flex items-center justify-between">
              <Skeleton className="h-4 w-16" />
              <Skeleton className="size-8 rounded-[10px]" />
            </div>
            <Skeleton className="mt-3 h-7 w-12" />
            <Skeleton className="mt-3 h-8 w-full" />
          </div>
        ))}
      </div>
      <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-6">
        {charts.map((span, i) => (
          <div
            key={i}
            className={`rounded-[var(--radius-card)] border border-border bg-surface p-5 md:col-span-1 ${span}`}
          >
            <Skeleton className="h-4 w-32" />
            <Skeleton className="mt-2 h-3 w-24" />
            <Skeleton className="mt-4 h-[220px] w-full rounded-[var(--radius-input)]" />
          </div>
        ))}
      </div>
    </div>
  );
}

/** /board — three columns of cards. */
export function BoardSkeleton() {
  return (
    <div className="space-y-6">
      <HeaderSkeleton />
      <div className="grid gap-4 sm:grid-cols-3">
        {Array.from({ length: 3 }).map((_, c) => (
          <div key={c} className="space-y-2">
            <Skeleton className="h-5 w-24" />
            <div className="min-h-40 space-y-2 rounded-[var(--radius-card)] border border-border bg-surface-muted/40 p-2">
              {Array.from({ length: 3 }).map((_, i) => (
                <div
                  key={i}
                  className="rounded-[var(--radius-input)] border border-border bg-surface p-3"
                >
                  <Skeleton className="h-3 w-16" />
                  <Skeleton className="mt-2 h-4 w-3/4" />
                  <Skeleton className="mt-3 h-3 w-24" />
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

/** /tickets/[number] — detail. */
export function TicketDetailSkeleton() {
  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <div className="space-y-3">
        <Skeleton className="h-4 w-24" />
        <Skeleton className="h-8 w-2/3" />
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
          {Array.from({ length: 4 }).map((_, i) => (
            <Skeleton key={i} className="h-10 w-full" />
          ))}
        </div>
      </div>
      <Skeleton className="h-28 w-full rounded-[var(--radius-card)]" />
      <Skeleton className="h-24 w-full rounded-[var(--radius-card)]" />
    </div>
  );
}
