import type { DashboardStats } from "@/lib/db/queries";
import { BarList } from "./bar-list";

const ROWS = [
  { label: "Open", key: "open", color: "var(--status-open)" },
  { label: "In Progress", key: "inProgress", color: "var(--status-in-progress)" },
  { label: "Resolved", key: "resolved", color: "var(--status-resolved)" },
  { label: "Closed", key: "closed", color: "var(--status-closed)" },
] as const;

/** Current status mix — reuses the animated BarList so it reads like the other cards. */
export function StatusBreakdown({ stats }: { stats: DashboardStats }) {
  const items = ROWS.map((r) => ({
    id: r.key,
    label: r.label,
    value: stats[r.key],
    color: r.color,
  }));
  const total = items.reduce((sum, i) => sum + i.value, 0);

  return (
    <BarList
      items={items}
      totalLabel={`${total} ${total === 1 ? "ticket" : "tickets"} total`}
      emptyLabel="No tickets yet."
    />
  );
}
