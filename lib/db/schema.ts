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

// Systems Repository (§13.1). Brand-new enums on brand-new tables — additive, so
// none of the ALTER TYPE ADD VALUE caveats that applied to `status` in 0010 apply.
export const systemTypeEnum = pgEnum("system_type", [
  "SHEET",
  "APPS_SCRIPT",
  "WEB_APP",
  "OTHER",
]);
// ARCHIVED is retirement, NOT deletion — §13 has no soft-delete/recycle bin, so a
// system is never hard-deleted (§13.3).
export const systemStatusEnum = pgEnum("system_status", [
  "ACTIVE",
  "DEPRECATED",
  "ARCHIVED",
]);

// Google-SSO access requests (§7): a stranger's first sign-in records a PENDING
// request instead of a users row; an admin's approval is what creates the user.
export const accessRequestStatusEnum = pgEnum("access_request_status", [
  "PENDING",
  "APPROVED",
  "REJECTED",
]);

export type Role = (typeof roleEnum.enumValues)[number];
export type Department = (typeof departmentEnum.enumValues)[number];
export type TicketType = (typeof ticketTypeEnum.enumValues)[number];
export type Status = (typeof statusEnum.enumValues)[number];
export type Priority = (typeof priorityEnum.enumValues)[number];
export type MdDecision = (typeof mdDecisionEnum.enumValues)[number];
export type ProgressLogType = (typeof progressLogTypeEnum.enumValues)[number];
export type SystemType = (typeof systemTypeEnum.enumValues)[number];
export type SystemStatus = (typeof systemStatusEnum.enumValues)[number];
export type AccessRequestStatus =
  (typeof accessRequestStatusEnum.enumValues)[number];

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
  // A misfiled ticket was moved between modules (ISSUE ⇄ REQUEST). from_value/to_value
  // carry the old and new numbers so the timeline shows the renumber (§12). TEXT-
  // constrained, so no migration.
  "MOVED",
] as const;
export type ActivityType = (typeof ACTIVITY_TYPES)[number];

