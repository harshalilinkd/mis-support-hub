/**
 * Demo data — ~40 realistic tickets spread over the last 30 days so the
 * dashboard, trend chart, table, and board look alive. Idempotent: skips if the
 * DB already has a decent number of tickets.
 *
 * Run with:  npm run db:seed:demo
 */
import { config } from "dotenv";

config({ path: ".env.local" });

import { neon } from "@neondatabase/serverless";
import { sql } from "drizzle-orm";
import { drizzle } from "drizzle-orm/neon-http";

import * as schema from "./schema";
import type { Department, Priority, Status } from "./schema";
import { ticketActivity, ticketComments, tickets, users } from "./schema";

if (!process.env.DATABASE_URL) {
  throw new Error("DATABASE_URL is not set (expected in .env.local)");
}
const db = drizzle(neon(process.env.DATABASE_URL), { schema });

const DEPARTMENTS: Department[] = [
  "LINKD",
  "LD_SILK_MILLS",
  "VHAGAR",
  "LD_COTTON_MILLS",
];
const PRIORITIES: Priority[] = ["LOW", "MEDIUM", "HIGH", "URGENT"];

const TITLES = [
  "AppSheet form not saving new rows",
  "Apps Script trigger stopped firing overnight",
  "Dispatch tracker showing stale data",
  "Add a column to the production sheet",
  "Login loop on the inventory portal",
  "Pivot table totals are wrong",
  "Barcode scanner not syncing to the sheet",
  "Automated email report missing attachments",
  "Permission denied opening the master sheet",
  "Duplicate entries in the orders sheet",
  "Slow load on the sales dashboard",
  "Formula error after the last update",
  "New user needs access to the QC sheet",
  "Export to PDF is timing out",
  "Data validation dropdown is empty",
  "Sheet crashed with too many rows",
  "Set up a weekly summary automation",
  "Fix the currency formatting on invoices",
  "Chart not refreshing with new data",
  "Merge two departments' trackers",
];

const HOUR = 3600_000;
const DAY = 86_400_000;

function statusFor(i: number): Status {
  const r = i % 10;
  if (r < 3) return "OPEN";
  if (r < 6) return "IN_PROGRESS";
  if (r === 6) return "REOPENED";
  if (r < 9) return "RESOLVED";
  return "CLOSED";
}

async function main() {
  console.log("Seeding demo data…");

  await db
    .insert(users)
    .values([
      { name: "Priya Patel", email: "priya@example.com", role: "MIS_STAFF" },
      { name: "Marcus Lee", email: "marcus@example.com", role: "MIS_STAFF" },
      { name: "Neha Shah", email: "neha@example.com", role: "USER" },
      { name: "Rohit Verma", email: "rohit@example.com", role: "USER" },
    ])
    .onConflictDoUpdate({ target: users.email, set: { isActive: true } });

  const all = await db.select().from(users);
  const staff = all.filter((u) => u.role !== "USER");
  const employees = all.filter((u) => u.role === "USER");
  if (staff.length === 0 || employees.length === 0) {
    console.log("  run `npm run db:seed` first (needs base users). Skipping.");
    return;
  }

  const existing = await db.select({ id: tickets.id }).from(tickets);
  if (existing.length >= 20) {
    console.log(`  already ${existing.length} tickets — skipping demo generation.`);
    return;
  }

  const N = 42;
  const now = Date.now();
  for (let i = 0; i < N; i++) {
    const department = DEPARTMENTS[i % DEPARTMENTS.length];
    const priority = PRIORITIES[(i * 3 + 1) % PRIORITIES.length];
    const creator = employees[i % employees.length];
    const status = statusFor(i);
    const assignee =
      status === "OPEN" && i % 3 !== 0 ? null : staff[i % staff.length];

    const daysAgo = Math.floor((i * 29) / N);
    const created = new Date(now - daysAgo * DAY - (i % 20) * HOUR);
    const resolvedAt =
      status === "RESOLVED" || status === "CLOSED"
        ? new Date(created.getTime() + (4 + (i % 40)) * HOUR)
        : null;
    const title = TITLES[i % TITLES.length];
    const id = crypto.randomUUID();

    await db.insert(tickets).values({
      id,
      number: sql`'MIS-' || nextval('ticket_seq')`,
      title,
      description: `${title}. Reported by the ${department} team — steps to reproduce and details attached where relevant.`,
      department,
      priority,
      status,
      createdBy: creator.id,
      assignedTo: assignee?.id ?? null,
      resolvedAt,
      resolvedBy: resolvedAt ? (assignee?.id ?? staff[0].id) : null,
      createdAt: created,
      updatedAt: resolvedAt ?? created,
    });

    await db.insert(ticketActivity).values({
      ticketId: id,
      actorId: creator.id,
      type: "CREATED",
      createdAt: created,
    });
    if (assignee) {
      await db.insert(ticketActivity).values({
        ticketId: id,
        actorId: staff[0].id,
        type: "ASSIGNED",
        toValue: assignee.name,
        createdAt: new Date(created.getTime() + HOUR),
      });
    }
    if (i % 4 === 0) {
      const author = assignee ?? staff[0];
      const at = new Date(created.getTime() + 2 * HOUR);
      await db.insert(ticketComments).values({
        ticketId: id,
        authorId: author.id,
        body: "Looking into this now — will update shortly.",
        createdAt: at,
      });
      await db.insert(ticketActivity).values({
        ticketId: id,
        actorId: author.id,
        type: "COMMENTED",
        createdAt: at,
      });
    }
  }

  const total = (await db.select({ id: tickets.id }).from(tickets)).length;
  console.log(`  ✓ demo data seeded — ${total} tickets total.`);
}

main()
  .then(() => process.exit(0))
  .catch((e) => {
    console.error(e);
    process.exit(1);
  });
