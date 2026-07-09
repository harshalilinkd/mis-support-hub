export type BarItem = { id?: string; label: string; value: number; color?: string };

/**
 * Horizontal labeled bars (dot + label + value + track). Magnitude comparison:
 * a single cobalt hue by default; pass `color` per item for reserved status /
 * priority / severity colors. Mirrors StatusBreakdown so all cards read alike.
 */
export function BarList({
  items,
  totalLabel,
  emptyLabel = "No data in this range.",
}: {
  items: BarItem[];
  totalLabel?: (total: number) => string;
  emptyLabel?: string;
}) {
  const total = items.reduce((sum, i) => sum + i.value, 0);
  const max = Math.max(1, ...items.map((i) => i.value));

  if (total === 0) {
    return <p className="mt-4 text-xs text-text-muted">{emptyLabel}</p>;
  }

  return (
    <div className="mt-4 space-y-3.5">
      {items.map((i) => (
        <div key={i.id ?? i.label}>
          <div className="mb-1.5 flex items-center justify-between text-xs">
            <span className="inline-flex items-center gap-1.5 text-text-muted">
              <span
                aria-hidden
                className="size-1.5 shrink-0 rounded-full"
                style={{ backgroundColor: i.color ?? "var(--accent)" }}
              />
              <span className="truncate">{i.label}</span>
            </span>
            <span className="font-mono font-medium tabular-nums">{i.value}</span>
          </div>
          <div className="h-2 overflow-hidden rounded-full bg-surface-muted">
            <div
              className="h-full rounded-full transition-[width]"
              style={{
                width: `${(i.value / max) * 100}%`,
                backgroundColor: i.color ?? "var(--accent)",
              }}
            />
          </div>
        </div>
      ))}
      {totalLabel ? (
        <div className="pt-1 text-xs text-text-muted">{totalLabel(total)}</div>
      ) : null}
    </div>
  );
}
