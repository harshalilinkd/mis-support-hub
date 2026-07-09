import Link from "next/link";

import { GenerativeField } from "@/components/generative-field";
import { Button } from "@/components/ui/button";

/**
 * Empty state with the generative accent behind + one clear CTA (design-system).
 * The field is kept faint (opacity) so foreground text keeps ≥ 4.5:1 contrast.
 */
export function EmptyState({
  icon,
  title,
  description,
  actionHref,
  actionLabel,
  seed = 7,
}: {
  icon?: React.ReactNode;
  title: string;
  description?: string;
  actionHref?: string;
  actionLabel?: string;
  seed?: number;
}) {
  return (
    <div className="relative overflow-hidden rounded-[var(--radius-card)] border border-dashed border-border bg-surface-muted/30 px-6 py-14 text-center">
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 -z-10 opacity-40"
      >
        <GenerativeField seed={seed} density={340} />
      </div>
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
