import { eq, sql } from "drizzle-orm";

import { db } from "./index";
import {
  type ActivityType,
  type Department,
  type Priority,
  ticketActivity,
  tickets,
  users,
} from "./schema";

/* ------------------------------------------------------------------ *
 * Users
 * ------------------------------------------------------------------ */
export async function getUserById(id: string) {
  const [row] = await db.select().from(users).where(eq(users.id, id)).limit(1);
  return row ?? null;
}

export async function getUserByEmail(email: string) {
  const [row] = await db
    .select()
    .from(users)
    .where(eq(users.email, email.toLowerCase()))
    .limit(1);
  return row ?? null;
}

/* ------------------------------------------------------------------ *
 * Tickets
 * ------------------------------------------------------------------ */
export interface CreateTicketArgs {
  title: string;
  description: string;
  department: Department;
  priority?: Priority;
  sheetLink?: string | null;
  createdBy: string;
}

/**
 * Insert a ticket and its CREATED activity row.
 *
 * Ticket number: generated in the insert path via `nextval('ticket_seq')`
 * (CLAUDE.md §9) — never derived from a row count, and there is no column
 * default, so every insert must go through here.
 *
 * Atomicity: the neon-http driver has no interactive transactions
 * (`db.transaction()` throws), so we generate the ticket id client-side and use
 * `db.batch()` — a single atomic HTTP transaction — to write the ticket and its
 * activity row together. This is the canonical mutation pattern for §9; later
 * status/assignment actions follow the same batch shape.
 */
export async function createTicket(args: CreateTicketArgs) {
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
        priority: args.priority ?? "MEDIUM",
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

export async function getTicketByNumber(number: string) {
  const [row] = await db
    .select()
    .from(tickets)
    .where(eq(tickets.number, number))
    .limit(1);
  return row ?? null;
}

export async function getTicketById(id: string) {
  const [row] = await db
    .select()
    .from(tickets)
    .where(eq(tickets.id, id))
    .limit(1);
  return row ?? null;
}

/* ------------------------------------------------------------------ *
 * Activity (audit trail — CLAUDE.md §9)
 * ------------------------------------------------------------------ */
export interface LogActivityArgs {
  ticketId: string;
  actorId: string;
  type: ActivityType;
  fromValue?: string | null;
  toValue?: string | null;
}

export async function logActivity(args: LogActivityArgs) {
  await db.insert(ticketActivity).values({
    ticketId: args.ticketId,
    actorId: args.actorId,
    type: args.type,
    fromValue: args.fromValue ?? null,
    toValue: args.toValue ?? null,
  });
}
