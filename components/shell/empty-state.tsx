import Link from "next/link";

import { Button } from "@/components/ui/button";

/**
 * Empty state with a placeholder for the P9 generative accent + one clear CTA
 * (design-system.md). The subtle cobalt radial stands in for the real art.
 */
export function EmptyState({
  icon,
  title,
  description,
  actionHref,
  actionLabel,
}: {
  icon?: React.ReactNode;
  title: string;
  description?: string;
  actionHref?: string;
  actionLabel?: string;
}) {
  return (
    <div className="relative overflow-hidden rounded-[var(--radius-card)] border border-dashed border-border bg-surface-muted/30 px-6 py-14 text-center">
      <div
        aria-hidden
        data-generative-slot="empty"
        className="pointer-events-none absolute inset-0 -z-10 opacity-70"
        style={{
          background:
            "radial-gradient(60% 55% at 50% 0%, var(--accent-soft), transparent 70%)",
        }}
      />
      {icon ? (
        <div className="mx-auto mb-3 flex size-11 items-center justify-center rounded-full bg-accent-soft text-primary">
          {icon}
        </div>
      ) : null}
      <h3 className="font-display text-base font-semibold">{title}</h3>
      {description ? (
        <p className="mx-auto mt-1 max-w-sm text-sm text-text-muted">
          {description}
        </p>
      ) : null}
      {actionHref && actionLabel ? (
        <Button asChild className="mt-4">
          <Link href={actionHref}>{actionLabel}</Link>
        </Button>
      ) : null}
    </div>
  );
}
