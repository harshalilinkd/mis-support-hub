import { sql } from "drizzle-orm";
import {
  boolean,
  date,
  index,
  integer,
  pgEnum,
  pgSequence,
  pgTable,
  primaryKey,
  text,
  timestamp,
  uuid,
} from "drizzle-orm/pg-core";
import type { AdapterAccountType } from "next-auth/adapters";

/* ------------------------------------------------------------------ *
 * Enums (CLAUDE.md §4)
 * ------------------------------------------------------------------ */
export const roleEnum = pgEnum("role", ["USER", "MIS_STAFF", "MIS_ADMIN"]);
export const departmentEnum = pgEnum("department", [
  "LINKD",
  "LD_SILK_MILLS",
  "VHAGAR",
  "LD_COTTON_MILLS",
]);
// ISSUE (support ticket) vs REQUEST (build-a-new-system) — one unified `tickets`
// model, two state machines chosen by `type` (CLAUDE.md §12).
export const ticketTypeEnum = pgEnum("ticket_type", ["ISSUE", "REQUEST"]);
// ONE status enum holding BOTH state sets. The applicable machine is picked by
// ticket.type; a status from the wrong set is rejected server-side (§12).
export const statusEnum = pgEnum("status", [
  // ISSUE lifecycle (§5)
  "OPEN",
  "IN_PROGRESS", // shared with REQUEST
  "RESOLVED",
  "CLOSED", // shared with REQUEST
  "REOPENED",
  // REQUEST lifecycle (§12.3) — IN_PROGRESS + CLOSED reused from above
  "SUBMITTED",
  "UNDER_REVIEW",
  "PENDING_MD_APPROVAL",
  "APPROVED",
  "DROPPED",
  "CLAIMED",
  "IN_TESTING",
  "CHANGES_REQUESTED",
]);
export const priorityEnum = pgEnum("priority", [
  "LOW",
  "MEDIUM",
  "HIGH",
  "URGENT",
]);
// MD's decision on a REQUEST (§12.2). PENDING until the MD (or an MIS_ADMIN
// recording an offline decision) approves or rejects.
export const mdDecisionEnum = pgEnum("md_decision", [
  "PENDING",
  "APPROVED",
  "REJECTED",
]);
// The kind of progress log entry on a REQUEST build (§12.1).
export const progressLogTypeEnum = pgEnum("progress_log_type", [
  "UPDATE",
  "REVIEW_SESSION",
  "BLOCKER",
]);

export type Role = (typeof roleEnum.enumValues)[number];
export type Department = (typeof departmentEnum.enumValues)[number];
export type TicketType = (typeof ticketTypeEnum.enumValues)[number];
export type Status = (typeof statusEnum.enumValues)[number];
export type Priority = (typeof priorityEnum.enumValues)[number];
export type MdDecision = (typeof mdDecisionEnum.enumValues)[number];
export type ProgressLogType = (typeof progressLogTypeEnum.enumValues)[number];

/** ticket_activity.type is stored as text (CLAUDE.md §4) but constrained in TS. */
export const ACTIVITY_TYPES = [
  // ISSUE + shared
  "CREATED",
  "STATUS_CHANGED",
  "ASSIGNED",
  "CLAIMED",
  "UNCLAIMED",
  "STARTED",
  "PRIORITY_CHANGED",
  "COMMENTED",
  "REOPENED",
  "EDITED",
  // REQUEST lifecycle (§12.1) — CLAIMED reused from above. The approval verdict is
  // recorded by an MIS_ADMIN on the MD's behalf (there is no MD role).
  "SUBMITTED",
  "MOVED_TO_REVIEW",
  "SENT_FOR_APPROVAL",
  "APPROVAL_RECORDED",
  "REJECTION_RECORDED",
  "DROPPED",
  "REVIVED",
  "DEADLINE_SET",
  "PROGRESS_LOGGED",
  "MARKED_COMPLETE",
  "CHANGES_REQUESTED",
  "ACCEPTED",
] as const;
export type ActivityType = (typeof ACTIVITY_TYPES)[number];

