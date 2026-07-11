import { and, desc, eq, gte, inArray, isNotNull, isNull, sql } from "drizzle-orm";

import { db } from "./index";
import type { Department, Priority } from "./schema";
import { tickets, users } from "./schema";

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

const deptEq = (department?: Department) =>
  department ? eq(tickets.department, department) : undefined;

export type FlowPoint = { date: string; created: number; resolved: number };

/** Created vs resolved per day over the range — the backlog-flow chart. */
export async function flowTrend(
  days: number,
  department?: Department
): Promise<FlowPoint[]> {
  const since = startOfRange(days);
  const keys: string[] = [];
  for (let i = 0; i < days; i++) {
    const d = new Date(since);
    d.setUTCDate(since.getUTCDate() + i);
    keys.push(d.toISOString().slice(0, 10));
  }
  const dayOf = (col: typeof tickets.createdAt | typeof tickets.resolvedAt) =>
    sql<string>`to_char(${col} at time zone 'UTC', 'YYYY-MM-DD')`;

  const [created, resolved] = await Promise.all([
    db
      .select({ day: dayOf(tickets.createdAt), n: sql<number>`count(*)`.mapWith(Number) })
      .from(tickets)
      .where(and(gte(tickets.createdAt, since), isNull(tickets.deletedAt), deptEq(department)))
      .groupBy(dayOf(tickets.createdAt)),
    db
      .select({ day: dayOf(tickets.resolvedAt), n: sql<number>`count(*)`.mapWith(Number) })
      .from(tickets)
      .where(and(isNotNull(tickets.resolvedAt), gte(tickets.resolvedAt, since), isNull(tickets.deletedAt), deptEq(department)))
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

/** Tickets created in range, by department (all departments; the dept filter is
 *  intentionally not applied — this chart IS the department breakdown). */
export async function createdByDepartment(
  days: number
): Promise<{ department: Department; count: number }[]> {
  return db
    .select({ department: tickets.department, count: sql<number>`count(*)`.mapWith(Number) })
    .from(tickets)
    .where(and(gte(tickets.createdAt, startOfRange(days)), isNull(tickets.deletedAt)))
    .groupBy(tickets.department);
}

/** Tickets created in range, by priority. */
export async function createdByPriority(
  days: number,
  department?: Department
): Promise<{ priority: Priority; count: number }[]> {
  return db
    .select({ priority: tickets.priority, count: sql<number>`count(*)`.mapWith(Number) })
    .from(tickets)
    .where(and(gte(tickets.createdAt, startOfRange(days)), isNull(tickets.deletedAt), deptEq(department)))
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
    .where(and(inArray(tickets.status, [...ACTIVE]), isNull(tickets.deletedAt), deptEq(department)))
    .groupBy(bucket);
}

/** Active tickets per assignee — team workload, busiest first. */
export async function assigneeWorkload(
  department?: Department
): Promise<{ id: string; name: string | null; count: number }[]> {
  return db
    .select({ id: users.id, name: users.name, count: sql<number>`count(*)`.mapWith(Number) })
    .from(tickets)
    .innerJoin(users, eq(tickets.assignedTo, users.id))
    .where(and(inArray(tickets.status, [...ACTIVE]), isNull(tickets.deletedAt), deptEq(department)))
    .groupBy(users.id, users.name)
    .orderBy(desc(sql`count(*)`));
}
