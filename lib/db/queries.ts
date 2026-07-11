import {
  and,
  asc,
  desc,
  eq,
  ilike,
  inArray,
  isNotNull,
  isNull,
  ne,
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
  type Role,
  type Status,
  notifications,
  ticketActivity,
  ticketAttachments,
  ticketComments,
  tickets,
  users,
} from "./schema";
import { TICKET_TABS, statusesForTab, type TicketTabKey } from "@/lib/ticket-tabs";

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

/** Create an email+password account (self-signup). role defaults to USER. */
export async function createUserWithPassword(args: {
  name: string;
  email: string;
  passwordHash: string;
}) {
  const [row] = await db
    .insert(users)
    .values({
      name: args.name,
      email: args.email.toLowerCase(),
      passwordHash: args.passwordHash,
    })
    .returning();
  return row;
}

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
    // Hide the "Deleted user" placeholder from the admin list — it's plumbing.
    .where(ne(users.email, DELETED_USER_EMAIL))
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

/**
 * Reassign a user's ticket history to the "Deleted user" placeholder, then delete
 * the account — in one atomic batch (neon-http has no interactive transactions,
 * CLAUDE.md §9). Tickets/comments/activity/attachments are preserved but
 * reattributed; open assignments are cleared. accounts/sessions/notifications
 * cascade. Caller must enforce MIS_ADMIN and block self-deletion.
 */
export async function reassignReferencesAndDeleteUser(userId: string) {
  const placeholderId = await getOrCreateDeletedPlaceholderId();
  // Guard against ever destroying the placeholder itself.
  if (placeholderId === userId) {
    throw new Error("Refusing to delete the deleted-user placeholder.");
  }

  await db.batch([
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

export async function setTicketStatus(args: {
  ticketId: string;
  actorId: string;
  from: Status;
  to: Status;
  resolvedAt?: Date | null;
  resolvedBy?: string | null;
}) {
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
      .set({ status: "REOPENED", resolvedAt: null, resolvedBy: null })
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
 * Claim a ticket: assign it to the actor and — when it's OPEN/REOPENED — start
 * work (→ IN_PROGRESS), in one batch. Writes an ASSIGNED activity row only when
 * ownership actually changes (writeAssigned), recording the prior owner
 * (fromAssigneeName) so an admin take-over keeps a complete audit trail; writes
 * STATUS_CHANGED only when work starts. The caller enforces staff/claimability.
 */
export async function claimTicketRow(args: {
  ticketId: string;
  actorId: string;
  actorName: string | null;
  fromAssigneeName: string | null;
  fromStatus: Status;
  fromPriority: Priority;
  priority: Priority;
  deadline: Date;
  writeAssigned: boolean;
  startWork: boolean;
}) {
  const set: Partial<typeof tickets.$inferInsert> = {
    assignedTo: args.actorId,
    priority: args.priority,
    deadline: args.deadline,
  };
  if (args.startWork) set.status = "IN_PROGRESS";

  const events = [];
  if (args.writeAssigned) {
    // A claim is always a self-assignment, so record it as CLAIMED (not ASSIGNED)
    // — the timeline then reads "claimed the ticket" instead of "assigned it to
    // <self>". Store the deadline in toValue so it shows on the same line;
    // fromValue keeps the prior owner on an admin take-over.
    events.push(
      db.insert(ticketActivity).values({
        ticketId: args.ticketId,
        actorId: args.actorId,
        type: "CLAIMED",
        fromValue: args.fromAssigneeName,
        toValue: args.deadline.toISOString(),
      })
    );
  }
  if (args.startWork) {
    events.push(
      db.insert(ticketActivity).values({
        ticketId: args.ticketId,
        actorId: args.actorId,
        type: "STATUS_CHANGED",
        fromValue: args.fromStatus,
        toValue: "IN_PROGRESS",
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

  await db.batch([
    db.update(tickets).set(set).where(eq(tickets.id, args.ticketId)),
    ...events,
  ]);
}

export async function setTicketPriority(args: {
  ticketId: string;
  actorId: string;
  from: Priority;
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
  search?: string;
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

const ticketListSelect = {
  id: tickets.id,
  number: tickets.number,
  title: tickets.title,
  department: tickets.department,
  status: tickets.status,
  priority: tickets.priority,
  sheetLink: tickets.sheetLink,
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
  // Attachment metadata for inline thumbnails/links. Correlates on the outer
  // tickets.id like the counts above (the list joins force qualification).
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

function ticketFilterConditions(filters: TicketFilters): SQL[] {
  // Soft-deleted tickets live only in the recycle bin — never in any list.
  const conds: SQL[] = [isNull(tickets.deletedAt)];
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

/** USER visibility (§6): only their own tickets. */
export async function listMyTickets(userId: string, filters: TicketFilters = {}) {
  const conds = [eq(tickets.createdBy, userId), ...ticketFilterConditions(filters)];
  return db
    .select(ticketListSelect)
    .from(tickets)
    .leftJoin(creatorUser, eq(tickets.createdBy, creatorUser.id))
    .leftJoin(assigneeUser, eq(tickets.assignedTo, assigneeUser.id))
    .where(and(...conds))
    .orderBy(desc(tickets.createdAt));
}

/**
 * MIS "work queue" (§6): tickets currently assigned to me that aren't closed —
 * i.e. the ones I'm actively working on. Most-recently-updated first.
 */
export async function listAssignedToMe(userId: string) {
  return db
    .select(ticketListSelect)
    .from(tickets)
    .leftJoin(creatorUser, eq(tickets.createdBy, creatorUser.id))
    .leftJoin(assigneeUser, eq(tickets.assignedTo, assigneeUser.id))
    .where(
      and(
        eq(tickets.assignedTo, userId),
        isNull(tickets.deletedAt),
        sql`${tickets.status}::text <> 'CLOSED'`
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
        isNull(tickets.deletedAt),
        sql`${tickets.status}::text in ('OPEN','IN_PROGRESS','REOPENED')`
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
        isNull(tickets.deletedAt),
        sql`${tickets.status}::text in ('OPEN','IN_PROGRESS','REOPENED')`
      )
    );
  return row?.count ?? 0;
}

/** MIS visibility (§6): all tickets. Caller must enforce the staff role. */
export async function listAllTickets(filters: TicketFilters = {}) {
  const conds = ticketFilterConditions(filters);
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
 * Per-tab ticket counts for the All Tickets tabs. Honors the facet filters
 * (department/priority/assignee/search) but ignores the status tab itself, so a
 * badge shows how many tickets fall under each tab given the current filters.
 */
export async function countTicketsByTab(
  filters: TicketFilters = {}
): Promise<Record<TicketTabKey, number>> {
  // Count across every status — honor the facet filters but not the status tab.
  const conds = ticketFilterConditions({
    priority: filters.priority,
    department: filters.department,
    assigneeId: filters.assigneeId,
    search: filters.search,
  });
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
      resolvedAt: tickets.resolvedAt,
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
    .where(and(eq(tickets.number, number), isNull(tickets.deletedAt)))
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
    .where(isNull(tickets.deletedAt));

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

export async function markAllNotificationsRead(userId: string) {
  await db
    .update(notifications)
    .set({ readAt: new Date() })
    .where(and(eq(notifications.userId, userId), isNull(notifications.readAt)));
}

export type NotificationRow = Awaited<ReturnType<typeof listNotifications>>[number];
