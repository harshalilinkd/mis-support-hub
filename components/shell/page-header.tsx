import Link from "next/link";
import { ChevronLeft } from "lucide-react";

export function PageHeader({
  title,
  description,
  backHref,
  backLabel = "Back",
  children,
}: {
  title: string;
  description?: string;
  /** When set, renders a "‹ back" link above the title (e.g. back to Settings). */
  backHref?: string;
  backLabel?: string;
  children?: React.ReactNode;
}) {
  return (
    <div className="mb-6 space-y-3">
      {backHref ? (
        <Link
          href={backHref}
          className="inline-flex items-center gap-1 rounded-[6px] text-sm font-medium text-text-muted transition-colors hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          <ChevronLeft className="size-4" />
          {backLabel}
        </Link>
      ) : null}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between sm:gap-4">
        <div className="space-y-1">
          <h1 className="font-display text-xl font-semibold tracking-tight sm:text-2xl">
            {title}
          </h1>
          {/* Explanatory copy is desktop context: on a phone it cost two lines at
              the top of EVERY screen, pushing the actual list below the fold. The
              title and the controls already say where you are. */}
          {description ? (
            <p className="hidden text-sm text-foreground sm:block">{description}</p>
          ) : null}
        </div>
        {children ? (
          <div className="flex shrink-0 items-center gap-2">{children}</div>
        ) : null}
      </div>
    </div>
  );
}
