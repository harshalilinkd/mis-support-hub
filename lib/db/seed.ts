/**
 * Seed script — 3 users (one per role) + 2 sample ISSUE tickets + 2 sample
 * REQUEST tickets at different stages, so later phases have data to work with.
 *
 * Run with:  npm run db:seed   (apply the migration first)
 *
 * Self-contained: it builds its own neon-http client after loading .env.local,
 * so it doesn't depend on import order. The create logic mirrors
 * lib/db/queries.ts (client-side id + db.batch for atomicity).
 */
import { config } from "dotenv";

config({ path: ".env.local" });

import { neon } from "@neondatabase/serverless";
import { eq, sql } from "drizzle-orm";
import { drizzle } from "drizzle-orm/neon-http";

import * as schema from "./schema";
import {
  accessGrantees,
  systemAccessConfirmations,
  systems,
  progressLogs,
  requestDetails,
  ticketActivity,
  tickets,
  users,
} from "./schema";

if (!process.env.DATABASE_URL) {
  throw new Error("DATABASE_URL is not set (expected in .env.local)");
}

const db = drizzle(neon(process.env.DATABASE_URL), { schema });

type Department = (typeof schema.departmentEnum.enumValues)[number];
type Priority = (typeof schema.priorityEnum.enumValues)[number];

/**
 * ISSUE number from ticket_seq — deliberately UN-padded, exactly as before P10.
 * Do not "align" this to the app's lpad(...,3,'0') form: ticket_seq is declared
 * START WITH 1001, and Postgres lpad TRUNCATES ('1001' → '100'), so a padded seed
 * emits MIS-100 twice on a fresh database and dies on the number unique index.
 */
