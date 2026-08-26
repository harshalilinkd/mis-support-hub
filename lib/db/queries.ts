import {
  and,
  asc,
  desc,
  eq,
  ilike,
  inArray,
  isNotNull,
  isNull,
  lte,
  notInArray,
  or,
  sql,
  type SQL,
} from "drizzle-orm";
import { alias } from "drizzle-orm/pg-core";

import { db } from "./index";
import {
  type Department,
  type NotificationType,
  type Priority,
  type ProgressLogType,
  type Role,
  type Status,
  type TicketType,
  notifications,
  progressLogs,
  requestDetails,
  ticketActivity,
  ticketAttachments,
  ticketComments,
  tickets,
  users,
  type SystemStatus,
  type SystemType,
  accessGrantees,
  systemAccessConfirmations,
  systems,
  accessRequests,
} from "./schema";
import { TICKET_TABS, statusesForTab, type TicketTabKey } from "@/lib/ticket-tabs";
import { assertStatusForType, AUTO_CLOSE_DAYS } from "@/lib/ticket-state";

/* ------------------------------------------------------------------ *
 * Users
 * ------------------------------------------------------------------ */

/**
 * Sentinel account that inherits a deleted user's ticket history so their
 * tickets, comments, and audit rows survive the delete (CLAUDE.md §4). It can
 * never sign in (inactive, no password / OAuth) and is hidden from the users
 * list. The `.invalid` TLD is reserved by RFC 2606 so it can't collide with a
 * real company address.
 */
export const DELETED_USER_EMAIL = "deleted-user@placeholder.invalid";

/**
 * The SYSTEM actor — the author of automated audit rows (e.g. an auto-close, §5). Like
 * the deleted-user placeholder it can never sign in and is hidden from the users list;
 * it exists only so ticket_activity.actor_id (NOT NULL) has a truthful owner for an
 * action no human took.
 */
export const SYSTEM_USER_EMAIL = "system@placeholder.invalid";

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

export async function setUserProfile(
  userId: string,
  name: string,
  department: Department | null
) {
  await db.update(users).set({ name, department }).where(eq(users.id, userId));
}

/** Set/replace a user's password hash (email+password sign-in). */
export async function setUserPasswordHash(id: string, passwordHash: string) {
  await db.update(users).set({ passwordHash }).where(eq(users.id, id));
}

/**
 * Dev-only: make sure a users row exists for the given id so foreign keys that
 * point at it (e.g. tickets.created_by) are satisfiable. Idempotent and
 * NON-destructive — onConflictDoNothing() so impersonating a real user via
 * DEV_STUB_ID never overwrites that user's row.
 */
export async function ensureUserRow(u: {
  id: string;
  name: string | null;
  email: string;
  role: Role;
  department: Department | null;
}) {
  await db
    .insert(users)
    .values({
      id: u.id,
      name: u.name,
      email: u.email,
      role: u.role,
      department: u.department,
      isActive: true,
    })
    .onConflictDoNothing();
}

/** Admin-created account: email + password, with an explicit role/department. */
export async function insertUserWithRole(args: {
  name: string;
  email: string;
  passwordHash: string;
  role: Role;
  department: Department | null;
}) {
  const [row] = await db
    .insert(users)
    .values({
      name: args.name,
      email: args.email.toLowerCase(),
      passwordHash: args.passwordHash,
      role: args.role,
      department: args.department,
    })
    .returning();
  return row;
}

/** Active MIS staff/admin — candidates a ticket can be assigned to. */
export async function listAssignableUsers() {
  return db
    .select({
      id: users.id,
      name: users.name,
      email: users.email,
      image: users.image,
    })
    .from(users)
    .where(
      and(inArray(users.role, ["MIS_STAFF", "MIS_ADMIN"]), eq(users.isActive, true))
    )
    .orderBy(asc(users.name));
}

export type AssignableUser = Awaited<ReturnType<typeof listAssignableUsers>>[number];

/**
 * Distinct people who have RAISED an issue — the option set for the All Issues
 * "Reporter" facet. Unlike assignees (MIS staff only), reporters are mostly
 * employees, so this is derived from the tickets themselves rather than a role.
 * Same shape as AssignableUser so the toolbar reuses one Facet.
 */
export async function listIssueReporters(): Promise<AssignableUser[]> {
  return db
    .selectDistinct({
      id: users.id,
      name: users.name,
      email: users.email,
      image: users.image,
    })
    .from(users)
    .innerJoin(
      tickets,
      and(
        eq(tickets.createdBy, users.id),
        eq(tickets.type, "ISSUE"),
        isNull(tickets.deletedAt)
      )
    )
    .orderBy(asc(users.name));
}

// NOTE: `createUserWithPassword` (self-signup) was removed deliberately — it was an
// unauthenticated way to mint an active users row, which defeated the invite-only
// gate in lib/auth.ts (§7). Admin account creation goes through `insertUserWithRole`,
// which is reachable only from an MIS_ADMIN action. Don't add an unguarded
// user-insert helper back.

/**
 * Every user, for the admin Settings → Users screen. Never selects the
 * password hash — only whether one is set (`hasPassword`).
 */
export async function listAllUsers() {
  return db
    .select({
      id: users.id,
      name: users.name,
      email: users.email,
      image: users.image,
      role: users.role,
      isActive: users.isActive,
      department: users.department,
      hasPassword: sql<boolean>`(${users.passwordHash} is not null)`,
      createdAt: users.createdAt,
      ticketCount:
        sql<number>`(select count(*) from ${tickets} where ${tickets.createdBy} = ${users.id})`.mapWith(
          Number
        ),
    })
    .from(users)
    // Hide the placeholder rows (Deleted user, System) from the admin list — plumbing.
    .where(notInArray(users.email, [DELETED_USER_EMAIL, SYSTEM_USER_EMAIL]))
    .orderBy(asc(users.name), asc(users.email));
}

export type AdminUserRow = Awaited<ReturnType<typeof listAllUsers>>[number];

/** Change a user's role. Caller must enforce MIS_ADMIN (CLAUDE.md §6). */
export async function setUserRole(id: string, role: Role) {
  await db.update(users).set({ role }).where(eq(users.id, id));
}

/** Activate/deactivate a user (blocks sign-in). Caller must enforce MIS_ADMIN. */
export async function setUserActiveStatus(id: string, isActive: boolean) {
  await db.update(users).set({ isActive }).where(eq(users.id, id));
}

/**
 * Auto-release a member's in-flight tickets when they're deactivated. Because a
 * claimed ticket is locked to its assignee (§6) and a deactivated user can no
 * longer sign in, their tickets would otherwise be frozen. So: unassign every
 * non-closed ticket assigned to them, and return the active ones (OPEN /
 * IN_PROGRESS / REOPENED) to the unclaimed pool — status → OPEN, priority +
 * deadline cleared — so anyone can re-claim. RESOLVED tickets are only
 * unassigned (kept resolved for the reporter to confirm; a later reopen lands
 * unassigned and claimable). Writes an audit row per change. Returns the count.
 */
export async function releaseTicketsOfUser(
  userId: string,
  actorId: string
): Promise<number> {
  const rows = await db
    .select({ id: tickets.id, status: tickets.status })
    .from(tickets)
    .where(
      and(
        eq(tickets.assignedTo, userId),
        // Only ISSUE tickets — requests have their own claim/assignment model (§12).
        eq(tickets.type, "ISSUE"),
        isNull(tickets.deletedAt),
        sql`${tickets.status}::text <> 'CLOSED'`
      )
    );
  if (rows.length === 0) return 0;

  const stmts = [];
  for (const t of rows) {
    // Return active work to the pool; leave a RESOLVED ticket resolved.
    const reset = t.status !== "RESOLVED";
    const set: Partial<typeof tickets.$inferInsert> = { assignedTo: null };
    if (reset) {
      set.status = "OPEN";
      set.priority = null;
      set.deadline = null;
    }
    stmts.push(db.update(tickets).set(set).where(eq(tickets.id, t.id)));
    // Audit: the unassignment (timeline reads "unassigned it").
    stmts.push(
      db.insert(ticketActivity).values({
        ticketId: t.id,
        actorId,
        type: "ASSIGNED",
        fromValue: null,
        toValue: null,
      })
    );
    // Audit: the status reset, only when it actually changed.
    if (reset && t.status !== "OPEN") {
      stmts.push(
        db.insert(ticketActivity).values({
          ticketId: t.id,
          actorId,
          type: "STATUS_CHANGED",
          fromValue: t.status,
          toValue: "OPEN",
        })
      );
    }
  }

  await db.batch(stmts as unknown as Parameters<typeof db.batch>[0]);
  return rows.length;
}

/** Update a user's editable profile fields (admin). Caller must enforce MIS_ADMIN. */
export async function updateUserProfile(args: {
  id: string;
  name: string;
  email: string;
  department: Department | null;
}) {
  await db
    .update(users)
    .set({
      name: args.name,
      email: args.email.toLowerCase(),
      department: args.department,
    })
    .where(eq(users.id, args.id));
}

/** Get (or lazily create) the "Deleted user" placeholder row; returns its id. */
async function getOrCreateDeletedPlaceholderId(): Promise<string> {
  await db
    .insert(users)
    .values({
      name: "Deleted user",
      email: DELETED_USER_EMAIL,
      role: "USER",
      isActive: false,
    })
    .onConflictDoNothing({ target: users.email });

  const [row] = await db
    .select({ id: users.id })
    .from(users)
    .where(eq(users.email, DELETED_USER_EMAIL))
    .limit(1);
  if (!row) throw new Error("Failed to provision the deleted-user placeholder.");
  return row.id;
}

/** Get (or lazily create) the SYSTEM actor row; returns its id (§5 auto-close). */
export async function getOrCreateSystemUserId(): Promise<string> {
  await db
    .insert(users)
    .values({
      name: "System",
      email: SYSTEM_USER_EMAIL,
      role: "USER",
      isActive: false,
    })
    .onConflictDoNothing({ target: users.email });

  const [row] = await db
    .select({ id: users.id })
    .from(users)
    .where(eq(users.email, SYSTEM_USER_EMAIL))
    .limit(1);
  if (!row) throw new Error("Failed to provision the system user.");
  return row.id;
}

/**
 * Reassign everything a user is referenced by to the "Deleted user" placeholder, then
 * delete the account — in one atomic batch (neon-http has no interactive transactions,
 * CLAUDE.md §9). History (tickets, comments, activity, attachments, progress logs,
 * request decisions, systems, grantee confirmations) is preserved but reattributed;
 * *current* assignments (ticket assignee, request builder) are cleared, mirroring a
 * release. accounts/sessions/notifications cascade. Caller enforces MIS_ADMIN and
 * blocks self-deletion.
 *
 * EVERY non-cascade FK to `users.id` must be handled here — a missed one throws a
 * foreign-key violation and the whole delete fails with a generic error. When a new
 * table references users.id, add its column to this batch.
 */
