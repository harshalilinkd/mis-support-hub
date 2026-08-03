export type FunnelStage = { label: string; value: number; color: string };

/**
 * The request pipeline as a clean stage list — one row per stage with a readable
 * label, a proportional bar in the stage's status colour, and the count. Replaces the
 * cramped recharts bar: it stays legible when most stages are empty (a few requests),
 * reads top-to-bottom as the funnel, and never squashes the long stage names.
 */
export function RequestPipelineFunnel({ data }: { data: FunnelStage[] }) {
  const max = Math.max(1, ...data.map((d) => d.value));
  const total = data.reduce((s, d) => s + d.value, 0);

  return (
    <div className="mt-3">
      <ul className="space-y-2">
        {data.map((d) => {
          const pct = total > 0 ? Math.round((d.value / total) * 100) : 0;
          return (
            <li key={d.label} className="flex items-center gap-3">
              <span className="w-24 shrink-0 truncate text-xs font-medium text-foreground">
                {d.label}
              </span>
              <div className="relative h-6 flex-1 overflow-hidden rounded-[6px] bg-surface-muted/50">
                <div
                  className="h-full rounded-[6px] transition-[width] duration-500"
                  style={{
                    width: d.value > 0 ? `${Math.max(6, (d.value / max) * 100)}%` : "0%",
                    backgroundColor: d.color,
                  }}
                />
              </div>
              <span className="w-14 shrink-0 text-right text-xs tabular-nums">
                <span className="font-mono font-semibold text-foreground">{d.value}</span>
                {d.value > 0 ? (
                  <span className="ml-1 text-[10px] text-text-muted">{pct}%</span>
                ) : null}
              </span>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
