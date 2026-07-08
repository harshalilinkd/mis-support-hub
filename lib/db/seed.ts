/**
 * Seed script — 3 users (one per role) + 2 sample tickets with activity rows,
 * so later phases have data to work with.
 *
 * Run with:  npm run db:seed
 *
 * Self-contained: it builds its own neon-http client after loading .env.local,
 * so it doesn't depend on import order. The ticket-creation logic mirrors
 * lib/db/queries.ts#createTicket (client-side id + db.batch for atomicity).
 */
import { config } from "dotenv";

config({ path: ".env.local" });

import { neon } from "@neondatabase/serverless";
import { eq, sql } from "drizzle-orm";
import { drizzle } from "drizzle-orm/neon-http";

import * as schema from "./schema";
import { ticketActivity, tickets, users } from "./schema";

if (!process.env.DATABASE_URL) {
  throw new Error("DATABASE_URL is not set (expected in .env.local)");
}

const db = drizzle(neon(process.env.DATABASE_URL), { schema });

async function createTicket(args: {
  title: string;
  description: string;
  department: (typeof schema.departmentEnum.enumValues)[number];
  priority: (typeof schema.priorityEnum.enumValues)[number];
  sheetLink?: string | null;
  createdBy: string;
}) {
  const id = crypto.randomUUID();
  const [rows] = await db.batch([
    db
      .insert(tickets)
      .values({
        id,
        number: sql`'MIS-' || nextval('ticket_seq')`,
        title: args.title,
        description: args.description,
        department: args.department,
        priority: args.priority,
        sheetLink: args.sheetLink ?? null,
        createdBy: args.createdBy,
      })
      .returning(),
    db.insert(ticketActivity).values({
      ticketId: id,
      actorId: args.createdBy,
      type: "CREATED",
    }),
  ]);
  return rows[0];
}

async function main() {
  console.log("Seeding database…");

  // --- Users: one per role, idempotent by email ---
  const insertedUsers = await db
    .insert(users)
    .values([
      { name: "Aria Admin", email: "admin@example.com", role: "MIS_ADMIN" },
      { name: "Sam Staff", email: "staff@example.com", role: "MIS_STAFF" },
      { name: "Uma User", email: "user@example.com", role: "USER" },
    ])
    .onConflictDoUpdate({ target: users.email, set: { isActive: true } })
    .returning();

  const byEmail = new Map(insertedUsers.map((u) => [u.email, u]));
  const admin = byEmail.get("admin@example.com")!;
  const staff = byEmail.get("staff@example.com")!;
  const user = byEmail.get("user@example.com")!;
  console.log(`  ✓ users: ${insertedUsers.map((u) => u.role).join(", ")}`);

  // --- Tickets: seed once, so re-running doesn't pile up sample data ---
  const existing = await db.select({ id: tickets.id }).from(tickets).limit(1);
  if (existing.length > 0) {
    console.log("  • tickets already present — skipping ticket seed.");
    console.log("Seed complete.");
    return;
  }

  const t1 = await createTicket({
    title: "AppSheet sync failing on VHAGAR production sheet",
    description:
      "The VHAGAR production-entry AppSheet stopped syncing this morning. New rows aren't reaching the master sheet. Please check the Apps Script trigger.",
    department: "VHAGAR",
    priority: "HIGH",
    createdBy: user.id,
    sheetLink:
      "https://docs.google.com/spreadsheets/d/1exampleVHAGARproductionsheet/edit",
  });

  const t2 = await createTicket({
    title: "Add a 'Courier AWB' column to the LINKD dispatch tracker",
    description:
      "Please add a Courier AWB column to the LINKD dispatch tracker and expose it in the dispatch AppSheet form.",
    department: "LINKD",
    priority: "MEDIUM",
    createdBy: staff.id,
    sheetLink:
      "https://docs.google.com/spreadsheets/d/1exampleLINKDdispatchtracker/edit",
  });

  // Extra activity on t1: admin assigns it to staff, who starts work.
  await db
    .update(tickets)
    .set({ assignedTo: staff.id, status: "IN_PROGRESS" })
    .where(eq(tickets.id, t1.id));
  await db.insert(ticketActivity).values([
    {
      ticketId: t1.id,
      actorId: admin.id,
      type: "ASSIGNED",
      toValue: staff.name,
    },
    {
      ticketId: t1.id,
      actorId: staff.id,
      type: "STATUS_CHANGED",
      fromValue: "OPEN",
      toValue: "IN_PROGRESS",
    },
  ]);

  console.log(`  ✓ tickets: ${t1.number} (VHAGAR), ${t2.number} (LINKD)`);
  console.log("  ✓ activity rows written");
  console.log("Seed complete.");
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error("Seed failed:", error);
    process.exit(1);
  });