export async function reassignReferencesAndDeleteUser(userId: string) {
  const placeholderId = await getOrCreateDeletedPlaceholderId();
  // Guard against ever destroying the placeholder itself.
  if (placeholderId === userId) {
    throw new Error("Refusing to delete the deleted-user placeholder.");
  }

  await db.batch([
    // --- Tickets (issues AND requests share this table, §12) ---
    db
      .update(tickets)
      .set({ createdBy: placeholderId })
      .where(eq(tickets.createdBy, userId)),
    db
      .update(tickets)
      .set({ assignedTo: null })
      .where(eq(tickets.assignedTo, userId)),
    db
      .update(tickets)
      .set({ resolvedBy: placeholderId })
      .where(eq(tickets.resolvedBy, userId)),
    // Who soft-deleted a ticket (audit) — reattribute, don't orphan.
    db
      .update(tickets)
      .set({ deletedBy: placeholderId })
      .where(eq(tickets.deletedBy, userId)),
    db
      .update(ticketComments)
      .set({ authorId: placeholderId })
      .where(eq(ticketComments.authorId, userId)),
    db
      .update(ticketActivity)
      .set({ actorId: placeholderId })
      .where(eq(ticketActivity.actorId, userId)),
    db
      .update(ticketAttachments)
      .set({ uploadedBy: placeholderId })
      .where(eq(ticketAttachments.uploadedBy, userId)),
    // --- Requests (§12) ---
    // The recorded-on-MD's-behalf decision is an accountability record — keep it,
    // reattributed. The build assignment is CURRENT state — clear it, mirroring the
    // assignedTo → null above (deleting the assignee unassigns their build).
    db
      .update(requestDetails)
      .set({ mdDecisionRecordedBy: placeholderId })
      .where(eq(requestDetails.mdDecisionRecordedBy, userId)),
    db
      .update(requestDetails)
      .set({ claimedBy: null })
      .where(eq(requestDetails.claimedBy, userId)),
    db
      .update(progressLogs)
      .set({ authorId: placeholderId })
      .where(eq(progressLogs.authorId, userId)),
    // --- Systems directory (§13). owner/logger/confirmedBy are NOT NULL, so they
    // must be reattributed to the placeholder (an admin can reassign ownership after). ---
    db
      .update(systems)
      .set({ ownerId: placeholderId })
      .where(eq(systems.ownerId, userId)),
    db
      .update(systems)
      .set({ loggedBy: placeholderId })
      .where(eq(systems.loggedBy, userId)),
    db
      .update(systemAccessConfirmations)
      .set({ confirmedBy: placeholderId })
      .where(eq(systemAccessConfirmations.confirmedBy, userId)),
    // --- Access requests (§7). Keep the decision audit (placeholder); null the link
    // to the account being deleted (createdUserId pointed AT this user). ---
    db
      .update(accessRequests)
      .set({ decidedBy: placeholderId })
      .where(eq(accessRequests.decidedBy, userId)),
    db
      .update(accessRequests)
      .set({ createdUserId: null })
      .where(eq(accessRequests.createdUserId, userId)),
    db.delete(users).where(eq(users.id, userId)),
  ]);
}

/* ------------------------------------------------------------------ *
 * Aliases (users is joined several times per query)
 * ------------------------------------------------------------------ */
const creatorUser = alias(users, "creator");
const assigneeUser = alias(users, "assignee");
const resolverUser = alias(users, "resolver");
const authorUser = alias(users, "author");
const actorUser = alias(users, "actor");
const deleterUser = alias(users, "deleter");

/* ------------------------------------------------------------------ *
 * Ticket writes — each is atomic (ticket + activity via db.batch, since
 * neon-http has no interactive transactions). CLAUDE.md §9.
 * ------------------------------------------------------------------ */
export interface CreateTicketArgs {
  title: string;
  description: string;
  department: Department;
  priority?: Priority;
  sheetLink?: string | null;
  createdBy: string;
}

