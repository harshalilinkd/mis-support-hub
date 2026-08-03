import { and, desc, eq, gte, inArray, isNotNull, isNull, lte, sql } from "drizzle-orm";

import { db } from "./index";
import type { Department, Priority, TicketType } from "./schema";
import { requestDetails, tickets, users } from "./schema";

/**
 * Dashboard analytics — read-only aggregations for the insights page. Kept in a
 * separate module from queries.ts so it can grow independently. All time-based
 * cuts use UTC day boundaries to match ticket-list formatting.
 */

const ACTIVE = ["OPEN", "IN_PROGRESS", "REOPENED"] as const;

/** Midnight UTC, `days-1` days ago (so a range of N spans N calendar days incl. today). */
function startOfRange(days: number): Date {
  const d = new Date();
  d.setUTCHours(0, 0, 0, 0);
  d.setUTCDate(d.getUTCDate() - (days - 1));
  return d;
}

/** Start-of-day (UTC) for an arbitrary date. */
function startOfUTCDay(d: Date): Date {
  const x = new Date(d);
  x.setUTCHours(0, 0, 0, 0);
  return x;
}
/** End-of-day (UTC) for an arbitrary date — inclusive upper bound. */
function endOfUTCDay(d: Date): Date {
  const x = new Date(d);
  x.setUTCHours(23, 59, 59, 999);
  return x;
}

const deptEq = (department?: Department) =>
  department ? eq(tickets.department, department) : undefined;

export type FlowPoint = { date: string; created: number; resolved: number };

/** Created vs resolved per day over an explicit [from, to] window — the backlog-flow
 *  chart. Daily buckets, capped so a very wide custom range can't explode the series. */
export async function flowTrend(
  from: Date,
  to: Date,
  department?: Department
): Promise<FlowPoint[]> {
  const MAX_DAYS = 180;
  const start = startOfUTCDay(from);
  const end = startOfUTCDay(to);
  const upper = endOfUTCDay(to);
  const keys: string[] = [];
  for (
    let d = new Date(start);
    d <= end && keys.length < MAX_DAYS;
    d.setUTCDate(d.getUTCDate() + 1)
  ) {
    keys.push(d.toISOString().slice(0, 10));
  }
  const dayOf = (col: typeof tickets.createdAt | typeof tickets.resolvedAt) =>
    sql<string>`to_char(${col} at time zone 'UTC', 'YYYY-MM-DD')`;

  const [created, resolved] = await Promise.all([
    db
      .select({ day: dayOf(tickets.createdAt), n: sql<number>`count(*)`.mapWith(Number) })
      .from(tickets)
      .where(and(gte(tickets.createdAt, start), lte(tickets.createdAt, upper), isNull(tickets.deletedAt), eq(tickets.type, "ISSUE"), deptEq(department)))
      .groupBy(dayOf(tickets.createdAt)),
    db
      .select({ day: dayOf(tickets.resolvedAt), n: sql<number>`count(*)`.mapWith(Number) })
      .from(tickets)
      .where(and(isNotNull(tickets.resolvedAt), gte(tickets.resolvedAt, start), lte(tickets.resolvedAt, upper), isNull(tickets.deletedAt), eq(tickets.type, "ISSUE"), deptEq(department)))
      .groupBy(dayOf(tickets.resolvedAt)),
  ]);

  const cMap = new Map(created.map((r) => [r.day, r.n]));
  const rMap = new Map(resolved.map((r) => [r.day, r.n]));
  return keys.map((date) => ({
    date,
    created: cMap.get(date) ?? 0,
    resolved: rMap.get(date) ?? 0,
  }));
}

/** Tickets created in the [from, to] window, by department (all departments; the dept
 *  filter is intentionally not applied — this chart IS the department breakdown). */
export async function createdByDepartment(
  from: Date,
  to: Date
): Promise<{ department: Department; count: number }[]> {
  return db
    .select({ department: tickets.department, count: sql<number>`count(*)`.mapWith(Number) })
    .from(tickets)
    .where(and(gte(tickets.createdAt, startOfUTCDay(from)), lte(tickets.createdAt, endOfUTCDay(to)), isNull(tickets.deletedAt), eq(tickets.type, "ISSUE")))
    .groupBy(tickets.department);
}