/** In-app notification kinds (P8, +REQUEST templates §12.6). */
export const NOTIFICATION_TYPES = [
  "NEW_TICKET",
  "TICKET_RESOLVED",
  "TICKET_ASSIGNED",
  "TICKET_CLAIMED",
  // §8 + the §12.6 reversal rule: TICKET_CLAIMED is sent when work STARTS ("expected
  // by X"), so abandoning that start must correct it. A release from OPEN stays silent
  // — the claim itself was silent, so nothing needs correcting.
  "TICKET_RELEASED",
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
  // §12.6's reversal rule: a DROPPED verdict is announced by email, so its undo
  // (reviveRequest) must be announced too — otherwise the drop mail sits in the
  // requester's inbox asserting a dead request that is in fact back under review.
  "REQUEST_REVIVED",
  // Access requests (§7). ACCESS_REQUESTED → admins (a stranger asked to be let in);
  // ACCESS_APPROVED → the new user's welcome, seen on their first sign-in.
  "ACCESS_REQUESTED",
  "ACCESS_APPROVED",
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

/**
 * Systems Repository sequence (§13.7). Feeds `systems.code` = 'SYS-001', 'SYS-002'…
 *
 * Unlike ticket_seq / request_seq, this one is CORRECT PAST 999 by construction. The
 * MIS-/REQ- ceiling (docs/known-issues/0001) comes from `lpad(n,3,'0')`, which
 * TRUNCATES once the number outgrows the pad width — lpad('1000',3,'0') → '100',
 * which then collides with SYS-100 on the unique index. The code expression here
 * pads to a MINIMUM of 3 instead:
 *
 *   lpad(n::text, greatest(3, length(n::text)), '0')
 *
 * → 1 → '001', 999 → '999', 1000 → '1000', 12345 → '12345'. Never truncates, because
 * the width is never smaller than the string. (Verified against Postgres. Note
 * `to_char(n, 'FM000')` is the tempting alternative and is WRONG — it overflows to
 * '###' past 999.) See systemCodeSql in lib/db/queries.ts — the one place it lives.
 */
export const systemSeq = pgSequence("system_seq", {
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
  expectedBenefit: text("expected_benefit").notNull(),
  // NOTE: no `intended_users` either — intake captures the problem and the benefit;
  // who ends up using the system is worked out during the build, not at intake.
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
 * Systems Repository (§13) — purely additive. A directory of every system MIS
 * builds, so URLs aren't lost. Nothing here touches issue/request logic.
 * ------------------------------------------------------------------ */

/**
 * The directory row. `code` ('SYS-001') is the human-readable handle and the
 * deep-link key — drawn from system_seq, never from a row count (§9).
 */
export const systems = pgTable(
  "systems",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    code: text("code").notNull().unique(),
    name: text("name").notNull(),
    systemType: systemTypeEnum("system_type").notNull(),
    department: departmentEnum("department").notNull(),
    // Who owns the system day-to-day (not necessarily who logged it).
    ownerId: uuid("owner_id")
      .notNull()
      .references(() => users.id),
    frontendUrl: text("frontend_url").notNull(),
    backendUrl: text("backend_url"),
    status: systemStatusEnum("status").notNull().default("ACTIVE"),
    notes: text("notes"),
    // Set when the system was logged off the back of a REQUEST (§13.5). No cascade:
    // deleting a ticket must never silently delete the directory entry.
    linkedTicketId: uuid("linked_ticket_id").references(() => tickets.id),
    loggedBy: uuid("logged_by")
      .notNull()
      .references(() => users.id),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow()
      .$onUpdate(() => new Date()),
  },
  (t) => [
    index("systems_code_idx").on(t.code),
    index("systems_name_idx").on(t.name),
    index("systems_department_idx").on(t.department),
    index("systems_status_idx").on(t.status),
  ]
);

/**
 * The self-attested access checklist (§13.4). One row per active grantee per system,
 * written in the SAME batch as the system itself.
 *
 * `granteeLabel` is a SNAPSHOT of the name at confirm time, deliberately not a join:
 * renaming or deactivating a grantee later must not rewrite history. `granteeId`
 * is kept alongside it for integrity, but the label is the record.
 *
 * This attests that a human ticked a box — it does NOT verify Google sharing (that
 * needs the Drive API; explicitly out of scope). The accountability trail is
 * confirmed_by + confirmed_at.
 */
export const systemAccessConfirmations = pgTable(
  "system_access_confirmations",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    systemId: uuid("system_id")
      .notNull()
      .references(() => systems.id, { onDelete: "cascade" }),
    granteeId: uuid("grantee_id").references(() => accessGrantees.id),
    granteeLabel: text("grantee_label").notNull(),
    confirmed: boolean("confirmed").notNull().default(false),
    confirmedBy: uuid("confirmed_by")
      .notNull()
      .references(() => users.id),
    confirmedAt: timestamp("confirmed_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [index("system_access_confirmations_system_id_idx").on(t.systemId)]
);

/**
 * Admin-managed config driving the required checklist (§13.2/§13.3). Grantee names
 * are NEVER hardcoded in a form or an action — they are read from here.
 *
 * `label` is unique so the migration seed can be idempotent (ON CONFLICT DO NOTHING).
 * Rows are deactivated, never deleted, so old confirmations keep their referent.
 */
export const accessGrantees = pgTable(
  "access_grantees",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    label: text("label").notNull().unique(),
    isActive: boolean("is_active").notNull().default(true),
    sortOrder: integer("sort_order").notNull().default(0),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("access_grantees_is_active_idx").on(t.isActive)]
);

/**
 * Google-SSO access requests (§7). A stranger's first Google sign-in records a row
 * here instead of a `users` row — it grants NOTHING. Only an MIS_ADMIN approval
 * creates the actual `users` row (default role USER), so §7's invariant holds:
 * "account creation belongs to MIS_ADMIN actions only."
 *
 * `email` is unique so a repeat sign-in refreshes the existing request rather than
 * piling up duplicates. A REJECTED row is sticky — a declined stranger's retry does
 * not silently re-open it (an admin can clear it). The password door is untouched:
 * strangers have no password, and self-service password signup is the exact hole §7
 * closed — requests come ONLY from Google.
 */
export const accessRequests = pgTable(
  "access_requests",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    email: text("email").notNull().unique(),
    // Snapshotted from the Google profile at request time (may be null).
    name: text("name"),
    image: text("image"),
    status: accessRequestStatusEnum("status").notNull().default("PENDING"),
    requestedAt: timestamp("requested_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    // Who approved/rejected + when — the accountability trail (nullable while PENDING).
    decidedBy: uuid("decided_by").references(() => users.id),
    decidedAt: timestamp("decided_at", { withTimezone: true }),
    // The users row an approval created — links the request to the account it minted.
    // No cascade: deleting the user must not erase the audit that they were approved.
    createdUserId: uuid("created_user_id").references(() => users.id),
  },
  (t) => [index("access_requests_status_idx").on(t.status)]
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
export type SystemRow = typeof systems.$inferSelect;
export type NewSystemRow = typeof systems.$inferInsert;
export type SystemAccessConfirmation = typeof systemAccessConfirmations.$inferSelect;
export type NewSystemAccessConfirmation = typeof systemAccessConfirmations.$inferInsert;
export type AccessGrantee = typeof accessGrantees.$inferSelect;
export type NewAccessGrantee = typeof accessGrantees.$inferInsert;
