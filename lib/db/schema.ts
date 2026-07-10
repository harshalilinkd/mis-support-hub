import {
  boolean,
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
export const statusEnum = pgEnum("status", [
  "OPEN",
  "IN_PROGRESS",
  "RESOLVED",
  "CLOSED",
  "REOPENED",
]);
export const priorityEnum = pgEnum("priority", [
  "LOW",
  "MEDIUM",
  "HIGH",
  "URGENT",
]);

export type Role = (typeof roleEnum.enumValues)[number];
export type Department = (typeof departmentEnum.enumValues)[number];
export type Status = (typeof statusEnum.enumValues)[number];
export type Priority = (typeof priorityEnum.enumValues)[number];

/** ticket_activity.type is stored as text (CLAUDE.md §4) but constrained in TS. */
export const ACTIVITY_TYPES = [
  "CREATED",
  "STATUS_CHANGED",
  "ASSIGNED",
  "CLAIMED",
  "PRIORITY_CHANGED",
  "COMMENTED",
  "REOPENED",
  "EDITED",
] as const;
export type ActivityType = (typeof ACTIVITY_TYPES)[number];

/** In-app notification kinds (P8). */
export const NOTIFICATION_TYPES = [
  "TICKET_RESOLVED",
  "TICKET_ASSIGNED",
  "TICKET_CLAIMED",
  "TICKET_REOPENED",
  "TICKET_CLOSED",
  "TICKET_UPDATED",
  "NEW_COMMENT",
] as const;
export type NotificationType = (typeof NOTIFICATION_TYPES)[number];

/* ------------------------------------------------------------------ *
 * Global sequential ticket number — MIS-1001, MIS-1002, ...
 * Numbers come from this sequence, never from a row count (CLAUDE.md §9).
 * ------------------------------------------------------------------ */
export const ticketSeq = pgSequence("ticket_seq", {
  startWith: 1001,
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
  title: text("title").notNull(),
  description: text("description").notNull(),
  department: departmentEnum("department").notNull(),
  sheetLink: text("sheet_link"),
  status: statusEnum("status").notNull().default("OPEN"),
  priority: priorityEnum("priority").notNull().default("MEDIUM"),
  createdBy: uuid("created_by")
    .notNull()
    .references(() => users.id),
  assignedTo: uuid("assigned_to").references(() => users.id),
  resolvedAt: timestamp("resolved_at", { withTimezone: true }),
  resolvedBy: uuid("resolved_by").references(() => users.id),
  // Estimated resolution date set by MIS when they claim the ticket (§ claim flow).
  deadline: timestamp("deadline", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .notNull()
    .defaultNow()
    .$onUpdate(() => new Date()),
}, (t) => [
  index("tickets_status_idx").on(t.status),
  index("tickets_assigned_to_idx").on(t.assignedTo),
  index("tickets_created_by_idx").on(t.createdBy),
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
});

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
export type Notification = typeof notifications.$inferSelect;
export type NewNotification = typeof notifications.$inferInsert;