async function createTicket(args: {
  title: string;
  description: string;
  department: Department;
  priority: Priority;
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
        type: "ISSUE",
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

/** Mirrors queries.ts#createRequestTicket: number from request_seq (REQ-001), status SUBMITTED. */
async function createRequest(args: {
  systemName: string;
  problemStatement: string;
  currentProcess?: string | null;
  currentSheetLink?: string | null;
  expectedBenefit: string;
  department: Department;
  createdBy: string;
}) {
  const id = crypto.randomUUID();
  const [rows] = await db.batch([
    db
      .insert(tickets)
      .values({
        id,
        number: sql`'REQ-' || lpad(nextval('request_seq')::text, 3, '0')`,
        type: "REQUEST",
        title: args.systemName,
        description: args.problemStatement,
        department: args.department,
        status: "SUBMITTED",
        sheetLink: args.currentSheetLink ?? null,
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
    }),
    db.insert(ticketActivity).values({
      ticketId: id,
      actorId: args.createdBy,
      type: "SUBMITTED",
    }),
  ]);
  return rows[0];
}

/** Move a REQUEST's status and record the matching activity row (same-tx audit, §12.5). */
async function advanceRequest(
  ticketId: string,
  actorId: string,
  from: (typeof schema.statusEnum.enumValues)[number],
  to: (typeof schema.statusEnum.enumValues)[number],
  activity: (typeof ticketActivity.$inferInsert)["type"]
) {
  await db.batch([
    db.update(tickets).set({ status: to }).where(eq(tickets.id, ticketId)),
    db.insert(ticketActivity).values({
      ticketId,
      actorId,
      type: activity,
      fromValue: from,
      toValue: to,
    }),
  ]);
}

/** One progress log + its PROGRESS_LOGGED audit row — mirrors addProgressLog. */
async function logProgress(
  ticketId: string,
  authorId: string,
  type: (typeof schema.progressLogTypeEnum.enumValues)[number],
  percentComplete: number,
  body: string
) {
  await db.batch([
    db.insert(progressLogs).values({ ticketId, authorId, type, body, percentComplete }),
    db.insert(ticketActivity).values({
      ticketId,
      actorId: authorId,
      type: "PROGRESS_LOGGED",
      toValue: type,
    }),
  ]);
}

/**
 * Log a system + its full access checklist (§13.4), mirroring createSystemRow in
 * lib/db/queries.ts: app-side uuid + ONE db.batch, and the same never-truncating
 * code expression (pads to a MINIMUM of 3 — NOT lpad(n,3,'0'), which is the tracked
 * MIS-/REQ- ceiling bug).
 */
async function createSystemSeed(args: {
  name: string;
  systemType: "SHEET" | "APPS_SCRIPT" | "WEB_APP" | "OTHER";
  department: "LINKD" | "LD_SILK_MILLS" | "VHAGAR" | "LD_COTTON_MILLS";
  ownerId: string;
  frontendUrl: string;
  backendUrl: string | null;
  notes: string | null;
  linkedTicketId: string | null;
  loggedBy: string;
  grantees: { id: string; label: string }[];
}) {
  const id = crypto.randomUUID();
  const [rows] = await db.batch([
    db
      .insert(systems)
      .values({
        id,
        code: sql`(
          select 'SYS-' || lpad(n::text, greatest(3, length(n::text)), '0')
          from (select nextval('system_seq') as n) s
        )`,
        name: args.name,
        systemType: args.systemType,
        department: args.department,
        ownerId: args.ownerId,
        frontendUrl: args.frontendUrl,
        backendUrl: args.backendUrl,
        notes: args.notes,
        linkedTicketId: args.linkedTicketId,
        loggedBy: args.loggedBy,
      })
      .returning(),
    ...args.grantees.map((g) =>
      db.insert(systemAccessConfirmations).values({
        systemId: id,
        granteeId: g.id,
        granteeLabel: g.label,
        confirmed: true,
        confirmedBy: args.loggedBy,
      })
    ),
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

  // --- ISSUE tickets: seed once (skip if any issue already exists) ---
  const existingIssues = await db
    .select({ id: tickets.id })
    .from(tickets)
    .where(eq(tickets.type, "ISSUE"))
    .limit(1);
  if (existingIssues.length === 0) {
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
      { ticketId: t1.id, actorId: admin.id, type: "ASSIGNED", toValue: staff.name },
      {
        ticketId: t1.id,
        actorId: staff.id,
        type: "STATUS_CHANGED",
        fromValue: "OPEN",
        toValue: "IN_PROGRESS",
      },
    ]);
    console.log(`  ✓ issues: ${t1.number} (VHAGAR), ${t2.number} (LINKD)`);
  } else {
    console.log("  • issue tickets already present — skipping issue seed.");
  }

  // --- REQUEST tickets: seed once (skip if any request already exists) ---
  const existingRequests = await db
    .select({ id: tickets.id })
    .from(tickets)
    .where(eq(tickets.type, "REQUEST"))
    .limit(1);
  if (existingRequests.length === 0) {
    // Request 1 — sitting at PENDING_MD_APPROVAL (awaiting the recorded verdict).
    const r1 = await createRequest({
      systemName: "Purchase Order System",
      problemStatement:
        "POs are raised over email and tracked in a messy sheet. We lose approvals and can't see pending orders per vendor.",
      currentProcess:
        "Email to the purchase head, who maintains a personal Google Sheet of orders.",
      currentSheetLink:
        "https://docs.google.com/spreadsheets/d/1examplePurchaseOrders/edit",
      expectedBenefit:
        "One place to raise, approve, and track POs; no lost approvals; vendor-wise pending view.",
      department: "LINKD",
      createdBy: user.id,
    });
    await advanceRequest(r1.id, staff.id, "SUBMITTED", "UNDER_REVIEW", "MOVED_TO_REVIEW");
    await advanceRequest(
      r1.id,
      staff.id,
      "UNDER_REVIEW",
      "PENDING_MD_APPROVAL",
      "SENT_FOR_APPROVAL"
    );

    // Request 2 — approved, claimed, and IN_PROGRESS with progress logs.
    const r2 = await createRequest({
      systemName: "HRMS Leave & Attendance",
      problemStatement:
        "Leave requests are on paper and attendance is reconciled manually every month, causing payroll errors.",
      currentProcess: "Paper leave forms + a monthly manual attendance reconciliation.",
      currentSheetLink: null,
      expectedBenefit:
        "Self-service leave, auto attendance capture, accurate payroll inputs.",
      department: "LD_SILK_MILLS",
      createdBy: user.id,
    });
    await advanceRequest(r2.id, staff.id, "SUBMITTED", "UNDER_REVIEW", "MOVED_TO_REVIEW");
    await advanceRequest(
      r2.id,
      staff.id,
      "UNDER_REVIEW",
      "PENDING_MD_APPROVAL",
      "SENT_FOR_APPROVAL"
    );
    // Admin records the MD's approval (on the MD's behalf, §12.2/§12.5).
    await db.batch([
      db.update(tickets).set({ status: "APPROVED" }).where(eq(tickets.id, r2.id)),
      db
        .update(requestDetails)
        .set({
          mdDecision: "APPROVED",
          mdDecisionRecordedBy: admin.id,
          mdDecidedAt: new Date(),
          mdRemark: "Approved in the Monday review — proceed.",
        })
        .where(eq(requestDetails.ticketId, r2.id)),
      db.insert(ticketActivity).values({
        ticketId: r2.id,
        actorId: admin.id,
        type: "APPROVAL_RECORDED",
        fromValue: "PENDING_MD_APPROVAL",
        toValue: "APPROVED",
      }),
    ]);
    // Staff claims the build: assignee + priority only — the delivery date is
    // committed at start-work (§12.3, mirrors §5).
    const deadline = new Date();
    deadline.setDate(deadline.getDate() + 21);
    await db.batch([
      db
        .update(tickets)
        .set({ status: "CLAIMED", assignedTo: staff.id, priority: "HIGH" })
        .where(eq(tickets.id, r2.id)),
      db
        .update(requestDetails)
        .set({ claimedBy: staff.id, claimedAt: new Date() })
        .where(eq(requestDetails.ticketId, r2.id)),
      db.insert(ticketActivity).values([
        { ticketId: r2.id, actorId: staff.id, type: "CLAIMED", fromValue: "APPROVED", toValue: "CLAIMED" },
      ]),
    ]);
    // Build starts — this is where the delivery date is committed.
    await db.batch([
      db.update(tickets).set({ status: "IN_PROGRESS" }).where(eq(tickets.id, r2.id)),
      db.update(requestDetails).set({ deadline }).where(eq(requestDetails.ticketId, r2.id)),
      db.insert(ticketActivity).values([
        { ticketId: r2.id, actorId: staff.id, type: "STARTED", fromValue: "CLAIMED", toValue: "IN_PROGRESS" },
        { ticketId: r2.id, actorId: staff.id, type: "DEADLINE_SET", toValue: deadline.toISOString() },
      ]),
    ]);
    // NOTE: one log per batch, deliberately. Postgres now() is the TRANSACTION
    // timestamp, so batching both logs together stamps them identically and
    // "latest progress" (order by created_at desc limit 1) becomes a coin flip.
    // addProgressLog writes one log per call, so this mirrors real usage.
    await logProgress(r2.id, staff.id, "UPDATE", 40,
      "Data model drafted; leave-request form and approval flow built.");
    await logProgress(r2.id, staff.id, "BLOCKER", 55,
      "Waiting on the biometric device API credentials from IT to wire attendance capture.");

    console.log(`  ✓ requests: ${r1.number} (PENDING_MD_APPROVAL), ${r2.number} (IN_PROGRESS + logs)`);
  } else {
    console.log("  • request tickets already present — skipping request seed.");
  }

  // --- Systems Repository (§13): 2 fully-confirmed sample systems ---
  // Grantee labels are read from the DB, never hardcoded here (§13.2) — the two
  // rows come from migration 0013. If the migration hasn't been applied yet the
  // list is empty, and we skip rather than write a non-compliant system.
  const grantees = await db
    .select()
    .from(accessGrantees)
    .where(eq(accessGrantees.isActive, true));

  const existingSystems = await db.select({ id: systems.id }).from(systems).limit(1);
  if (grantees.length === 0) {
    console.log(
      "  • access_grantees is empty — apply migration 0013 first, skipping the systems seed."
    );
  } else if (existingSystems.length > 0) {
    console.log("  • systems already present — skipping the systems seed.");
  } else {
    // Link one sample to a real REQUEST so the directory's linked-REQ join has data.
    const [someRequest] = await db
      .select({ id: tickets.id, number: tickets.number })
      .from(tickets)
      .where(eq(tickets.type, "REQUEST"))
      .limit(1);

    const s1 = await createSystemSeed({
      name: "Purchase Order System",
      systemType: "WEB_APP",
      department: "LINKD",
      ownerId: staff.id,
      frontendUrl: "https://po.example.com/app",
      backendUrl: "https://console.cloud.google.com/apps-script/po-backend",
      notes: "Replaces the shared PO sheet. Approval flow + supplier emails.",
      linkedTicketId: someRequest?.id ?? null,
      loggedBy: admin.id,
      grantees,
    });

    const s2 = await createSystemSeed({
      name: "VHAGAR Production Entry Sheet",
      systemType: "SHEET",
      department: "VHAGAR",
      ownerId: admin.id,
      frontendUrl:
        "https://docs.google.com/spreadsheets/d/1exampleVHAGARproductionsheet/edit",
      backendUrl: null,
      notes: "Daily production entry; feeds the master sheet via an Apps Script trigger.",
      linkedTicketId: null,
      loggedBy: staff.id,
      grantees,
    });

    console.log(
      `  ✓ systems: ${s1.code} (${grantees.length} confirmations${
        someRequest ? `, linked to ${someRequest.number}` : ""
      }), ${s2.code}`
    );
  }

  console.log("Seed complete.");
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error("Seed failed:", error);
    process.exit(1);
  });