/** In-app notification kinds (P8, +REQUEST templates §12.6). */
export const NOTIFICATION_TYPES = [
  "NEW_TICKET",
  "TICKET_RESOLVED",
  "TICKET_ASSIGNED",
  "TICKET_CLAIMED",
  "TICKET_REOPENED",
  "TICKET_CLOSED",
  "TICKET_UPDATED",
  "NEW_COMMENT",
  // REQUEST notifications (§12.6)
  "REQUEST_SUBMITTED",
  "REQUEST_PENDING_APPROVAL",
  "REQUEST_DECISION_RECORDED",
  "REQUEST_CLAIMED",
  // Extends §12.6: the requester was told "{member} has picked up {number}" on the
  // claim, so an undo has to correct that — otherwise they keep believing someone
  // is building it. (An ISSUE release is silent only because its claim is too.)
  "REQUEST_RELEASED",
  // Extends §12.6: P12 requires the requester be told when a delivery date moves
  // ("deadline changes are never silent"). Reflect into §12.6 when §12 is written.
  "REQUEST_DEADLINE_CHANGED",
  "REQUEST_PROGRESS",
  "REQUEST_READY_FOR_TESTING",
  "REQUEST_CHANGES_REQUESTED",
  "REQUEST_ACCEPTED",
] as const;
export type NotificationType = (typeof NOTIFICATION_TYPES)[number];

/* ------------------------------------------------------------------ *
 * Sequential ticket numbers — never a row count (CLAUDE.md §9, §12).
 *   ISSUE   → ticket_seq  → 'MIS-' || lpad(nextval, 3, '0')
 *   REQUEST → request_seq → 'REQ-' || lpad(nextval, 3, '0')  → REQ-001, REQ-002, …
 * The insert path picks the sequence by ticket.type.
 *
 * ticket_seq is the LIVE issue sequence and is deliberately left exactly as-is
 * (§12) — note its declared start (1001) does NOT match the live numbering: the
 * live sequence currently dispenses 1,2,3… so real issues read MIS-001…MIS-006.
 * Do NOT "reconcile" startWith here; it would change live ISSUE numbering.
 *
 * KNOWN LIMIT (both sequences): Postgres lpad TRUNCATES past the pad width
 * (lpad('1000',3,'0') → '100'), so either sequence collides on tickets.number
 * once it passes 999. Pre-existing for ISSUE; flagged, not fixed in P10/P11.
 * ------------------------------------------------------------------ */
export const ticketSeq = pgSequence("ticket_seq", {
  startWith: 1001,
  increment: 1,
});
export const requestSeq = pgSequence("request_seq", {
  startWith: 1,
  increment: 1,
});

/* ------------------------------------------------------------------ *
 * Users + Auth.js (Drizzle adapter) tables
 * ------------------------------------------------------------------ */
export const users = pgTable("users", {
  id: uuid("id").defaultRandom().primaryKey(),
  name: text("name"),
  email: text("email").notNull().unique(),
  emailVerified: timestamp("email_verified", {
    mode: "date",
    withTimezone: true,
  }),
  image: text("image"),
  // bcrypt hash for email+password sign-in. Null for Google-only accounts
  // (auth stays Google SSO first; passwords are an additional door — CLAUDE.md §7).
  passwordHash: text("password_hash"),
  role: roleEnum("role").notNull().default("USER"),
  department: departmentEnum("department"),
  isActive: boolean("is_active").notNull().default(true),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});

export const accounts = pgTable(
  "accounts",
  {
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    type: text("type").$type<AdapterAccountType>().notNull(),
    provider: text("provider").notNull(),
    providerAccountId: text("provider_account_id").notNull(),
    refresh_token: text("refresh_token"),
    access_token: text("access_token"),
    expires_at: integer("expires_at"),
    token_type: text("token_type"),
    scope: text("scope"),
    id_token: text("id_token"),
    session_state: text("session_state"),
  },
  (account) => [
    primaryKey({
      columns: [account.provider, account.providerAccountId],
    }),
  ]
);

export const sessions = pgTable("sessions", {
  sessionToken: text("session_token").primaryKey(),
  userId: uuid("user_id")
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  expires: timestamp("expires", { mode: "date", withTimezone: true }).notNull(),
});

export const verificationTokens = pgTable(
  "verification_tokens",
  {
    identifier: text("identifier").notNull(),
    token: text("token").notNull(),
    expires: timestamp("expires", {
      mode: "date",
      withTimezone: true,
    }).notNull(),
  },
  (vt) => [primaryKey({ columns: [vt.identifier, vt.token] })]
);

/* ------------------------------------------------------------------ *
 * Tickets + related tables
 * ------------------------------------------------------------------ */