/** Tickets created in range, by priority. */
export async function createdByPriority(
  days: number,
  department?: Department
): Promise<{ priority: Priority | null; count: number }[]> {
  return db
    .select({ priority: tickets.priority, count: sql<number>`count(*)`.mapWith(Number) })
    .from(tickets)
    // Unset (null) priority = not triaged yet — excluded from the breakdown.
    .where(and(gte(tickets.createdAt, startOfRange(days)), isNotNull(tickets.priority), isNull(tickets.deletedAt), eq(tickets.type, "ISSUE"), deptEq(department)))
    .groupBy(tickets.priority);
}

/** Currently-open (active) tickets bucketed by age — a staleness/SLA read. */
export async function openAging(
  department?: Department
): Promise<{ key: "0" | "1" | "2" | "3"; count: number }[]> {
  const bucket = sql<"0" | "1" | "2" | "3">`case
    when now() - ${tickets.createdAt} < interval '1 day' then '0'
    when now() - ${tickets.createdAt} < interval '3 days' then '1'
    when now() - ${tickets.createdAt} < interval '7 days' then '2'
    else '3' end`;
  return db
    .select({ key: bucket, count: sql<number>`count(*)`.mapWith(Number) })
    .from(tickets)
    .where(and(inArray(tickets.status, [...ACTIVE]), isNull(tickets.deletedAt), eq(tickets.type, "ISSUE"), deptEq(department)))
    .groupBy(bucket);
}

/* ------------------------------------------------------------------ *
 * REQUEST reporting (CLAUDE.md §12) — the request pipeline at a glance.
 * ------------------------------------------------------------------ */

export interface RequestStats {
  awaitingApproval: number;
  approvedUnclaimed: number;
  inProgress: number;
  inTesting: number;
  /** Past its delivery date and still in flight (never closed/dropped). */
  overdue: number;
  /** Mean revision_round of accepted requests — "rounds to acceptance". */
  avgRoundsToAcceptance: number;
}

/** One pass over the request pipeline for the dashboard KPI row. */
export async function requestStats(department?: Department): Promise<RequestStats> {
  const [row] = await db
    .select({
      awaitingApproval:
        sql<number>`count(*) filter (where ${tickets.status} = 'PENDING_MD_APPROVAL')`.mapWith(Number),
      // APPROVED means the verdict is in but nobody has claimed the build yet.
      approvedUnclaimed:
        sql<number>`count(*) filter (where ${tickets.status} = 'APPROVED')`.mapWith(Number),
      inProgress:
        sql<number>`count(*) filter (where ${tickets.status} = 'IN_PROGRESS')`.mapWith(Number),
      inTesting:
        sql<number>`count(*) filter (where ${tickets.status} = 'IN_TESTING')`.mapWith(Number),
      // Overdue = the committed delivery date has fully PASSED and the build is still
      // being built. Compared by IST calendar day, so a deadline of "3 Aug" is on time
      // through end of 3 Aug and only overdue from 4 Aug. Only IN_PROGRESS counts:
      // once marked complete (IN_TESTING) or closed the assignee delivered on time, so
      // it's never overdue — even if it sits in testing past the date.
      overdue: sql<number>`count(*) filter (
        where ${requestDetails.deadline} < (now() at time zone 'Asia/Kolkata')::date
          and ${tickets.status} = 'IN_PROGRESS'
      )`.mapWith(Number),
      avgRoundsToAcceptance: sql<number>`coalesce(
        avg(${requestDetails.revisionRound}) filter (where ${tickets.status} = 'CLOSED'), 0
      )`.mapWith(Number),
    })
    .from(tickets)
    .innerJoin(requestDetails, eq(requestDetails.ticketId, tickets.id))
    .where(
      and(eq(tickets.type, "REQUEST"), isNull(tickets.deletedAt), deptEq(department))
    );

  return (
    row ?? {
      awaitingApproval: 0,
      approvedUnclaimed: 0,
      inProgress: 0,
      inTesting: 0,
      overdue: 0,
      avgRoundsToAcceptance: 0,
    }
  );
}

/** Active tickets per assignee — team workload, busiest first. */
export async function assigneeWorkload(
  department?: Department
): Promise<{ id: string; name: string | null; count: number }[]> {
  return db
    .select({ id: users.id, name: users.name, count: sql<number>`count(*)`.mapWith(Number) })
    .from(tickets)
    .innerJoin(users, eq(tickets.assignedTo, users.id))
    .where(and(inArray(tickets.status, [...ACTIVE]), isNull(tickets.deletedAt), eq(tickets.type, "ISSUE"), deptEq(department)))
    .groupBy(users.id, users.name)
    .orderBy(desc(sql`count(*)`));
}