export async function createTicket(args: CreateTicketArgs) {
  const id = crypto.randomUUID();
  const [rows] = await db.batch([
    db
      .insert(tickets)
      .values({
        id,
        // Number from the sequence in the insert path — never a row count (§9).
        // Zero-padded to 3 digits: MIS-003, MIS-042, MIS-100, … (MIS-1000+ grows).
        number: sql`'MIS-' || lpad(nextval('ticket_seq')::text, 3, '0')`,
        title: args.title,
        description: args.description,
        department: args.department,
        // Unset on raise — the MIS team sets priority when they claim.
        priority: args.priority ?? null,
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

export async function setTicketStatus(args: {
  ticketId: string;
  actorId: string;
  /** The row's real type — asserted against, so this writer can't rubber-stamp a
   *  cross-machine status onto the wrong ticket type (§12). */
  type: TicketType;
  from: Status;
  to: Status;
  resolvedAt?: Date | null;
  resolvedBy?: string | null;
  /**
   * Set ONLY when `resolvedAt` was dated to a day other than today (§5.2) — the real
   * instant the change was recorded. Writes a second COMPLETION_DATED activity row in
   * the same batch, because the STATUS_CHANGED row alone cannot show it: its created_at
   * is today while resolved_at says last week, with nothing tying the two together or
   * naming who chose the date. A chosen date moves the ticket's numbers in the
   * dashboard's averages (§10), so it is exactly the kind of act §12.5 needs a trail for.
   */
  datedFrom?: Date;
}) {
  assertStatusForType(args.type, args.to);
  const set: Partial<typeof tickets.$inferInsert> = { status: args.to };
  if (args.resolvedAt !== undefined) set.resolvedAt = args.resolvedAt;
  if (args.resolvedBy !== undefined) set.resolvedBy = args.resolvedBy;
  await db.batch([
    db.update(tickets).set(set).where(eq(tickets.id, args.ticketId)),
    db.insert(ticketActivity).values({
      ticketId: args.ticketId,
      actorId: args.actorId,
      type: "STATUS_CHANGED",
      fromValue: args.from,
      toValue: args.to,
    }),
    // from = when it was recorded, to = the resolution date recorded (both ISO), so the
    // timeline can read "…dated the resolution 13 Aug 2026".
    ...(args.datedFrom && args.resolvedAt
      ? [
          db.insert(ticketActivity).values({
            ticketId: args.ticketId,
            actorId: args.actorId,
            type: "COMPLETION_DATED",
            fromValue: args.datedFrom.toISOString(),
            toValue: args.resolvedAt.toISOString(),
          }),
        ]
      : []),
  ]);
}

export async function reopenTicketRow(args: {
  ticketId: string;
  actorId: string;
  from: Status;
}) {
  await db.batch([
    db
      .update(tickets)
      // Clear auto_closed_at too: reopening from an auto-close ends that state, so it
      // can't be reopened again from CLOSED once it's back in the flow.
      .set({ status: "REOPENED", resolvedAt: null, resolvedBy: null, autoClosedAt: null })
      .where(eq(tickets.id, args.ticketId)),
    db.insert(ticketActivity).values({
      ticketId: args.ticketId,
      actorId: args.actorId,
      type: "REOPENED",
      fromValue: args.from,
      toValue: "REOPENED",
    }),
  ]);
}

/**
 * Reopen an AUTO-CLOSED request (§5): CLOSED → IN_TESTING, back at the UAT gate so the
 * requester can accept it or send it back. Clears auto_closed_at + the acceptance
 * timestamp the auto-close stamped. Guarded by the caller (requester/admin + the row
 * was auto-closed).
 */
export async function reopenAutoClosedRequestRow(args: {
  ticketId: string;
  actorId: string;
}) {
  await db.batch([
    db
      .update(tickets)
      .set({ status: "IN_TESTING", autoClosedAt: null })
      .where(eq(tickets.id, args.ticketId)),
    db
      .update(requestDetails)
      .set({ acceptedAt: null })
      .where(eq(requestDetails.ticketId, args.ticketId)),
    db.insert(ticketActivity).values({
      ticketId: args.ticketId,
      actorId: args.actorId,
      type: "REOPENED",
      fromValue: "CLOSED",
      toValue: "IN_TESTING",
    }),
  ]);
}

export async function setTicketAssignee(args: {
  ticketId: string;
  actorId: string;
  assigneeId: string | null;
  fromName: string | null;
  toName: string | null;
}) {
  await db.batch([
    db
      .update(tickets)
      .set({ assignedTo: args.assigneeId })
      .where(eq(tickets.id, args.ticketId)),
    db.insert(ticketActivity).values({
      ticketId: args.ticketId,
      actorId: args.actorId,
      type: "ASSIGNED",
      fromValue: args.fromName,
      toValue: args.toName,
    }),
  ]);
}

/**
 * Claim a ticket: assign it to the actor and set the priority, in one batch. The
 * ticket stays OPEN — work starts later, via startTaskRow (§5). The one exception
 * is the combined "claim & start" shortcut (board drag / status dropdown), where
 * the caller passes a deadline + startWork, and this also moves it to IN_PROGRESS
 * and writes the STARTED row. Writes a CLAIMED activity row only when ownership
 * actually changes (writeAssigned) — i.e. the first self-claim. The caller
 * enforces staff/claimability and the §6 ownership lock, so a claim only ever
 * lands on an unassigned ticket or one already the actor's (fromAssigneeName null).
 */
export async function claimTicketRow(args: {
  ticketId: string;
  actorId: string;
  actorName: string | null;
  fromAssigneeName: string | null;
  fromStatus: Status;
  fromPriority: Priority | null;
  priority: Priority;
  /** Only set when starting work in the same action (combined shortcut). */
  deadline: Date | null;
  writeAssigned: boolean;
  startWork: boolean;
  /** The day the ticket was actually claimed (§5.3). Defaults to now. */
  claimedAt?: Date;
  /** The day work began — only with the combined shortcut. Defaults to now. */
  startedAt?: Date;
  /** When the claim date was moved off today; drives the CLAIM_DATED audit row. */
  claimDatedFrom?: Date;
  /** When the start date was moved off today; drives the START_DATED audit row. */
  startDatedFrom?: Date;
}) {
  const claimedAt = args.claimedAt ?? new Date();
  const set: Partial<typeof tickets.$inferInsert> = {
    assignedTo: args.actorId,
    priority: args.priority,
  };
  // Only stamp the claim date on the FIRST self-claim — re-claiming your own ticket
  // (to re-prioritise) must not move the date you took it on.
  if (args.writeAssigned) set.claimedAt = claimedAt;
  // The deadline belongs to Start — only stamp it when we also start work here.
  const startedAt = args.startedAt ?? new Date();
  if (args.startWork && args.deadline) {
    set.status = "IN_PROGRESS";
    set.deadline = args.deadline;
    set.startedAt = startedAt;
  }

  const events = [];
  if (args.writeAssigned) {
    // A claim is always a self-assignment, so record it as CLAIMED (not ASSIGNED)
    // — the timeline then reads "claimed the ticket" instead of "assigned it to
    // <self>". A claim no longer carries a deadline (that's on STARTED); fromValue
    // (prior owner) is always null under the §6 ownership lock.
    events.push(
      db.insert(ticketActivity).values({
        ticketId: args.ticketId,
        actorId: args.actorId,
        type: "CLAIMED",
        fromValue: args.fromAssigneeName,
        toValue: null,
      })
    );
  }
  if (args.priority !== args.fromPriority) {
    events.push(
      db.insert(ticketActivity).values({
        ticketId: args.ticketId,
        actorId: args.actorId,
        type: "PRIORITY_CHANGED",
        fromValue: args.fromPriority,
        toValue: args.priority,
      })
    );
  }
  if (args.startWork && args.deadline) {
    // The combined shortcut also starts work: one STARTED row carries the OPEN→
    // IN_PROGRESS transition (in fromValue) and the deadline (in toValue).
    events.push(
      db.insert(ticketActivity).values({
        ticketId: args.ticketId,
        actorId: args.actorId,
        type: "STARTED",
        fromValue: args.fromStatus,
        toValue: args.deadline.toISOString(),
      })
    );
  }
  // A date moved off the day it was recorded is audited (§5.3), same shape as
  // COMPLETION_DATED: from = when it was entered, to = the date chosen.
  if (args.claimDatedFrom && args.writeAssigned) {
    events.push(
      db.insert(ticketActivity).values({
        ticketId: args.ticketId,
        actorId: args.actorId,
        type: "CLAIM_DATED",
        fromValue: args.claimDatedFrom.toISOString(),
        toValue: claimedAt.toISOString(),
      })
    );
  }
  if (args.startDatedFrom && args.startWork) {
    events.push(
      db.insert(ticketActivity).values({
        ticketId: args.ticketId,
        actorId: args.actorId,
        type: "START_DATED",
        fromValue: args.startDatedFrom.toISOString(),
        toValue: startedAt.toISOString(),
      })
    );
  }

  await db.batch([
    db.update(tickets).set(set).where(eq(tickets.id, args.ticketId)),
    ...events,
  ]);
}

/**
 * Start work on a ticket the actor has already claimed: set the deadline and move
 * it OPEN/REOPENED → IN_PROGRESS, in one batch. Writes a STARTED activity row (the
 * OPEN→IN_PROGRESS transition in fromValue, the deadline in toValue). The caller
 * enforces staff + the §6 ownership lock (only the assignee starts their ticket).
 */
export async function startTaskRow(args: {
  ticketId: string;
  actorId: string;
  fromStatus: Status;
  deadline: Date;
  /** The day work actually began (§5.3). Defaults to now when omitted. */
  startedAt?: Date;
  /** Set when startedAt is a day other than today — see setTicketStatus.datedFrom. */
  datedFrom?: Date;
}) {
  const startedAt = args.startedAt ?? new Date();
  await db.batch([
    db
      .update(tickets)
      .set({ status: "IN_PROGRESS", deadline: args.deadline, startedAt })
      .where(eq(tickets.id, args.ticketId)),
    db.insert(ticketActivity).values({
      ticketId: args.ticketId,
      actorId: args.actorId,
      type: "STARTED",
      fromValue: args.fromStatus,
      toValue: args.deadline.toISOString(),
    }),
    // Same audit shape as COMPLETION_DATED (§5.2): the start was moved off the day it
    // was recorded, so the trail says who chose it and when. The STARTED row can't show
    // it — its created_at is today while started_at says last week.
    ...(args.datedFrom
      ? [
          db.insert(ticketActivity).values({
            ticketId: args.ticketId,
            actorId: args.actorId,
            type: "START_DATED",
            fromValue: args.datedFrom.toISOString(),
            toValue: startedAt.toISOString(),
          }),
        ]
      : []),
  ]);
}

/**
 * Undo a claim: return a ticket to the open pool, in one batch. Clears the assignee,
 * the priority and any deadline, and forces the status back to OPEN.
 *
 * `from` is the status being left. It is recorded on the UNCLAIMED activity row so the
 * timeline distinguishes the two undos: releasing a claim that never started (from
 * OPEN — a no-op status-wise) versus abandoning work already begun (from IN_PROGRESS —
 * which the reporter was told about, and is told about again, §8).
 *
 * The caller enforces staff + the §6 ownership lock (only the assignee releases their
 * own claim) via canReleaseTicket.
 */
export async function releaseTicketRow(args: {
  ticketId: string;
  actorId: string;
  from: Status;
}) {
  await db.batch([
    db
      .update(tickets)
      // status back to OPEN explicitly: a release from IN_PROGRESS/REOPENED has to
      // undo the start, not just the assignment. Harmless when already OPEN.
      // startedAt clears with the rest: a release undoes the start, so leaving the old
      // start date behind would date a later re-start to the abandoned attempt.
      .set({
        assignedTo: null,
        priority: null,
        deadline: null,
        claimedAt: null,
        startedAt: null,
        status: "OPEN",
      })
      .where(eq(tickets.id, args.ticketId)),
    db.insert(ticketActivity).values({
      ticketId: args.ticketId,
      actorId: args.actorId,
      type: "UNCLAIMED",
      fromValue: args.from,
      toValue: "OPEN",
    }),
  ]);
}

export async function setTicketPriority(args: {
  ticketId: string;
  actorId: string;
  from: Priority | null;
  to: Priority;
}) {
  await db.batch([
    db
      .update(tickets)
      .set({ priority: args.to })
      .where(eq(tickets.id, args.ticketId)),
    db.insert(ticketActivity).values({
      ticketId: args.ticketId,
      actorId: args.actorId,
      type: "PRIORITY_CHANGED",
      fromValue: args.from,
      toValue: args.to,
    }),
  ]);
}

export async function addTicketComment(args: {
  ticketId: string;
  authorId: string;
  body: string;
}) {
  const [rows] = await db.batch([
    db
      .insert(ticketComments)
      .values({
        ticketId: args.ticketId,
        authorId: args.authorId,
        body: args.body,
      })
      .returning(),
    db.insert(ticketActivity).values({
      ticketId: args.ticketId,
      actorId: args.authorId,
      type: "COMMENTED",
    }),
  ]);
  return rows[0];
}

export async function updateTicketFields(args: {
  ticketId: string;
  actorId: string;
  title: string;
  description: string;
  department: Department;
  sheetLink: string | null;
}) {
  await db.batch([
    db
      .update(tickets)
      .set({
        title: args.title,
        description: args.description,
        department: args.department,
        sheetLink: args.sheetLink,
      })
      .where(eq(tickets.id, args.ticketId)),
    db.insert(ticketActivity).values({
      ticketId: args.ticketId,
      actorId: args.actorId,
      type: "EDITED",
    }),
  ]);
}

/** Delete a ticket — comments, attachments, activity, and notifications cascade. */
export async function deleteTicketById(id: string) {
  await db.delete(tickets).where(eq(tickets.id, id));
}

/** Soft-delete → move a ticket to the recycle bin (hidden everywhere but the bin). */
export async function softDeleteTicketById(id: string, deletedBy: string) {
  await db
    .update(tickets)
    .set({ deletedAt: new Date(), deletedBy })
    .where(and(eq(tickets.id, id), isNull(tickets.deletedAt)));
}

/**
 * Bulk soft-delete in ONE statement (row-level multi-select delete). Returns the
 * ids actually deleted, so the caller derives `failed = requested - deleted`.
 * `reporterId` set (non-admin path) restricts to that reporter's own still-OPEN
 * tickets — mirrors deleteTicket's rule (§6) purely in SQL, no per-row reads.
 */
export async function bulkSoftDeleteTickets(args: {
  ids: string[];
  deletedBy: string;
  reporterId?: string;
}): Promise<string[]> {
  if (args.ids.length === 0) return [];
  const conds = [inArray(tickets.id, args.ids), isNull(tickets.deletedAt)];
  if (args.reporterId) {
    conds.push(eq(tickets.createdBy, args.reporterId), eq(tickets.status, "OPEN"));
  }
  const rows = await db
    .update(tickets)
    .set({ deletedAt: new Date(), deletedBy: args.deletedBy })
    .where(and(...conds))
    .returning({ id: tickets.id });
  return rows.map((r) => r.id);
}

/** Restore a ticket from the recycle bin (clears the soft-delete marks). */
export async function restoreTicketById(id: string) {
  await db
    .update(tickets)
    .set({ deletedAt: null, deletedBy: null })
    .where(eq(tickets.id, id));
}

/** A single recycle-bin ticket — only if it is currently soft-deleted. */
export async function getDeletedTicketById(id: string) {
  const [row] = await db
    .select()
    .from(tickets)
    .where(and(eq(tickets.id, id), isNotNull(tickets.deletedAt)))
    .limit(1);
  return row ?? null;
}

/** Recycle bin: soft-deleted tickets with reporter + who/when deleted, newest first. */
export async function listDeletedTickets() {
  return db
    .select({
      id: tickets.id,
      number: tickets.number,
      title: tickets.title,
      department: tickets.department,
      status: tickets.status,
      priority: tickets.priority,
      createdAt: tickets.createdAt,
      deletedAt: tickets.deletedAt,
      createdByName: creatorUser.name,
      deletedByName: deleterUser.name,
    })
    .from(tickets)
    .leftJoin(creatorUser, eq(tickets.createdBy, creatorUser.id))
    .leftJoin(deleterUser, eq(tickets.deletedBy, deleterUser.id))
    .where(isNotNull(tickets.deletedAt))
    .orderBy(desc(tickets.deletedAt));
}
export type DeletedTicketRow = Awaited<
  ReturnType<typeof listDeletedTickets>
>[number];

export async function logActivity(args: {
  ticketId: string;
  actorId: string;
  type: (typeof ticketActivity.$inferInsert)["type"];
  fromValue?: string | null;
  toValue?: string | null;
}) {
  await db.insert(ticketActivity).values({
    ticketId: args.ticketId,
    actorId: args.actorId,
    type: args.type,
    fromValue: args.fromValue ?? null,
    toValue: args.toValue ?? null,
  });
}

export async function addAttachment(args: {
  ticketId: string;
  commentId?: string | null;
  url: string;
  filename: string;
  contentType: string;
  sizeBytes: number;
  uploadedBy: string;
}) {
  const [row] = await db
    .insert(ticketAttachments)
    .values({
      ticketId: args.ticketId,
      commentId: args.commentId ?? null,
      url: args.url,
      filename: args.filename,
      contentType: args.contentType,
      sizeBytes: args.sizeBytes,
      uploadedBy: args.uploadedBy,
    })
    .returning();
  return row;
}

/* ------------------------------------------------------------------ *
 * Ticket reads
 * ------------------------------------------------------------------ */
export interface TicketFilters {
  status?: Status;
  /** Match any of these statuses (used by the All Tickets tabs: Open/In Progress/Resolved). */
  statuses?: Status[];
  priority?: Priority;
  department?: Department;
  assigneeId?: string | "unassigned";
  /** Filter by who RAISED the ticket (tickets.created_by). */
  reporterId?: string;
  search?: string;
  /** Optional ISSUE|REQUEST filter (§12). Defaults to no filter when unset. */
  type?: TicketType;
}

/** Raw single-row fetch (no joins) — for permission/state checks in actions. */
export async function getTicketById(id: string) {
  const [row] = await db
    .select()
    .from(tickets)
    .where(and(eq(tickets.id, id), isNull(tickets.deletedAt)))
    .limit(1);
  return row ?? null;
}

/** Attachment metadata shown inline in the list tables (link/thumbnail chips). */
export type TicketAttachmentThumb = {
  id: string;
  url: string;
  filename: string;
  contentType: string;
};

// Layered projections so each list fetches only what it renders (perf): the
// board needs just the two counts; My Tickets adds the attachment thumbnails;
// only All Tickets needs the full `description` body (its bulk-claim modal reads
// it). Each layer extends the one above.
const ticketBoardSelect = {
  id: tickets.id,
  number: tickets.number,
  title: tickets.title,
  department: tickets.department,
  status: tickets.status,
  priority: tickets.priority,
  sheetLink: tickets.sheetLink,
  deadline: tickets.deadline,
  claimedAt: tickets.claimedAt,
  startedAt: tickets.startedAt,
  createdAt: tickets.createdAt,
  updatedAt: tickets.updatedAt,
  resolvedAt: tickets.resolvedAt,
  createdById: tickets.createdBy,
  createdByName: creatorUser.name,
  createdByImage: creatorUser.image,
  assignedToId: tickets.assignedTo,
  assignedToName: assigneeUser.name,
  assignedToImage: assigneeUser.image,
  commentCount:
    sql<number>`(select count(*) from ${ticketComments} where ${ticketComments.ticketId} = ${tickets.id})`.mapWith(
      Number
    ),
  attachmentCount:
    sql<number>`(select count(*) from ${ticketAttachments} where ${ticketAttachments.ticketId} = ${tickets.id})`.mapWith(
      Number
    ),
};

// + attachment metadata for inline thumbnails/links (My Tickets, All Tickets).
const ticketListSelectLite = {
  ...ticketBoardSelect,
  attachments: sql<TicketAttachmentThumb[]>`(
    select coalesce(
      json_agg(json_build_object(
        'id', ${ticketAttachments.id},
        'url', ${ticketAttachments.url},
        'filename', ${ticketAttachments.filename},
        'contentType', ${ticketAttachments.contentType}
      ) order by ${ticketAttachments.createdAt}),
      '[]'::json
    )
    from ${ticketAttachments}
    where ${ticketAttachments.ticketId} = ${tickets.id}
  )`,
};

// + the full ticket body — only All Tickets (the bulk-claim modal shows it).
const ticketListSelect = {
  ...ticketListSelectLite,
  description: tickets.description,
};

function ticketFilterConditions(filters: TicketFilters): SQL[] {
  // Soft-deleted tickets live only in the recycle bin — never in any list.
  const conds: SQL[] = [isNull(tickets.deletedAt)];
  // Optional type filter (§12); no default here — issue-only surfaces add their
  // own eq(type, ISSUE) so existing ISSUE behaviour is preserved.
  if (filters.type) conds.push(eq(tickets.type, filters.type));
  if (filters.status) conds.push(eq(tickets.status, filters.status));
  if (filters.statuses?.length) {
    conds.push(inArray(tickets.status, filters.statuses));
  }
  if (filters.priority) conds.push(eq(tickets.priority, filters.priority));
  if (filters.department) conds.push(eq(tickets.department, filters.department));
  if (filters.assigneeId === "unassigned") {
    conds.push(isNull(tickets.assignedTo));
  } else if (filters.assigneeId) {
    conds.push(eq(tickets.assignedTo, filters.assigneeId));
  }
  if (filters.reporterId) conds.push(eq(tickets.createdBy, filters.reporterId));
  const search = filters.search?.trim();
  if (search) {
    const like = `%${search}%`;
    conds.push(
      or(
        ilike(tickets.title, like),
        ilike(tickets.number, like),
        ilike(tickets.description, like)
      )!
    );
  }
  return conds;
}

/** USER visibility (§6): only their own ISSUE tickets (requests have their own list). */
export async function listMyTickets(userId: string, filters: TicketFilters = {}) {
  const conds = [
    eq(tickets.createdBy, userId),
    eq(tickets.type, "ISSUE"),
    ...ticketFilterConditions(filters),
  ];
  return db
    .select(ticketListSelectLite)
    .from(tickets)
    .leftJoin(creatorUser, eq(tickets.createdBy, creatorUser.id))
    .leftJoin(assigneeUser, eq(tickets.assignedTo, assigneeUser.id))
    .where(and(...conds))
    .orderBy(desc(tickets.createdAt));
}

/**
 * MIS "work queue" (§6): every ticket assigned to me across its lifecycle —
 * active work plus my resolved/closed history, grouped into status tabs in the
 * UI. Most-recently-updated first. (The nav badge counts only active ones via
 * countAssignedActive.)
 */
export async function listAssignedToMe(userId: string) {
  return db
    .select(ticketListSelectLite)
    .from(tickets)
    .leftJoin(creatorUser, eq(tickets.createdBy, creatorUser.id))
    .leftJoin(assigneeUser, eq(tickets.assignedTo, assigneeUser.id))
    .where(
      and(
        eq(tickets.assignedTo, userId),
        eq(tickets.type, "ISSUE"),
        isNull(tickets.deletedAt)
      )
    )
    .orderBy(desc(tickets.updatedAt));
}

/** Count of the user's active (non-closed, non-resolved) tickets — for the nav badge. */
export async function countMyActiveTickets(userId: string): Promise<number> {
  const [row] = await db
    .select({ count: sql<number>`count(*)`.mapWith(Number) })
    .from(tickets)
    .where(
      and(
        eq(tickets.createdBy, userId),
        eq(tickets.type, "ISSUE"),
        isNull(tickets.deletedAt),
        inArray(tickets.status, ["OPEN", "IN_PROGRESS", "REOPENED"])
      )
    );
  return row?.count ?? 0;
}

/** Count of active tickets assigned to me — the MIS "My Tickets" nav badge. */
export async function countAssignedActive(userId: string): Promise<number> {
  const [row] = await db
    .select({ count: sql<number>`count(*)`.mapWith(Number) })
    .from(tickets)
    .where(
      and(
        eq(tickets.assignedTo, userId),
        eq(tickets.type, "ISSUE"),
        isNull(tickets.deletedAt),
        inArray(tickets.status, ["OPEN", "IN_PROGRESS", "REOPENED"])
      )
    );
  return row?.count ?? 0;
}

/** MIS visibility (§6): all ISSUE tickets. Caller must enforce the staff role. */
export async function listAllTickets(filters: TicketFilters = {}) {
  const conds = [eq(tickets.type, "ISSUE"), ...ticketFilterConditions(filters)];
  return db
    .select(ticketListSelect)
    .from(tickets)
    .leftJoin(creatorUser, eq(tickets.createdBy, creatorUser.id))
    .leftJoin(assigneeUser, eq(tickets.assignedTo, assigneeUser.id))
    .where(conds.length ? and(...conds) : undefined)
    .orderBy(desc(tickets.createdAt));
}

export type TicketListRow = Awaited<ReturnType<typeof listAllTickets>>[number];

/**
 * Board: every active ticket (all statuses; RESOLVED/CLOSED live in the Resolved
 * column). Light projection — the cards show only the two counts, so this skips
 * the `description` body and the `attachments` json_agg entirely.
 */
export async function listBoardTickets() {
  return db
    .select(ticketBoardSelect)
    .from(tickets)
    .leftJoin(creatorUser, eq(tickets.createdBy, creatorUser.id))
    .leftJoin(assigneeUser, eq(tickets.assignedTo, assigneeUser.id))
    .where(and(eq(tickets.type, "ISSUE"), isNull(tickets.deletedAt)))
    .orderBy(desc(tickets.createdAt));
}

export type BoardTicketRow = Awaited<ReturnType<typeof listBoardTickets>>[number];

/**
 * Settings → Bulk Delete list: the 8 columns the view renders, with a single
 * creator join and NO correlated subqueries or body — the leanest ticket read.
 */
export async function listTicketsForBulkDelete() {
  return db
    .select({
      id: tickets.id,
      number: tickets.number,
      title: tickets.title,
      type: tickets.type,
      department: tickets.department,
      status: tickets.status,
      priority: tickets.priority,
      createdByName: creatorUser.name,
      createdAt: tickets.createdAt,
    })
    .from(tickets)
    .leftJoin(creatorUser, eq(tickets.createdBy, creatorUser.id))
    // Both types (the view splits them into Issues / Request System tabs). The
    // delete itself is admin-only (§6) and type-agnostic — soft delete lives on the
    // shared tickets row, so a request bins to the same recycle bin as an issue.
    .where(isNull(tickets.deletedAt))
    .orderBy(desc(tickets.createdAt));
}

/**
 * Per-tab ticket counts for the All Tickets tabs. Honors the facet filters
 * (department/priority/assignee/search) but ignores the status tab itself, so a
 * badge shows how many tickets fall under each tab given the current filters.
 */
export async function countTicketsByTab(
  filters: TicketFilters = {}
): Promise<Record<TicketTabKey, number>> {
  // Count across every status — honor the facet filters but not the status tab.
  // Issue tabs only (§12): requests are counted by their own surfaces.
  const conds = [
    eq(tickets.type, "ISSUE"),
    ...ticketFilterConditions({
      priority: filters.priority,
      department: filters.department,
      assigneeId: filters.assigneeId,
      search: filters.search,
    }),
  ];
  const rows = await db
    .select({
      status: tickets.status,
      count: sql<number>`count(*)`.mapWith(Number),
    })
    .from(tickets)
    .where(conds.length ? and(...conds) : undefined)
    .groupBy(tickets.status);

  const byStatus = new Map<Status, number>(rows.map((r) => [r.status, r.count]));
  const result = {} as Record<TicketTabKey, number>;
  for (const tab of TICKET_TABS) {
    result[tab.key] = statusesForTab(tab.key).reduce(
      (sum, s) => sum + (byStatus.get(s) ?? 0),
      0
    );
  }
  return result;
}

/**
 * Full ticket detail with comments + attachments + activity + people joined.
 * Enforces row-level visibility (§6): a USER viewer only sees their own ticket
 * (returns null otherwise). Omit `viewer` for trusted/system reads.
 */
export async function getTicketByNumber(
  number: string,
  viewer?: { id: string; role: Role }
) {
  const [ticket] = await db
    .select({
      id: tickets.id,
      number: tickets.number,
      title: tickets.title,
      description: tickets.description,
      department: tickets.department,
      status: tickets.status,
      priority: tickets.priority,
      sheetLink: tickets.sheetLink,
      createdAt: tickets.createdAt,
      updatedAt: tickets.updatedAt,
      claimedAt: tickets.claimedAt,
      startedAt: tickets.startedAt,
      resolvedAt: tickets.resolvedAt,
      autoClosedAt: tickets.autoClosedAt,
      createdById: tickets.createdBy,
      createdByName: creatorUser.name,
      createdByEmail: creatorUser.email,
      createdByImage: creatorUser.image,
      assignedToId: tickets.assignedTo,
      assignedToName: assigneeUser.name,
      assignedToEmail: assigneeUser.email,
      assignedToImage: assigneeUser.image,
      resolvedById: tickets.resolvedBy,
      resolvedByName: resolverUser.name,
    })
    .from(tickets)
    .leftJoin(creatorUser, eq(tickets.createdBy, creatorUser.id))
    .leftJoin(assigneeUser, eq(tickets.assignedTo, assigneeUser.id))
    .leftJoin(resolverUser, eq(tickets.resolvedBy, resolverUser.id))
    .where(and(eq(tickets.number, number), eq(tickets.type, "ISSUE"), isNull(tickets.deletedAt)))
    .limit(1);

  if (!ticket) return null;
  // Row-level visibility (§6).
  if (viewer && viewer.role === "USER" && ticket.createdById !== viewer.id) {
    return null;
  }

  const [comments, attachments, activity] = await Promise.all([
    db
      .select({
        id: ticketComments.id,
        body: ticketComments.body,
        createdAt: ticketComments.createdAt,
        authorId: ticketComments.authorId,
        authorName: authorUser.name,
        authorImage: authorUser.image,
      })
      .from(ticketComments)
      .leftJoin(authorUser, eq(ticketComments.authorId, authorUser.id))
      .where(eq(ticketComments.ticketId, ticket.id))
      .orderBy(asc(ticketComments.createdAt)),
    db
      .select()
      .from(ticketAttachments)
      .where(eq(ticketAttachments.ticketId, ticket.id))
      .orderBy(asc(ticketAttachments.createdAt)),
    db
      .select({
        id: ticketActivity.id,
        type: ticketActivity.type,
        fromValue: ticketActivity.fromValue,
        toValue: ticketActivity.toValue,
        createdAt: ticketActivity.createdAt,
        actorId: ticketActivity.actorId,
        actorName: actorUser.name,
      })
      .from(ticketActivity)
      .leftJoin(actorUser, eq(ticketActivity.actorId, actorUser.id))
      .where(eq(ticketActivity.ticketId, ticket.id))
      .orderBy(asc(ticketActivity.createdAt)),
  ]);

  return { ...ticket, comments, attachments, activity };
}

/** The shape returned by getTicketByNumber (non-null). */
export type TicketDetail = NonNullable<
  Awaited<ReturnType<typeof getTicketByNumber>>
>;

export interface DashboardStats {
  open: number;
  inProgress: number;
  unassigned: number;
  resolved: number;
  closed: number;
  resolvedLast7d: number;
  avgResolutionHours: number;
}

/** Aggregate KPIs for the MIS dashboard. Caller must enforce the staff role. */
export async function dashboardStats(): Promise<DashboardStats> {
  const [row] = await db
    .select({
      open: sql<number>`count(*) filter (where ${tickets.status}::text = 'OPEN')`.mapWith(
        Number
      ),
      inProgress:
        sql<number>`count(*) filter (where ${tickets.status}::text in ('IN_PROGRESS','REOPENED'))`.mapWith(
          Number
        ),
      unassigned:
        sql<number>`count(*) filter (where ${tickets.assignedTo} is null and ${tickets.status}::text <> 'CLOSED')`.mapWith(
          Number
        ),
      resolved:
        sql<number>`count(*) filter (where ${tickets.status}::text = 'RESOLVED')`.mapWith(
          Number
        ),
      closed:
        sql<number>`count(*) filter (where ${tickets.status}::text = 'CLOSED')`.mapWith(
          Number
        ),
      resolvedLast7d:
        sql<number>`count(*) filter (where ${tickets.resolvedAt} >= now() - interval '7 days')`.mapWith(
          Number
        ),
      avgResolutionHours: sql<number>`
        coalesce(
          round(
            (avg(extract(epoch from (${tickets.resolvedAt} - ${tickets.createdAt})) / 3600.0)
              filter (where ${tickets.resolvedAt} is not null))::numeric,
            1
          ),
          0
        )
      `.mapWith(Number),
    })
    .from(tickets)
    .where(and(eq(tickets.type, "ISSUE"), isNull(tickets.deletedAt)));

  return (
    row ?? {
      open: 0,
      inProgress: 0,
      unassigned: 0,
      resolved: 0,
      closed: 0,
      resolvedLast7d: 0,
      avgResolutionHours: 0,
    }
  );
}

export interface TrendPoint {
  date: string; // YYYY-MM-DD (UTC)
  created: number;
}

/** Tickets created per day for the last `days` days (zero-filled). */
export async function ticketTrend(days = 30): Promise<TrendPoint[]> {
  const rows = await db
    .select({
      day: sql<string>`to_char(date_trunc('day', ${tickets.createdAt}), 'YYYY-MM-DD')`,
      count: sql<number>`count(*)`.mapWith(Number),
    })
    .from(tickets)
    .where(
      and(
        eq(tickets.type, "ISSUE"),
        isNull(tickets.deletedAt),
        sql`${tickets.createdAt} >= now() - (${days - 1} * interval '1 day')`
      )
    )
    .groupBy(sql`1`);

  const map = new Map(rows.map((r) => [r.day, r.count]));
  const out: TrendPoint[] = [];
  const today = new Date();
  for (let i = days - 1; i >= 0; i--) {
    const d = new Date(today);
    d.setUTCDate(d.getUTCDate() - i);
    const key = d.toISOString().slice(0, 10);
    out.push({ date: key, created: map.get(key) ?? 0 });
  }
  return out;
}

/* ------------------------------------------------------------------ *
 * REQUEST tickets — "build me a new system" workflow (CLAUDE.md §12).
 * Shares the tickets/comments/attachments/activity tables; the REQUEST-only
 * brief + build state live in request_details, and progress updates in
 * progress_logs. Every mutation is batched with its ticket_activity row (§12.5).
 * ------------------------------------------------------------------ */
const mdDeciderUser = alias(users, "md_decider");
const claimerUser = alias(users, "claimer");
const logAuthorUser = alias(users, "log_author");

export interface CreateRequestArgs {
  createdBy: string;
  systemName: string;
  problemStatement: string;
  currentProcess?: string | null;
  currentSheetLink?: string | null;
  expectedBenefit: string;
  requestedBy: string;
  department: Department;
}

/** Create a REQUEST — number from request_seq (REQ-001…), status SUBMITTED. */
export async function createRequestTicket(args: CreateRequestArgs) {
  const id = crypto.randomUUID();
  const [rows] = await db.batch([
    db
      .insert(tickets)
      .values({
        id,
        number: sql`'REQ-' || lpad(nextval('request_seq')::text, 3, '0')`,
        type: "REQUEST",
        // Base ticket mirrors the brief so shared views render without a join.
        title: args.systemName,
        description: args.problemStatement,
        department: args.department,
        sheetLink: args.currentSheetLink ?? null,
        status: "SUBMITTED",
        // A raised request has NO priority — MIS sets it on claim (§12.3, mirrors §5).
        priority: null,
        createdBy: args.createdBy,
      })
      .returning(),
    db.insert(requestDetails).values({
      ticketId: id,
      systemName: args.systemName,
      problemStatement: args.problemStatement,
      currentProcess: args.currentProcess ?? null,
      currentSheetLink: args.currentSheetLink ?? null,
      expectedBenefit: args.expectedBenefit,
      requestedBy: args.requestedBy,
    }),
    db.insert(ticketActivity).values({
      ticketId: id,
      actorId: args.createdBy,
      type: "SUBMITTED",
    }),
  ]);
  return rows[0];
}

/**
 * Move a misfiled ticket to the other module (ISSUE ⇄ REQUEST) (§12). Renumbers it
 * into the target sequence (MIS-/REQ-, the prefix always matches the type), resets it
 * to that module's intake stage, and clears the old assignment/priority/deadline —
 * it re-enters the correct pipeline fresh. Comments, attachments and activity stay
 * (they hang off ticket_id); a MOVED activity row records old → new number.
 *
 * ISSUE → REQUEST: creates the request_details brief (system name ← title, problem ←
 * description, sheet ← sheet_link, plus the expected_benefit the mover supplied).
 * REQUEST → ISSUE: folds the brief back into title/description and drops the
 * request_details row (1:1 with REQUEST). All in ONE atomic batch (§2).
 */
export async function moveTicketType(args: {
  ticketId: string;
  currentType: TicketType;
  actorId: string;
  /** Required when currentType is ISSUE (→ REQUEST). Ignored the other way. */
  expectedBenefit?: string;
}): Promise<{ number: string; type: TicketType }> {
  const toRequest = args.currentType === "ISSUE";
  const [current] = await db
    .select()
    .from(tickets)
    .where(eq(tickets.id, args.ticketId))
    .limit(1);
  if (!current) throw new Error("Ticket not found.");
  const oldNumber = current.number;

  // Fresh number from the TARGET sequence — same expression the creators use.
  const newNumberSql = toRequest
    ? sql`'REQ-' || lpad(nextval('request_seq')::text, 3, '0')`
    : sql`'MIS-' || lpad(nextval('ticket_seq')::text, 3, '0')`;

  if (toRequest) {
    // ISSUE → REQUEST.
    await db.batch([
      db
        .update(tickets)
        .set({
          type: "REQUEST",
          number: newNumberSql,
          status: "SUBMITTED",
          assignedTo: null,
          priority: null,
          deadline: null,
          resolvedAt: null,
          resolvedBy: null,
        })
        .where(eq(tickets.id, args.ticketId)),
      db.insert(requestDetails).values({
        ticketId: args.ticketId,
        systemName: current.title,
        problemStatement: current.description,
        currentSheetLink: current.sheetLink ?? null,
        expectedBenefit: args.expectedBenefit ?? "—",
      }),
      db.insert(ticketActivity).values({
        ticketId: args.ticketId,
        actorId: args.actorId,
        type: "MOVED",
        fromValue: oldNumber,
        // to_value is filled below once we know the minted number.
      }),
    ]);
  } else {
    // REQUEST → ISSUE. Fold the brief back into the issue description so nothing is lost.
    const details = await getRequestDetailsRow(args.ticketId);
    const title = details?.systemName ?? current.title;
    const parts = [details?.problemStatement ?? current.description];
    if (details?.currentProcess) parts.push(`How it's handled today: ${details.currentProcess}`);
    if (details?.expectedBenefit) parts.push(`Expected benefit: ${details.expectedBenefit}`);
    const description = parts.filter(Boolean).join("\n\n");

    await db.batch([
      db
        .update(tickets)
        .set({
          type: "ISSUE",
          number: newNumberSql,
          status: "OPEN",
          title,
          description,
          sheetLink: current.sheetLink ?? details?.currentSheetLink ?? null,
          assignedTo: null,
          priority: null,
          deadline: null,
          resolvedAt: null,
          resolvedBy: null,
        })
        .where(eq(tickets.id, args.ticketId)),
      db.delete(requestDetails).where(eq(requestDetails.ticketId, args.ticketId)),
      db.insert(ticketActivity).values({
        ticketId: args.ticketId,
        actorId: args.actorId,
        type: "MOVED",
        fromValue: oldNumber,
      }),
    ]);
  }

  // Read back the minted number and stamp it onto the MOVED activity's to_value, so
  // the timeline reads "moved from MIS-004 to REQ-012". (A batch statement can't read
  // a sibling's nextval result, so this is a small follow-up write — best-effort.)
  const [moved] = await db
    .select({ number: tickets.number, type: tickets.type })
    .from(tickets)
    .where(eq(tickets.id, args.ticketId))
    .limit(1);
  try {
    await db
      .update(ticketActivity)
      .set({ toValue: moved.number })
      .where(
        and(
          eq(ticketActivity.ticketId, args.ticketId),
          eq(ticketActivity.type, "MOVED"),
          isNull(ticketActivity.toValue)
        )
      );
  } catch {
    // The move itself already committed; a missing to_value only affects the label.
  }
  return { number: moved.number, type: moved.type };
}

/**
 * §5 auto-close sweep (run daily by the cron). Closes tickets the reporter never acted
 * on past the grace window:
 *  - ISSUE:   RESOLVED longer than AUTO_CLOSE_DAYS → CLOSED (treated as resolved).
 *  - REQUEST: IN_TESTING (delivered) longer than AUTO_CLOSE_DAYS → CLOSED (auto-accepted).
 *
 * Stamps `auto_closed_at` so the close is reversible — the reporter may still reopen it
 * (the manual confirm/accept path never sets it, so those stay permanent). Writes an
 * AUTO_CLOSED activity row authored by the SYSTEM user, and for a request records the
 * acceptance timestamp too. Returns the closed tickets so the caller notifies each
 * reporter (best-effort). All DB writes in ONE batch (§2).
 */
export async function autoCloseStaleTickets(): Promise<
  { id: string; number: string; type: TicketType; createdBy: string }[]
> {
  const systemId = await getOrCreateSystemUserId();
  const now = new Date();
  const cutoff = new Date(now.getTime() - AUTO_CLOSE_DAYS * 86_400_000);

  const issues = await db
    .select({ id: tickets.id, number: tickets.number, createdBy: tickets.createdBy })
    .from(tickets)
    .where(
      and(
        eq(tickets.type, "ISSUE"),
        eq(tickets.status, "RESOLVED"),
        isNull(tickets.deletedAt),
        isNotNull(tickets.resolvedAt),
        lte(tickets.resolvedAt, cutoff)
      )
    );

  const reqs = await db
    .select({ id: tickets.id, number: tickets.number, createdBy: tickets.createdBy })
    .from(tickets)
    .innerJoin(requestDetails, eq(requestDetails.ticketId, tickets.id))
    .where(
      and(
        eq(tickets.type, "REQUEST"),
        eq(tickets.status, "IN_TESTING"),
        isNull(tickets.deletedAt),
        isNotNull(requestDetails.completedAt),
        lte(requestDetails.completedAt, cutoff)
      )
    );

  const all = [
    ...issues.map((t) => ({ ...t, type: "ISSUE" as TicketType })),
    ...reqs.map((t) => ({ ...t, type: "REQUEST" as TicketType })),
  ];
  if (all.length === 0) return [];

  const stmts = [];
  for (const t of all) {
    stmts.push(
      db
        .update(tickets)
        .set({ status: "CLOSED", autoClosedAt: now })
        .where(eq(tickets.id, t.id))
    );
    if (t.type === "REQUEST") {
      stmts.push(
        db
          .update(requestDetails)
          .set({ acceptedAt: now })
          .where(eq(requestDetails.ticketId, t.id))
      );
    }
    stmts.push(
      db.insert(ticketActivity).values({
        ticketId: t.id,
        actorId: systemId,
        type: "AUTO_CLOSED",
        toValue: "CLOSED",
      })
    );
  }
  await db.batch(stmts as unknown as Parameters<typeof db.batch>[0]);
  return all;
}

/** The request_details row for a ticket (state checks in actions). */
export async function getRequestDetailsRow(ticketId: string) {
  const [row] = await db
    .select()
    .from(requestDetails)
    .where(eq(requestDetails.ticketId, ticketId))
    .limit(1);
  return row ?? null;
}

/** Optional server-side filters for the REQUEST list (§12.7). All default to off. */
export interface RequestFilters {
  /** Match any of these request stages. */
  statuses?: Status[];
  department?: Department;
  /** Only requests assigned to this user — the MIS member's own build queue. */
  assignedTo?: string;
  /** Matches the request number or system name. */
  search?: string;
}

/** Role-aware REQUEST list: a USER sees only their own, staff/MIS see all (§12.4). */
export async function listRequests(
  viewer: { id: string; role: Role },
  filters: RequestFilters = {}
) {
  const conds = [eq(tickets.type, "REQUEST"), isNull(tickets.deletedAt)];
  // §12.7 row-level visibility: a USER only ever sees requests they created.
  if (viewer.role === "USER") conds.push(eq(tickets.createdBy, viewer.id));
  if (filters.statuses?.length) conds.push(inArray(tickets.status, filters.statuses));
  if (filters.department) conds.push(eq(tickets.department, filters.department));
  if (filters.assignedTo) conds.push(eq(tickets.assignedTo, filters.assignedTo));
  const search = filters.search?.trim();
  if (search) {
    const like = `%${search}%`;
    conds.push(
      or(ilike(tickets.number, like), ilike(requestDetails.systemName, like))!
    );
  }
  return db
    .select({
      id: tickets.id,
      number: tickets.number,
      systemName: requestDetails.systemName,
      title: tickets.title,
      department: tickets.department,
      status: tickets.status,
      priority: tickets.priority,
      revisionRound: requestDetails.revisionRound,
      deadline: requestDetails.deadline,
      // Latest reported % from the progress logs — the board card's progress bar.
      // Correlated so one query still feeds both the list and the board.
      percentComplete: sql<number | null>`(
        select pl.percent_complete from ${progressLogs} pl
        where pl.ticket_id = ${tickets.id} and pl.percent_complete is not null
        order by pl.created_at desc limit 1
      )`.mapWith((v) => (v === null ? null : Number(v))),
      // §13.5: has the built system been logged into the directory yet? A
      // correlated subquery (same shape as percentComplete above) so the list and
      // the board can flag a finished build that nobody logged — without a join
      // that would duplicate rows.
      systemCode: sql<string | null>`(
        select s.code from ${systems} s where s.linked_ticket_id = ${tickets.id} limit 1
      )`,
      createdAt: tickets.createdAt,
      updatedAt: tickets.updatedAt,
      createdById: tickets.createdBy,
      createdByName: creatorUser.name,
      createdByImage: creatorUser.image,
      assignedToId: tickets.assignedTo,
      assignedToName: assigneeUser.name,
      assignedToImage: assigneeUser.image,
    })
    .from(tickets)
    .innerJoin(requestDetails, eq(requestDetails.ticketId, tickets.id))
    .leftJoin(creatorUser, eq(tickets.createdBy, creatorUser.id))
    .leftJoin(assigneeUser, eq(tickets.assignedTo, assigneeUser.id))
    .where(and(...conds))
    .orderBy(desc(tickets.updatedAt));
}
export type RequestListRow = Awaited<ReturnType<typeof listRequests>>[number];

/**
 * Full REQUEST detail: brief + MD decision + build state + progress logs +
 * comments + attachments + activity. Enforces §6 visibility (a USER sees only
 * their own). Returns null if not a REQUEST / not found / not visible.
 */
export async function getRequestByNumber(
  number: string,
  viewer?: { id: string; role: Role }
) {
  const [row] = await db
    .select({
      id: tickets.id,
      number: tickets.number,
      type: tickets.type,
      title: tickets.title,
      description: tickets.description,
      department: tickets.department,
      status: tickets.status,
      priority: tickets.priority,
      sheetLink: tickets.sheetLink,
      // §13.5 — the built system's code once it's in the directory, else null.
      systemCode: sql<string | null>`(
        select s.code from ${systems} s where s.linked_ticket_id = ${tickets.id} limit 1
      )`,
      createdAt: tickets.createdAt,
      updatedAt: tickets.updatedAt,
      autoClosedAt: tickets.autoClosedAt,
      createdById: tickets.createdBy,
      createdByName: creatorUser.name,
      createdByEmail: creatorUser.email,
      createdByImage: creatorUser.image,
      assignedToId: tickets.assignedTo,
      assignedToName: assigneeUser.name,
      assignedToImage: assigneeUser.image,
      // request_details
      systemName: requestDetails.systemName,
      problemStatement: requestDetails.problemStatement,
      currentProcess: requestDetails.currentProcess,
      currentSheetLink: requestDetails.currentSheetLink,
      expectedBenefit: requestDetails.expectedBenefit,
      requestedBy: requestDetails.requestedBy,
      mdDecision: requestDetails.mdDecision,
      mdDecidedAt: requestDetails.mdDecidedAt,
      mdRemark: requestDetails.mdRemark,
      // The MD verdict is admin-recorded (§12.2); expose the recorder as the
      // "decided by" for the shared detail view.
      mdDecidedById: requestDetails.mdDecisionRecordedBy,
      mdDecidedByName: mdDeciderUser.name,
      claimedById: requestDetails.claimedBy,
      claimedByName: claimerUser.name,
      claimedAt: requestDetails.claimedAt,
      startedAt: requestDetails.startedAt,
      deadline: requestDetails.deadline,
      revisionRound: requestDetails.revisionRound,
      completedAt: requestDetails.completedAt,
      acceptedAt: requestDetails.acceptedAt,
    })
    .from(tickets)
    .innerJoin(requestDetails, eq(requestDetails.ticketId, tickets.id))
    .leftJoin(creatorUser, eq(tickets.createdBy, creatorUser.id))
    .leftJoin(assigneeUser, eq(tickets.assignedTo, assigneeUser.id))
    .leftJoin(mdDeciderUser, eq(requestDetails.mdDecisionRecordedBy, mdDeciderUser.id))
    .leftJoin(claimerUser, eq(requestDetails.claimedBy, claimerUser.id))
    .where(
      and(
        eq(tickets.number, number),
        eq(tickets.type, "REQUEST"),
        isNull(tickets.deletedAt)
      )
    )
    .limit(1);

  if (!row) return null;
  if (viewer && viewer.role === "USER" && row.createdById !== viewer.id) {
    return null;
  }

  const [comments, attachments, activity, logs] = await Promise.all([
    db
      .select({
        id: ticketComments.id,
        body: ticketComments.body,
        createdAt: ticketComments.createdAt,
        authorId: ticketComments.authorId,
        authorName: authorUser.name,
        authorImage: authorUser.image,
      })
      .from(ticketComments)
      .leftJoin(authorUser, eq(ticketComments.authorId, authorUser.id))
      .where(eq(ticketComments.ticketId, row.id))
      .orderBy(asc(ticketComments.createdAt)),
    db
      .select()
      .from(ticketAttachments)
      .where(eq(ticketAttachments.ticketId, row.id))
      .orderBy(asc(ticketAttachments.createdAt)),
    db
      .select({
        id: ticketActivity.id,
        type: ticketActivity.type,
        fromValue: ticketActivity.fromValue,
        toValue: ticketActivity.toValue,
        createdAt: ticketActivity.createdAt,
        actorId: ticketActivity.actorId,
        actorName: actorUser.name,
      })
      .from(ticketActivity)
      .leftJoin(actorUser, eq(ticketActivity.actorId, actorUser.id))
      .where(eq(ticketActivity.ticketId, row.id))
      .orderBy(asc(ticketActivity.createdAt)),
    db
      .select({
        id: progressLogs.id,
        type: progressLogs.type,
        body: progressLogs.body,
        percentComplete: progressLogs.percentComplete,
        createdAt: progressLogs.createdAt,
        authorId: progressLogs.authorId,
        authorName: logAuthorUser.name,
        authorImage: logAuthorUser.image,
      })
      .from(progressLogs)
      .leftJoin(logAuthorUser, eq(progressLogs.authorId, logAuthorUser.id))
      .where(eq(progressLogs.ticketId, row.id))
      .orderBy(asc(progressLogs.createdAt)),
  ]);

  return { ...row, comments, attachments, activity, progressLogs: logs };
}

export type RequestDetail = NonNullable<
  Awaited<ReturnType<typeof getRequestByNumber>>
>;

/* ---- REQUEST transition writers (each batched with its activity row) ---- */

/** A status-only transition + its activity row (review / send-for-MD / revive / start build). */
export async function setRequestStatusRow(args: {
  ticketId: string;
  actorId: string;
  from: Status;
  to: Status;
  activity: (typeof ticketActivity.$inferInsert)["type"];
}) {
  // Never persist a status from the ISSUE state set on a REQUEST (§12).
  assertStatusForType("REQUEST", args.to);
  await db.batch([
    db.update(tickets).set({ status: args.to }).where(eq(tickets.id, args.ticketId)),
    db.insert(ticketActivity).values({
      ticketId: args.ticketId,
      actorId: args.actorId,
      type: args.activity,
      fromValue: args.from,
      toValue: args.to,
    }),
  ]);
}

/** Record the (offline) MD decision on the admin's behalf → APPROVED or DROPPED. */
export async function recordMdDecisionRow(args: {
  ticketId: string;
  actorId: string;
  from: Status;
  decision: "APPROVED" | "REJECTED";
  remark?: string | null;
}) {
  const approved = args.decision === "APPROVED";
  await db.batch([
    db
      .update(tickets)
      .set({ status: approved ? "APPROVED" : "DROPPED" })
      .where(eq(tickets.id, args.ticketId)),
    db
      .update(requestDetails)
      .set({
        mdDecision: approved ? "APPROVED" : "REJECTED",
        // Recorded by the acting admin on the MD's behalf (§12.2/§12.5).
        mdDecisionRecordedBy: args.actorId,
        mdDecidedAt: new Date(),
        mdRemark: args.remark ?? null,
      })
      .where(eq(requestDetails.ticketId, args.ticketId)),
    db.insert(ticketActivity).values({
      ticketId: args.ticketId,
      actorId: args.actorId,
      type: approved ? "APPROVAL_RECORDED" : "REJECTION_RECORDED",
      fromValue: args.from,
      toValue: approved ? "APPROVED" : "DROPPED",
    }),
  ]);
}

/** Claim a REQUEST for the build: assignee + priority + deadline → CLAIMED. */
export async function claimRequestRow(args: {
  ticketId: string;
  actorId: string;
  from: Status;
  priority: Priority;
  /** The day the build was actually claimed (§5.3). Defaults to now. */
  claimedAt?: Date;
  /** Set when claimedAt is a day other than today — drives the CLAIM_DATED row. */
  datedFrom?: Date;
}) {
  const claimedAt = args.claimedAt ?? new Date();
  await db.batch([
    db
      .update(tickets)
      .set({ assignedTo: args.actorId, priority: args.priority, status: "CLAIMED" })
      .where(eq(tickets.id, args.ticketId)),
    db
      .update(requestDetails)
      .set({ claimedBy: args.actorId, claimedAt })
      .where(eq(requestDetails.ticketId, args.ticketId)),
    db.insert(ticketActivity).values({
      ticketId: args.ticketId,
      actorId: args.actorId,
      type: "CLAIMED",
      fromValue: args.from,
      toValue: "CLAIMED",
    }),
    // Claim date moved off the day it was recorded — audited exactly as on an ISSUE.
    ...(args.datedFrom
      ? [
          db.insert(ticketActivity).values({
            ticketId: args.ticketId,
            actorId: args.actorId,
            type: "CLAIM_DATED",
            fromValue: args.datedFrom.toISOString(),
            toValue: claimedAt.toISOString(),
          }),
        ]
      : []),
  ]);
}

/**
 * Undo a claim: CLAIMED → APPROVED, returning the build to the approved pool in one
 * batch (mirrors `releaseTicketRow` for issues, §5). Clears the assignee, the
 * priority, the claim record and any deadline, so the request looks exactly as it
 * did the moment it was approved and is claimable again. Writes an UNCLAIMED
 * activity row. The caller enforces staff + the assignee lock (§12.4) and that the
 * build hasn't started.
 */
export async function releaseRequestRow(args: {
  ticketId: string;
  actorId: string;
  /** The status being left — recorded on the UNCLAIMED row so the timeline can tell
   *  "claimed by mistake" from "abandoned mid-build". */
  from: Status;
}) {
  assertStatusForType("REQUEST", "APPROVED");
  await db.batch([
    db
      .update(tickets)
      .set({ status: "APPROVED", assignedTo: null, priority: null })
      .where(eq(tickets.id, args.ticketId)),
    db
      .update(requestDetails)
      // startedAt clears with the rest (§5.3): a release undoes the start too, so a
      // later re-claim isn't dated to the abandoned attempt.
      .set({ claimedBy: null, claimedAt: null, startedAt: null, deadline: null })
      .where(eq(requestDetails.ticketId, args.ticketId)),
    db.insert(ticketActivity).values({
      ticketId: args.ticketId,
      actorId: args.actorId,
      type: "UNCLAIMED",
      fromValue: args.from,
      toValue: "APPROVED",
    }),
  ]);
}

/**
 * Start the build: CLAIMED → IN_PROGRESS, committing to a delivery date. The date
 * lands here (not on claim) so a request mirrors an issue — claim takes ownership,
 * starting work is where the promise is made (§5/§12.3).
 *
 * `previousDeadline` is almost always null (claiming sets no date), but a date CAN
 * already exist: "Change date" is offered while the build is still CLAIMED. When it
 * does, this is a date MOVE, and the DEADLINE_SET row has to carry the old value
 * like `updateRequestDeadlineRow` does — otherwise a slip is recorded as a
 * first-time set.
 */
export async function startWorkRow(args: {
  ticketId: string;
  actorId: string;
  from: Status;
  deadline: Date;
  previousDeadline: Date | null;
  /** The day the build actually began (§5.3). Defaults to now. */
  startedAt?: Date;
  /** Set when startedAt is a day other than today — drives the START_DATED row. */
  datedFrom?: Date;
}) {
  assertStatusForType("REQUEST", "IN_PROGRESS");
  const startedAt = args.startedAt ?? new Date();
  await db.batch([
    db.update(tickets).set({ status: "IN_PROGRESS" }).where(eq(tickets.id, args.ticketId)),
    db
      .update(requestDetails)
      .set({ deadline: args.deadline, startedAt })
      .where(eq(requestDetails.ticketId, args.ticketId)),
    db.insert(ticketActivity).values({
      ticketId: args.ticketId,
      actorId: args.actorId,
      type: "STARTED",
      fromValue: args.from,
      toValue: "IN_PROGRESS",
    }),
    db.insert(ticketActivity).values({
      ticketId: args.ticketId,
      actorId: args.actorId,
      type: "DEADLINE_SET",
      fromValue: args.previousDeadline ? args.previousDeadline.toISOString() : null,
      toValue: args.deadline.toISOString(),
    }),
    ...(args.datedFrom
      ? [
          db.insert(ticketActivity).values({
            ticketId: args.ticketId,
            actorId: args.actorId,
            type: "START_DATED",
            fromValue: args.datedFrom.toISOString(),
            toValue: startedAt.toISOString(),
          }),
        ]
      : []),
  ]);
}

/**
 * Move a request's delivery deadline, batched with its DEADLINE_SET audit row so a
 * date change is never silent (§12.5, P12). `from` is the previous deadline (null
 * on the first set) so the timeline can read "13 Jul → 20 Jul".
 */
export async function updateRequestDeadlineRow(args: {
  ticketId: string;
  actorId: string;
  from: Date | null;
  to: Date;
}) {
  await db.batch([
    db
      .update(requestDetails)
      .set({ deadline: args.to })
      .where(eq(requestDetails.ticketId, args.ticketId)),
    db.insert(ticketActivity).values({
      ticketId: args.ticketId,
      actorId: args.actorId,
      type: "DEADLINE_SET",
      fromValue: args.from ? args.from.toISOString() : null,
      toValue: args.to.toISOString(),
    }),
  ]);
}

/** Append a progress log (build updates / review sessions / blockers). */
export async function addProgressLogRow(args: {
  ticketId: string;
  authorId: string;
  type: ProgressLogType;
  body: string;
  percentComplete?: number | null;
}) {
  const [rows] = await db.batch([
    db
      .insert(progressLogs)
      .values({
        ticketId: args.ticketId,
        authorId: args.authorId,
        type: args.type,
        body: args.body,
        percentComplete: args.percentComplete ?? null,
      })
      .returning(),
    db.insert(ticketActivity).values({
      ticketId: args.ticketId,
      actorId: args.authorId,
      type: "PROGRESS_LOGGED",
      toValue: args.type,
    }),
  ]);
  return rows[0];
}

/** MIS marks the build complete → IN_TESTING (hand to requester for UAT). */
export async function markRequestCompleteRow(args: {
  ticketId: string;
  actorId: string;
  from: Status;
  note?: string | null;
  /** The day the build was actually finished (§5.2). Defaults to now when omitted. */
  completedAt?: Date;
  /** Set when completedAt is a day other than today — see setTicketStatus.datedFrom. */
  datedFrom?: Date;
}) {
  const completedAt = args.completedAt ?? new Date();
  await db.batch([
    db.update(tickets).set({ status: "IN_TESTING" }).where(eq(tickets.id, args.ticketId)),
    db
      .update(requestDetails)
      .set({ completedAt })
      .where(eq(requestDetails.ticketId, args.ticketId)),
    ...(args.note
      ? [
          db.insert(ticketComments).values({
            ticketId: args.ticketId,
            authorId: args.actorId,
            body: args.note,
          }),
        ]
      : []),
    db.insert(ticketActivity).values({
      ticketId: args.ticketId,
      actorId: args.actorId,
      type: "MARKED_COMPLETE",
      fromValue: args.from,
      toValue: "IN_TESTING",
    }),
    // Same audit row the ISSUE resolve writes (§5.2) — the completion date was moved off
    // the day it was recorded, so the trail says who chose it and when.
    ...(args.datedFrom
      ? [
          db.insert(ticketActivity).values({
            ticketId: args.ticketId,
            actorId: args.actorId,
            type: "COMPLETION_DATED",
            fromValue: args.datedFrom.toISOString(),
            toValue: completedAt.toISOString(),
          }),
        ]
      : []),
  ]);
}

/** Requester asks for changes → CHANGES_REQUESTED; revision_round++ (§12.5). */
export async function requestChangesRow(args: {
  ticketId: string;
  actorId: string;
  from: Status;
  body: string;
  currentRound: number;
}): Promise<{ commentId: string; round: number }> {
  const nextRound = args.currentRound + 1;
  // Client-side id so the caller can hang the requester's attachments off this
  // exact comment — the comment IS the body of the change request.
  const commentId = crypto.randomUUID();
  await db.batch([
    db
      .update(tickets)
      .set({ status: "CHANGES_REQUESTED" })
      .where(eq(tickets.id, args.ticketId)),
    db
      .update(requestDetails)
      .set({ revisionRound: nextRound })
      .where(eq(requestDetails.ticketId, args.ticketId)),
    // The requester's body becomes a comment so it reads in the thread.
    db.insert(ticketComments).values({
      id: commentId,
      ticketId: args.ticketId,
      authorId: args.actorId,
      body: args.body,
    }),
    // The round number in to_value timestamps each attempt (§12.5).
    db.insert(ticketActivity).values({
      ticketId: args.ticketId,
      actorId: args.actorId,
      type: "CHANGES_REQUESTED",
      fromValue: args.from,
      toValue: String(nextRound),
    }),
  ]);
  return { commentId, round: nextRound };
}

/** Requester accepts the build → CLOSED (only acceptance closes a request; §12.4). */
export async function acceptRequestRow(args: {
  ticketId: string;
  actorId: string;
  from: Status;
}) {
  await db.batch([
    db
      .update(tickets)
      .set({ status: "CLOSED", resolvedAt: new Date(), resolvedBy: args.actorId })
      .where(eq(tickets.id, args.ticketId)),
    db
      .update(requestDetails)
      .set({ acceptedAt: new Date() })
      .where(eq(requestDetails.ticketId, args.ticketId)),
    db.insert(ticketActivity).values({
      ticketId: args.ticketId,
      actorId: args.actorId,
      type: "ACCEPTED",
      fromValue: args.from,
      toValue: "CLOSED",
    }),
  ]);
}

/** Active MIS_ADMINs — recipients for "pending approval" (they record the MD call). */
export async function listAdmins() {
  return db
    .select({ id: users.id, name: users.name, email: users.email })
    .from(users)
    .where(and(eq(users.role, "MIS_ADMIN"), eq(users.isActive, true)));
}

/* ------------------------------------------------------------------ *
 * Access requests (§7) — the Google request-to-join path. A refused sign-in
 * files a row here (grants nothing); an MIS_ADMIN approval mints the users row.
 * ------------------------------------------------------------------ */

/**
 * Record (or refresh) a pending access request for a refused Google sign-in.
 * Returns `{ created: true }` only when a genuinely NEW pending row was made, so the
 * caller notifies admins once — not on every repeat login while it's still pending.
 *
 * A REJECTED or APPROVED row is left untouched (sticky): a declined stranger can't
 * re-open their request by signing in again, and an approved one already has a user.
 */
export async function recordAccessRequest(input: {
  email: string;
  name: string | null;
  image: string | null;
}): Promise<{ created: boolean }> {
  const email = input.email.trim().toLowerCase();
  if (!email) return { created: false };

  const [existing] = await db
    .select({ id: accessRequests.id, status: accessRequests.status })
    .from(accessRequests)
    .where(eq(accessRequests.email, email))
    .limit(1);

  if (existing) {
    // Only a still-pending request refreshes its snapshot; a decided one is final.
    if (existing.status === "PENDING") {
      await db
        .update(accessRequests)
        .set({ name: input.name, image: input.image, requestedAt: new Date() })
        .where(eq(accessRequests.id, existing.id));
    }
    return { created: false };
  }

  // onConflictDoNothing guards the two-logins-at-once race — the SELECT above can miss
  // a row a concurrent request just inserted; better a rare duplicate-suppressed insert
  // than a unique-violation throw on the login path.
  await db
    .insert(accessRequests)
    .values({ email, name: input.name, image: input.image })
    .onConflictDoNothing();
  return { created: true };
}

const accessDecider = alias(users, "access_decider");

/** All access requests for the admin screen — pending first, then most-recent. */
export async function listAccessRequests() {
  return db
    .select({
      id: accessRequests.id,
      email: accessRequests.email,
      name: accessRequests.name,
      image: accessRequests.image,
      status: accessRequests.status,
      requestedAt: accessRequests.requestedAt,
      decidedAt: accessRequests.decidedAt,
      decidedByName: accessDecider.name,
      createdUserId: accessRequests.createdUserId,
    })
    .from(accessRequests)
    .leftJoin(accessDecider, eq(accessRequests.decidedBy, accessDecider.id))
    .orderBy(
      // PENDING (needs action) floats to the top; within a status, newest first.
      sql`case when ${accessRequests.status} = 'PENDING' then 0 else 1 end`,
      desc(accessRequests.requestedAt)
    );
}

export type AccessRequestRow = Awaited<
  ReturnType<typeof listAccessRequests>
>[number];

/** Count of pending requests — drives the Settings badge. */
export async function countPendingAccessRequests(): Promise<number> {
  const [row] = await db
    .select({ count: sql<number>`count(*)`.mapWith(Number) })
    .from(accessRequests)
    .where(eq(accessRequests.status, "PENDING"));
  return row?.count ?? 0;
}

export async function getAccessRequestById(id: string) {
  const [row] = await db
    .select()
    .from(accessRequests)
    .where(eq(accessRequests.id, id))
    .limit(1);
  return row ?? null;
}

/**
 * Approve a request: create the users row (role USER, active, Google-only — no
 * password) AND mark the request APPROVED, in ONE batch (neon-http has no interactive
 * transactions, §2). The id is generated app-side so the batch can write
 * `created_user_id` without reading the insert's return value — same pattern as
 * `createRequestTicket`.
 *
 * This is the ONLY new path that inserts a `users` row, and it is reachable only from
 * an MIS_ADMIN action — so §7's "account creation belongs to MIS_ADMIN actions only"
 * still holds.
 */
export async function approveAccessRequestTx(args: {
  requestId: string;
  email: string;
  name: string | null;
  image: string | null;
  adminId: string;
}): Promise<{ userId: string }> {
  const userId = crypto.randomUUID();
  await db.batch([
    db.insert(users).values({
      id: userId,
      email: args.email.trim().toLowerCase(),
      name: args.name,
      image: args.image,
      role: "USER",
      isActive: true,
    }),
    db
      .update(accessRequests)
      .set({
        status: "APPROVED",
        decidedBy: args.adminId,
        decidedAt: new Date(),
        createdUserId: userId,
      })
      .where(eq(accessRequests.id, args.requestId)),
  ]);
  return { userId };
}

/**
 * Approve a request whose email ALREADY has a users row (an admin added them via
 * Settings between request and approval): just link + mark APPROVED, never a second
 * insert (which would hit the unique-email constraint).
 */
export async function linkApprovedAccessRequest(args: {
  requestId: string;
  existingUserId: string;
  adminId: string;
}) {
  await db
    .update(accessRequests)
    .set({
      status: "APPROVED",
      decidedBy: args.adminId,
      decidedAt: new Date(),
      createdUserId: args.existingUserId,
    })
    .where(eq(accessRequests.id, args.requestId));
}

/** Reject a request — status REJECTED + the accountability trail. */
export async function rejectAccessRequest(requestId: string, adminId: string) {
  await db
    .update(accessRequests)
    .set({ status: "REJECTED", decidedBy: adminId, decidedAt: new Date() })
    .where(eq(accessRequests.id, requestId));
}

/* ------------------------------------------------------------------ *
 * In-app notifications (P8)
 * ------------------------------------------------------------------ */
export async function createNotification(args: {
  userId: string;
  type: NotificationType;
  ticketId?: string | null;
  ticketNumber?: string | null;
  title: string;
  body?: string | null;
}) {
  await db.insert(notifications).values({
    userId: args.userId,
    type: args.type,
    ticketId: args.ticketId ?? null,
    ticketNumber: args.ticketNumber ?? null,
    title: args.title,
    body: args.body ?? null,
  });
}

export async function listNotifications(userId: string, limit = 20) {
  return db
    .select()
    .from(notifications)
    .where(eq(notifications.userId, userId))
    .orderBy(desc(notifications.createdAt))
    .limit(limit);
}

export async function unreadNotificationCount(userId: string): Promise<number> {
  const [row] = await db
    .select({ count: sql<number>`count(*)`.mapWith(Number) })
    .from(notifications)
    .where(and(eq(notifications.userId, userId), isNull(notifications.readAt)));
  return row?.count ?? 0;
}

/**
 * The lightweight signal the client notification-watcher polls (even while the tab
 * is hidden, where the RSC layout does NOT re-run): the current unread count plus
 * the newest unread row's content, so an OS/desktop notification has something to
 * say. ONE indexed query (notifications.userId), a fraction of the cost of
 * re-rendering the whole layout — which is why the background poll hits this Route
 * Handler instead of router.refresh(). Returns unread=0 / latest=null when caught up.
 */
export async function notificationSignal(userId: string): Promise<{
  unread: number;
  latest: { title: string; body: string | null; ticketNumber: string | null } | null;
}> {
  const [row] = await db
    .select({
      title: notifications.title,
      body: notifications.body,
      ticketNumber: notifications.ticketNumber,
      unread:
        sql<number>`(select count(*) from notifications where user_id = ${userId} and read_at is null)`.mapWith(
          Number
        ),
    })
    .from(notifications)
    .where(and(eq(notifications.userId, userId), isNull(notifications.readAt)))
    .orderBy(desc(notifications.createdAt))
    .limit(1);
  return {
    unread: row?.unread ?? 0,
    latest: row
      ? { title: row.title, body: row.body, ticketNumber: row.ticketNumber }
      : null,
  };
}

/**
 * The topbar bell's data in ONE round-trip: the latest N notifications plus the
 * user's total unread count (a non-correlated scalar subquery Postgres evaluates
 * once, not per row). Replaces a separate listNotifications +
 * unreadNotificationCount pair — the layout runs this on every request/poll.
 */
export async function listNotificationsWithUnread(userId: string, limit = 20) {
  const rows = await db
    .select({
      id: notifications.id,
      ticketNumber: notifications.ticketNumber,
      title: notifications.title,
      body: notifications.body,
      readAt: notifications.readAt,
      createdAt: notifications.createdAt,
      unread:
        sql<number>`(select count(*) from notifications where user_id = ${userId} and read_at is null)`.mapWith(
          Number
        ),
    })
    .from(notifications)
    .where(eq(notifications.userId, userId))
    .orderBy(desc(notifications.createdAt))
    .limit(limit);
  return { rows, unread: rows[0]?.unread ?? 0 };
}

export async function markAllNotificationsRead(userId: string) {
  await db
    .update(notifications)
    .set({ readAt: new Date() })
    .where(and(eq(notifications.userId, userId), isNull(notifications.readAt)));
}

export type NotificationRow = Awaited<ReturnType<typeof listNotifications>>[number];

/* ------------------------------------------------------------------ *
 * Systems Repository (§13) — additive; nothing here touches issue/request reads.
 * ------------------------------------------------------------------ */

const ownerUser = alias(users, "system_owner");
const loggerUser = alias(users, "system_logger");
const confirmerUser = alias(users, "system_confirmer");
const linkedTicket = alias(tickets, "linked_ticket");

/**
 * The ONE place systems.code is generated (§13.7). Draws from system_seq and pads to
 * a MINIMUM of three digits — `greatest(3, length(...))` means the width is never
 * smaller than the number, so it can never truncate.
 *
 * This is deliberately NOT `lpad(n, 3, '0')`: that is the tracked MIS-/REQ- ceiling
 * (docs/known-issues/0001), where lpad('1000',3,'0') -> '100' collides with SYS-100 on
 * the unique index once the sequence passes 999. `to_char(n,'FM000')` is also wrong —
 * it overflows to '###'. Never compute a code from a row count (§9).
 *
 * A scalar subquery, so nextval() is evaluated exactly ONCE per insert.
 */
const systemCodeSql = sql<string>`(
  select 'SYS-' || lpad(n::text, greatest(3, length(n::text)), '0')
  from (select nextval('system_seq') as n) s
)`;

export type CreateSystemArgs = {
  name: string;
  systemType: SystemType;
  department: Department;
  ownerId: string;
  frontendUrl: string;
  backendUrl?: string | null;
  notes?: string | null;
  linkedTicketId?: string | null;
  loggedBy: string;
  /** Already validated against the live active grantee set by the caller (§13.4). */
  confirmations: { granteeId: string; granteeLabel: string }[];
};

/**
 * Insert a system plus its full access checklist in ONE db.batch (§13.4).
 *
 * The id is generated app-side (crypto.randomUUID) rather than by the DB, because
 * db.batch hands the driver an array of pre-built statements — statement N+1 cannot
 * read statement N's returned id. Same pattern as createRequestTicket. Batching
 * matters here: a system row without its confirmation rows is a non-compliant entry
 * in the directory, which is precisely what §13.4 exists to prevent.
 */
export async function createSystemRow(args: CreateSystemArgs) {
  const id = crypto.randomUUID();
  const [rows] = await db.batch([
    db
      .insert(systems)
      .values({
        id,
        code: systemCodeSql,
        name: args.name,
        systemType: args.systemType,
        department: args.department,
        ownerId: args.ownerId,
        frontendUrl: args.frontendUrl,
        backendUrl: args.backendUrl ?? null,
        notes: args.notes ?? null,
        linkedTicketId: args.linkedTicketId ?? null,
        loggedBy: args.loggedBy,
      })
      .returning(),
    ...args.confirmations.map((c) =>
      db.insert(systemAccessConfirmations).values({
        systemId: id,
        granteeId: c.granteeId,
        // Snapshot: renaming the grantee later must not rewrite this record.
        granteeLabel: c.granteeLabel,
        confirmed: true,
        confirmedBy: args.loggedBy,
      })
    ),
  ]);
  return rows[0];
}

/** Patch a system. `updatedAt` is bumped by the schema's $onUpdate (drizzle-side). */
export async function updateSystemRow(
  id: string,
  patch: {
    name?: string;
    systemType?: SystemType;
    department?: Department;
    ownerId?: string;
    frontendUrl?: string;
    backendUrl?: string | null;
    notes?: string | null;
    status?: SystemStatus;
  }
) {
  const [row] = await db.update(systems).set(patch).where(eq(systems.id, id)).returning();
  return row ?? null;
}

/** Retire a system. §13 has no hard delete — ARCHIVED is the terminal state. */
export async function archiveSystemRow(id: string) {
  const [row] = await db
    .update(systems)
    .set({ status: "ARCHIVED" })
    .where(eq(systems.id, id))
    .returning();
  return row ?? null;
}

export async function getSystemById(id: string) {
  const [row] = await db.select().from(systems).where(eq(systems.id, id)).limit(1);
  return row ?? null;
}

export type SystemFilters = {
  search?: string;
  department?: Department;
  systemType?: SystemType;
  status?: SystemStatus;
  ownerId?: string;
};

/**
 * The directory list. Readable by ANY authenticated user (§13.3) — deliberately not
 * row-scoped the way tickets are (§6), because a directory nobody can search is
 * pointless. Text search spans name + code.
 */
export async function listSystems(filters: SystemFilters = {}) {
  const conds: SQL[] = [];
  if (filters.department) conds.push(eq(systems.department, filters.department));
  if (filters.systemType) conds.push(eq(systems.systemType, filters.systemType));
  if (filters.status) conds.push(eq(systems.status, filters.status));
  if (filters.ownerId) conds.push(eq(systems.ownerId, filters.ownerId));
  const search = filters.search?.trim();
  if (search) {
    const like = `%${search}%`;
    conds.push(or(ilike(systems.name, like), ilike(systems.code, like))!);
  }

  return db
    .select({
      id: systems.id,
      code: systems.code,
      name: systems.name,
      systemType: systems.systemType,
      department: systems.department,
      status: systems.status,
      frontendUrl: systems.frontendUrl,
      backendUrl: systems.backendUrl,
      createdAt: systems.createdAt,
      updatedAt: systems.updatedAt,
      ownerId: systems.ownerId,
      ownerName: ownerUser.name,
      ownerImage: ownerUser.image,
      // The REQUEST this was built for, when it came from one (§13.5).
      linkedTicketId: systems.linkedTicketId,
      linkedTicketNumber: linkedTicket.number,
    })
    .from(systems)
    .leftJoin(ownerUser, eq(systems.ownerId, ownerUser.id))
    .leftJoin(linkedTicket, eq(systems.linkedTicketId, linkedTicket.id))
    .where(conds.length ? and(...conds) : undefined)
    .orderBy(desc(systems.updatedAt));
}

export type SystemListRow = Awaited<ReturnType<typeof listSystems>>[number];

/** Full detail for the deep link /systems/[code] — owner, logger, linked REQ, checklist. */
export async function getSystemByCode(code: string) {
  const [row] = await db
    .select({
      id: systems.id,
      code: systems.code,
      name: systems.name,
      systemType: systems.systemType,
      department: systems.department,
      status: systems.status,
      frontendUrl: systems.frontendUrl,
      backendUrl: systems.backendUrl,
      notes: systems.notes,
      createdAt: systems.createdAt,
      updatedAt: systems.updatedAt,
      ownerId: systems.ownerId,
      ownerName: ownerUser.name,
      ownerImage: ownerUser.image,
      loggedById: systems.loggedBy,
      loggedByName: loggerUser.name,
      linkedTicketId: systems.linkedTicketId,
      linkedTicketNumber: linkedTicket.number,
      linkedTicketTitle: linkedTicket.title,
    })
    .from(systems)
    .leftJoin(ownerUser, eq(systems.ownerId, ownerUser.id))
    .leftJoin(loggerUser, eq(systems.loggedBy, loggerUser.id))
    .leftJoin(linkedTicket, eq(systems.linkedTicketId, linkedTicket.id))
    .where(eq(systems.code, code))
    .limit(1);
  if (!row) return null;

  const confirmations = await db
    .select({
      id: systemAccessConfirmations.id,
      granteeId: systemAccessConfirmations.granteeId,
      granteeLabel: systemAccessConfirmations.granteeLabel,
      confirmed: systemAccessConfirmations.confirmed,
      confirmedAt: systemAccessConfirmations.confirmedAt,
      confirmedById: systemAccessConfirmations.confirmedBy,
      confirmedByName: confirmerUser.name,
    })
    .from(systemAccessConfirmations)
    .leftJoin(confirmerUser, eq(systemAccessConfirmations.confirmedBy, confirmerUser.id))
    .where(eq(systemAccessConfirmations.systemId, row.id))
    .orderBy(asc(systemAccessConfirmations.granteeLabel));

  return { ...row, confirmations };
}

export type SystemDetail = NonNullable<Awaited<ReturnType<typeof getSystemByCode>>>;

/** Is this REQUEST already in the directory? Drives the §13.5 "system logged" flag. */
export async function getSystemForTicket(ticketId: string) {
  const [row] = await db
    .select({ id: systems.id, code: systems.code, name: systems.name })
    .from(systems)
    .where(eq(systems.linkedTicketId, ticketId))
    .limit(1);
  return row ?? null;
}

/* ---------------------------- access grantees ---------------------------- */

/** The required checklist (§13.2). Config-driven — grantee names are never hardcoded. */
export async function listActiveGranteesRow() {
  return db
    .select()
    .from(accessGrantees)
    .where(eq(accessGrantees.isActive, true))
    .orderBy(asc(accessGrantees.sortOrder), asc(accessGrantees.label));
}

/** Every grantee incl. deactivated — for the admin config screen. */
export async function listAllGranteesRow() {
  return db
    .select()
    .from(accessGrantees)
    .orderBy(asc(accessGrantees.sortOrder), asc(accessGrantees.label));
}

/**
 * Add a grantee. Re-activates an existing label rather than colliding on the unique
 * index — that's the natural admin gesture after deactivating someone by mistake.
 */
export async function addGranteeRow(label: string) {
  const [maxRow] = await db
    .select({
      max: sql<number>`coalesce(max(${accessGrantees.sortOrder}), 0)`.mapWith(Number),
    })
    .from(accessGrantees);
  const [row] = await db
    .insert(accessGrantees)
    .values({ label, sortOrder: (maxRow?.max ?? 0) + 1 })
    .onConflictDoUpdate({ target: accessGrantees.label, set: { isActive: true } })
    .returning();
  return row ?? null;
}

/** Deactivate, never delete — existing confirmations must keep their referent. */
export async function deactivateGranteeRow(id: string) {
  const [row] = await db
    .update(accessGrantees)
    .set({ isActive: false })
    .where(eq(accessGrantees.id, id))
    .returning();
  return row ?? null;
}