export const tickets = pgTable("tickets", {
  id: uuid("id").defaultRandom().primaryKey(),
  // Generated in the insert path via nextval('ticket_seq') — see lib/db/queries.ts
  // (createTicket). No column default: numbers must come from the sequence,
  // never a row count (CLAUDE.md §9).
  number: text("number").notNull().unique(),
  // ISSUE (support) vs REQUEST (build-a-new-system). Drives the numbering
  // sequence (MIS-/REQ-) and which state machine applies (CLAUDE.md §12).
  type: ticketTypeEnum("type").notNull().default("ISSUE"),
  title: text("title").notNull(),
  description: text("description").notNull(),
  department: departmentEnum("department").notNull(),
  sheetLink: text("sheet_link"),
  // Default OPEN suits an ISSUE; a REQUEST is inserted as SUBMITTED explicitly.
  status: statusEnum("status").notNull().default("OPEN"),
  // Nullable: a raised ticket has NO priority — the MIS team sets it when they
  // claim it. null = "not triaged yet" (shown as "Unset").
  priority: priorityEnum("priority"),
  createdBy: uuid("created_by")
    .notNull()
    .references(() => users.id),
  assignedTo: uuid("assigned_to").references(() => users.id),
  resolvedAt: timestamp("resolved_at", { withTimezone: true }),
  resolvedBy: uuid("resolved_by").references(() => users.id),
  // Estimated resolution date set by MIS when they claim the ticket (§ claim flow).
  deadline: timestamp("deadline", { withTimezone: true }),
  // Soft delete (recycle bin): non-null means the ticket is in the bin — hidden
  // everywhere except the bin. Restore clears these; permanent delete drops the row.
  deletedAt: timestamp("deleted_at", { withTimezone: true }),
  deletedBy: uuid("deleted_by").references(() => users.id),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .notNull()
    .defaultNow()
    .$onUpdate(() => new Date()),
}, (t) => [
  index("tickets_status_idx").on(t.status),
  index("tickets_type_idx").on(t.type),
  index("tickets_assigned_to_idx").on(t.assignedTo),
  index("tickets_created_by_idx").on(t.createdBy),
  // Active-ticket access paths. Every list/count/analytics query filters
  // `deleted_at IS NULL`, so these are partial indexes over just the live rows,
  // ordered to match each query's ORDER BY (avoids sort + seq-scan at scale).
  index("tickets_active_created_idx")
    .on(t.createdAt.desc())
    .where(sql`${t.deletedAt} is null`), // listAllTickets
  index("tickets_active_creator_idx")
    .on(t.createdBy, t.createdAt.desc())
    .where(sql`${t.deletedAt} is null`), // listMyTickets
  index("tickets_active_assignee_idx")
    .on(t.assignedTo, t.updatedAt.desc())
    .where(sql`${t.deletedAt} is null`), // listAssignedToMe
  index("tickets_active_resolved_idx")
    .on(t.resolvedAt)
    .where(sql`${t.deletedAt} is null`), // dashboard/analytics resolved metrics
  index("tickets_deleted_idx")
    .on(t.deletedAt)
    .where(sql`${t.deletedAt} is not null`), // recycle bin
]);

export const ticketComments = pgTable("ticket_comments", {
  id: uuid("id").defaultRandom().primaryKey(),
  ticketId: uuid("ticket_id")
    .notNull()
    .references(() => tickets.id, { onDelete: "cascade" }),
  authorId: uuid("author_id")
    .notNull()
    .references(() => users.id),
  body: text("body").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
}, (t) => [index("ticket_comments_ticket_id_idx").on(t.ticketId)]);

export const ticketAttachments = pgTable("ticket_attachments", {
  id: uuid("id").defaultRandom().primaryKey(),
  ticketId: uuid("ticket_id")
    .notNull()
    .references(() => tickets.id, { onDelete: "cascade" }),
  commentId: uuid("comment_id").references(() => ticketComments.id, {
    onDelete: "cascade",
  }),
  url: text("url").notNull(),
  filename: text("filename").notNull(),
  contentType: text("content_type").notNull(),
  sizeBytes: integer("size_bytes").notNull(),
  uploadedBy: uuid("uploaded_by")
    .notNull()
    .references(() => users.id),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
}, (t) => [
  // The attachment count + json_agg subqueries in ticketListSelect filter on
  // ticket_id once per ticket row — without this they seq-scan the whole table.
  index("ticket_attachments_ticket_id_idx").on(t.ticketId),
]);

/** Audit trail — write a row on EVERY mutation (CLAUDE.md §4, §9). */
export const ticketActivity = pgTable("ticket_activity", {
  id: uuid("id").defaultRandom().primaryKey(),
  ticketId: uuid("ticket_id")
    .notNull()
    .references(() => tickets.id, { onDelete: "cascade" }),
  actorId: uuid("actor_id")
    .notNull()
    .references(() => users.id),
  type: text("type").$type<ActivityType>().notNull(),
  fromValue: text("from_value"),
  toValue: text("to_value"),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
}, (t) => [index("ticket_activity_ticket_id_idx").on(t.ticketId)]);