export type AssigneePerf = {
  id: string;
  name: string | null;
  image: string | null;
  /** Total assigned to them = notStarted + inProgress + completed (they reconcile). */
  claimed: number;
  /** Claimed but work hasn't begun — ISSUE: OPEN; REQUEST: CLAIMED (pre start-work). */
  notStarted: number;
  inProgress: number;
  completed: number;
  /** Average completion time in HOURS (0 when they've completed nothing yet). */
  avgHours: number;
};

/**
 * Per-member performance report, grouped by the CURRENT assignee, one type at a time.
 * A dedicated aggregation (not one of the six §10 charts — this is a detail report; it
 * lives in analytics.ts alongside dashboardStats/requestStats).
 *  - ISSUE:   claimed = tickets assigned to them; inProgress = IN_PROGRESS/REOPENED;
 *             completed = RESOLVED/CLOSED; avg = resolved_at − created_at.
 *  - REQUEST: claimed = builds assigned to them; inProgress = CLAIMED/IN_PROGRESS/
 *             CHANGES_REQUESTED; completed = IN_TESTING/CLOSED (delivered);
 *             avg = completed_at − claimed_at (their build time).
 * "Claimed" reflects the current assignment (there is no reassignment/takeover, §6/§12).
 */
export async function assigneePerformance(
  type: TicketType,
  department?: Department
): Promise<AssigneePerf[]> {
  if (type === "REQUEST") {
    return db
      .select({
        id: users.id,
        name: users.name,
        image: users.image,
        claimed: sql<number>`count(*)`.mapWith(Number),
        // CLAIMED = picked up but start-work (the delivery commitment) hasn't happened.
        notStarted:
          sql<number>`count(*) filter (where ${tickets.status} = 'CLAIMED')`.mapWith(Number),
        inProgress:
          sql<number>`count(*) filter (where ${tickets.status} in ('IN_PROGRESS','CHANGES_REQUESTED'))`.mapWith(Number),
        completed:
          sql<number>`count(*) filter (where ${tickets.status} in ('IN_TESTING','CLOSED'))`.mapWith(Number),
        avgHours:
          sql<number>`coalesce(avg(extract(epoch from (${requestDetails.completedAt} - ${requestDetails.claimedAt})) / 3600.0) filter (where ${requestDetails.completedAt} is not null and ${requestDetails.claimedAt} is not null), 0)`.mapWith(
            Number
          ),
      })
      .from(tickets)
      .innerJoin(users, eq(tickets.assignedTo, users.id))
      .innerJoin(requestDetails, eq(requestDetails.ticketId, tickets.id))
      .where(
        and(
          eq(tickets.type, "REQUEST"),
          isNull(tickets.deletedAt),
          isNotNull(tickets.assignedTo),
          deptEq(department)
        )
      )
      .groupBy(users.id, users.name, users.image)
      .orderBy(desc(sql`count(*)`));
  }

  return db
    .select({
      id: users.id,
      name: users.name,
      image: users.image,
      claimed: sql<number>`count(*)`.mapWith(Number),
      // A claimed ISSUE stays OPEN until the member starts it (§5) — that's the gap
      // between "claimed" and in-progress+completed.
      notStarted:
        sql<number>`count(*) filter (where ${tickets.status} = 'OPEN')`.mapWith(Number),
      inProgress:
        sql<number>`count(*) filter (where ${tickets.status} in ('IN_PROGRESS','REOPENED'))`.mapWith(Number),
      completed:
        sql<number>`count(*) filter (where ${tickets.status} in ('RESOLVED','CLOSED'))`.mapWith(Number),
      avgHours:
        sql<number>`coalesce(avg(extract(epoch from (${tickets.resolvedAt} - ${tickets.createdAt})) / 3600.0) filter (where ${tickets.resolvedAt} is not null), 0)`.mapWith(
          Number
        ),
    })
    .from(tickets)
    .innerJoin(users, eq(tickets.assignedTo, users.id))
    .where(
      and(
        eq(tickets.type, "ISSUE"),
        isNull(tickets.deletedAt),
        isNotNull(tickets.assignedTo),
        deptEq(department)
      )
    )
    .groupBy(users.id, users.name, users.image)
    .orderBy(desc(sql`count(*)`));
}
