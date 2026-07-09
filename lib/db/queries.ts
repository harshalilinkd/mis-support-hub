import {
  and,
  asc,
  desc,
  eq,
  ilike,
  inArray,
  isNull,
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

/* ------------------------------------------------------------------ *
 * Aliases (users is joined several times per query)
 * ------------------------------------------------------------------ */
const creatorUser = alias(users, "creator");
const assigneeUser = alias(users, "assignee");
const resolverUser = alias(users, "resolver");
const authorUser = alias(users, "author");
const actorUser = alias(users, "actor");

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
    .where(eq(tickets.id, id))
    .limit(1);
  return row ?? null;
}

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
};

function ticketFilterConditions(filters: TicketFilters): SQL[] {
  const conds: SQL[] = [];
  if (filters.status) conds.push(eq(tickets.status, filters.status));
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

/** Count of the user's active (non-closed, non-resolved) tickets — for the nav badge. */
export async function countMyActiveTickets(userId: string): Promise<number> {
  const [row] = await db
    .select({ count: sql<number>`count(*)`.mapWith(Number) })
    .from(tickets)
    .where(
      and(
        eq(tickets.createdBy, userId),
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
    .where(eq(tickets.number, number))
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
    .from(tickets);

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
    .where(sql`${tickets.createdAt} >= now() - (${days - 1} * interval '1 day')`)
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