/* ------------------------------------------------------------------ *
 * REQUEST-specific tables (CLAUDE.md §12.2). Only rows for tickets with
 * type=REQUEST; the shared ticket/comment/attachment/activity tables carry
 * everything else — no parallel table set.
 * ------------------------------------------------------------------ */

/** 1:1 with a REQUEST ticket — the intake brief + the MD-decision / build state. */
export const requestDetails = pgTable("request_details", {
  ticketId: uuid("ticket_id")
    .primaryKey()
    .references(() => tickets.id, { onDelete: "cascade" }),
  // Intake brief (the requester fills these).
  systemName: text("system_name").notNull(),
  problemStatement: text("problem_statement").notNull(),
  currentProcess: text("current_process"),
  currentSheetLink: text("current_sheet_link"),
  intendedUsers: text("intended_users").notNull(),
  expectedBenefit: text("expected_benefit").notNull(),
  // NOTE: no `urgency` / `target_date` here. A REQUEST mirrors the ISSUE flow (§5):
  // the requester states the need, MIS sets `tickets.priority` when they claim it,
  // and the delivery `deadline` below is set when they start work. The requester
  // never self-assigns a priority or a date.
  // MD decision (§12.2). There is NO MD role/login — the approval is an offline
  // formality an MIS_ADMIN records on the MD's behalf: `mdDecisionRecordedBy` is
  // the admin who ticked it (defaults to the acting admin), `mdDecidedAt` is when,
  // and `mdRemark` is optional even on reject. This admin + timestamp IS the
  // accountability record for the MD formality (§12.5).
  mdDecision: mdDecisionEnum("md_decision").notNull().default("PENDING"),
  mdDecisionRecordedBy: uuid("md_decision_recorded_by").references(() => users.id),
  mdDecidedAt: timestamp("md_decided_at", { withTimezone: true }),
  mdRemark: text("md_remark"),
  // Build state (set on claim / through the build).
  claimedBy: uuid("claimed_by").references(() => users.id),
  claimedAt: timestamp("claimed_at", { withTimezone: true }),
  deadline: date("deadline", { mode: "date" }),
  // Source of truth for "how many times it came back" (§12.5).
  revisionRound: integer("revision_round").notNull().default(0),
  completedAt: timestamp("completed_at", { withTimezone: true }),
  acceptedAt: timestamp("accepted_at", { withTimezone: true }),
});

/** Progress updates / review-session notes / blockers logged during a build. */
export const progressLogs = pgTable(
  "progress_logs",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    ticketId: uuid("ticket_id")
      .notNull()
      .references(() => tickets.id, { onDelete: "cascade" }),
    authorId: uuid("author_id")
      .notNull()
      .references(() => users.id),
    type: progressLogTypeEnum("type").notNull(),
    body: text("body").notNull(),
    percentComplete: integer("percent_complete"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [index("progress_logs_ticket_id_idx").on(t.ticketId)]
);

/** In-app notifications — one row per recipient per event (P8). */
export const notifications = pgTable(
  "notifications",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    type: text("type").$type<NotificationType>().notNull(),
    ticketId: uuid("ticket_id").references(() => tickets.id, {
      onDelete: "cascade",
    }),
    ticketNumber: text("ticket_number"),
    title: text("title").notNull(),
    body: text("body"),
    readAt: timestamp("read_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [index("notifications_user_id_idx").on(t.userId)]
);

/* ------------------------------------------------------------------ *
 * Inferred row types
 * ------------------------------------------------------------------ */
export type User = typeof users.$inferSelect;
export type NewUser = typeof users.$inferInsert;
export type Ticket = typeof tickets.$inferSelect;
export type NewTicket = typeof tickets.$inferInsert;
export type TicketComment = typeof ticketComments.$inferSelect;
export type NewTicketComment = typeof ticketComments.$inferInsert;
export type TicketAttachment = typeof ticketAttachments.$inferSelect;
export type NewTicketAttachment = typeof ticketAttachments.$inferInsert;
export type TicketActivityRow = typeof ticketActivity.$inferSelect;
export type NewTicketActivityRow = typeof ticketActivity.$inferInsert;
export type RequestDetails = typeof requestDetails.$inferSelect;
export type NewRequestDetails = typeof requestDetails.$inferInsert;
export type ProgressLog = typeof progressLogs.$inferSelect;
export type NewProgressLog = typeof progressLogs.$inferInsert;
export type Notification = typeof notifications.$inferSelect;
export type NewNotification = typeof notifications.$inferInsert;
