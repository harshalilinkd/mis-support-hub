# CLAUDE.md — MIS Ticketing System · Single Source of Truth

This file is the constitution. Every architectural decision, schema rule, and
convention lives here. If a prompt conflicts with CLAUDE.md, CLAUDE.md wins. Do not
invent fields, routes, or libraries that are not described here without flagging it
first. It reflects the system **as built** (kept in sync with the code) — when you
change the schema, auth, or a core convention, update the matching section here.

## 1. What we are building
An internal MIS support ticketing web app for a textile group (departments:
LINKD, LD SILK MILLS, VHAGAR, LD COTTON MILLS). Employees raise tickets for
system/sheet/app issues; the MIS team claims, works, and resolves them; the
reporter is notified and can confirm (which closes the ticket for good) or reopen.
Replaces a Google Form + Sheet. Most issues reference a specific Google
Sheet/AppSheet/Apps Script artifact, so "Sheet Link" is a first-class field.

## 2. Non-negotiable stack
- Next.js 15 (App Router, Server Actions, Route Handlers), TypeScript strict.
- Neon PostgreSQL, Drizzle ORM (`drizzle-orm/neon-http` + `@neondatabase/serverless`), drizzle-kit for migrations.
  - `neon-http` has **no interactive transactions** — batch related writes with `db.batch([...])`; never assume a multi-statement transaction spanning awaits.
- Auth.js v5 (`next-auth@beta`) + `@auth/drizzle-adapter`. **Google SSO first**, plus an **email + password** door (`bcryptjs` hash in `users.password_hash`).
- Tailwind CSS v4 (CSS-first `@theme`) + shadcn/ui (radix-ui primitives) + lucide-react icons. Dark mode via `next-themes` (`.dark` class).
- File storage: Vercel Blob (`@vercel/blob`) — client-upload token flow.
- Email: Resend (`resend`). In-app notifications persisted in Postgres + a Web-Audio chime.
- Kanban drag-drop: `@dnd-kit/core` + `@dnd-kit/sortable`.
- Toasts: `sonner`. Forms: `react-hook-form` + `zod`.
Do NOT use Prisma, do NOT use an ORM other than Drizzle, do NOT store files in the DB.

## 3. Folder structure
```
/app
  /(auth)/login/page.tsx
  /(app)/layout.tsx                 # app shell (sidebar+topbar), session-gated, mounts AutoRefresh
  /(app)/page.tsx                   # role-aware home → USER to /my, staff to /dashboard
  /(app)/my/page.tsx                # "My Tickets" (employee) / "Assigned to Me" (staff)
  /(app)/new/page.tsx               # raise a ticket
  /(app)/tickets/page.tsx           # MIS: All Tickets table (status tabs, bulk claim)
  /(app)/tickets/[number]/page.tsx  # ticket detail (shared, deep-link/fallback)
  /(app)/dashboard/page.tsx         # MIS: KPI cards + charts
  /(app)/board/page.tsx             # MIS: Kanban
  /(app)/profile/page.tsx           # edit name/department + set/change password
  /(app)/settings/users/page.tsx    # admin: user management + bulk add
  /(app)/settings/recycle-bin/page.tsx # admin: soft-deleted tickets (restore / purge)
  /api/auth/[...nextauth]/route.ts
  /api/upload/route.ts              # Vercel Blob client-upload token
/lib
  /db/schema.ts /db/index.ts /db/queries.ts /db/analytics.ts
  /auth.ts /auth.config.ts /authz.ts /session.ts
  /actions/*.ts                     # server actions, one file per domain (tickets, users, auth)
  /notifications/*.ts               # channel-agnostic dispatch: in-app + email + whatsapp stub
  /validators/*.ts                  # zod schemas
  /ticket-tabs.ts /ticket-state.ts /format.ts /roles.ts /attachments.ts /notification-sound.ts
/components
  /ui/*                             # shadcn primitives (dialog, checkbox, select, …)
  /tickets/* /dashboard/* /board/* /settings/* /profile/* /shell/*
/design-system.md                   # the locked visual spec + reusable design language
```

## 4. Data model (authoritative — mirrors `lib/db/schema.ts`)
Enums:
- `role`: USER | MIS_STAFF | MIS_ADMIN
- `department`: LINKD | LD_SILK_MILLS | VHAGAR | LD_COTTON_MILLS
- `status`: OPEN | IN_PROGRESS | RESOLVED | CLOSED | REOPENED
- `priority`: LOW | MEDIUM | HIGH | URGENT
- `ticket_activity.type` (stored as TEXT, TS-constrained — new kinds need no migration): CREATED | STATUS_CHANGED | ASSIGNED | CLAIMED | PRIORITY_CHANGED | COMMENTED | REOPENED | EDITED
- `notifications.type` (TEXT): NEW_TICKET | TICKET_RESOLVED | TICKET_ASSIGNED | TICKET_CLAIMED | TICKET_REOPENED | TICKET_CLOSED | TICKET_UPDATED | NEW_COMMENT

Tables:
- `users`: id (uuid), name, email (unique), email_verified, image, **password_hash (nullable — bcrypt; null = Google-only)**, role (default USER), **department (nullable)**, is_active (bool, default true), created_at. Auth.js adapter also owns `accounts`, `sessions`, `verification_tokens`.
- `tickets`: id (uuid), number (text, unique, e.g. "MIS-1001", from Postgres sequence `ticket_seq` starting at 1001 — never a row count), title, description, department (enum), sheet_link (nullable), status (enum, default OPEN), **priority (enum, NULLABLE — a raised ticket has NO priority; MIS sets it on claim; null renders "Unset")**, created_by (fk users.id), assigned_to (fk, nullable), resolved_at (nullable), resolved_by (fk, nullable), **deadline (timestamp, nullable — estimated resolution date set on claim)**, **deleted_at / deleted_by (nullable — soft delete / recycle bin)**, created_at, updated_at (`$onUpdate`). Indexes on status, assigned_to, created_by.
- `ticket_comments`: id, ticket_id (fk, cascade), author_id (fk), body, created_at. Index on ticket_id.
- `ticket_attachments`: id, ticket_id (fk, cascade), comment_id (fk, nullable), url (Vercel Blob), filename, content_type, size_bytes, uploaded_by (fk), created_at.
- `ticket_activity`: id, ticket_id (fk, cascade), actor_id (fk), type (see enum above), from_value (nullable), to_value (nullable), created_at. **Audit trail — write a row on EVERY mutation.** Index on ticket_id.
- `notifications`: id, user_id (fk, cascade), type (see enum), ticket_id (fk, nullable), ticket_number, title, body (nullable), read_at (nullable), created_at. One row per recipient per event. Index on user_id.

## 5. Ticket lifecycle (state machine)
OPEN → IN_PROGRESS → RESOLVED → CLOSED. From RESOLVED the reporter may reopen →
REOPENED (treated as active; behaves like IN_PROGRESS on the board).
- **Claim** (OPEN/REOPENED → IN_PROGRESS): an MIS member "claims" a ticket, which in one action **assigns it to them, sets priority + a deadline, moves it to IN_PROGRESS**, writes a CLAIMED activity row, and notifies the reporter. Every path that moves a ticket Open → In Progress (per-row Claim button, board drag, All-Tickets status dropdown, and **bulk claim**) goes through this claim flow — a bare status change must never leave it unassigned.
- Only the assignee/MIS may move to IN_PROGRESS/RESOLVED. Setting RESOLVED requires an assignee.
- **Confirm resolved**: when the reporter confirms the fix, the ticket goes to **CLOSED permanently** (the "Did this resolve your issue?" prompt does not reappear).
- Reopen is allowed only by the reporter or MIS_ADMIN. RESOLVED auto-CLOSES after 7 days if not reopened (spec'd; cron optional/stub).
- Allowed transitions live in `lib/ticket-state.ts` (`STATUS_TRANSITIONS` / `canTransition`); enforce them server-side.

## 6. Roles & permissions
| Action | USER | MIS_STAFF | MIS_ADMIN |
|---|---|---|---|
| Raise ticket | ✓ | ✓ | ✓ |
| See own tickets | ✓ | ✓ | ✓ |
| See all tickets / dashboard / board | ✗ | ✓ | ✓ |
| Claim / assign / change status / priority / deadline | ✗ | ✓ | ✓ |
| Bulk claim | ✗ | ✓ | ✓ |
| Take over a ticket assigned to someone else | ✗ | ✗ | ✓ |
| Comment on a ticket they can see | ✓ | ✓ | ✓ |
| Reopen own ticket / confirm resolved | ✓ | ✓ | ✓ |
| Soft-delete a ticket | ✗ | ✓ | ✓ |
| Recycle bin: restore / permanently delete | ✗ | ✗ | ✓ |
| Manage users / change roles / bulk-add users | ✗ | ✗ | ✓ |
Enforce on the server (in actions/queries), never trust the client. USER may only read tickets where `created_by = session.user.id`.

## 7. Auth rules
Google SSO **and** email + password. Google is first-class SSO; passwords are an
additional door (`bcryptjs` verify against `users.password_hash`). Restrict Google
sign-in to the company Workspace domain(s) via `ALLOWED_EMAIL_DOMAINS`. On first
Google sign-in, upsert a `users` row with role USER; emails in `ADMIN_EMAILS` get
MIS_ADMIN. Admins can create accounts with a password (bulk add); users can
set/change their own password in Profile. Session carries `id` and `role`
(extended session callback). Protect all `/(app)` routes with middleware;
unauthenticated → `/login`.

## 8. Notification contract
`/lib/notifications` is channel-agnostic: an internal `notify({to, template, data})`
dispatches to providers. **In-app** notifications are persisted (`notifications`
table) and shown in a topbar bell (unread badge + a Web-Audio chime with a mute
toggle; `AutoRefresh` polls every 15s to drive the badge/list). The **Resend email**
provider ships now; a `whatsappProvider` implements the same interface as a no-op
stub (wire real WhatsApp Business API later). Notification functions (all
best-effort — a failed send never rolls back or throws to the caller):
- `sendNewTicketNotification` — new ticket → in-app to the whole MIS team (triage).
- `sendClaimNotification` — claimed → reporter (priority + ETA/deadline), in-app + email.
- `sendAssignmentNotification` — assigned → assignee, in-app + email.
- `sendResolutionNotification` — RESOLVED/CLOSED → reporter ("please verify"), in-app + email.
- `sendReopenNotification` — reopened → assignee, in-app + email.
- `sendClosureNotification` — reporter confirmed → assignee ("closed for good"), in-app + email.
- `sendEditNotification` — reporter edited after work started → assignee, in-app only.
- `sendCommentNotification` — new comment → the other party, in-app only (email off by default).

## 9. Conventions
- All writes go through Server Actions in `/lib/actions`, validated with a matching zod schema in `/lib/validators`. Return typed results `{ ok: true, data } | { ok: false, error }` (`lib/actions/result.ts`).
- Every mutation writes a `ticket_activity` row (batched with the change via `db.batch`).
- Use `revalidatePath`/`revalidateTag` after mutations. Optimistic UI only on the Kanban drop.
- Ticket numbers come from the `ticket_seq` sequence — never computed from a row count.
- **Soft delete**: `deleted_at IS NULL` must be filtered from EVERY active ticket read (lists, detail, counts, analytics). Deleted tickets live only in the recycle bin.
- **Dates**: stored UTC. Tables/lists render **absolute time in a fixed timezone (IST)** via the deterministic `AbsoluteTime` component (no locale drift → no hydration mismatch); deadlines render as a plain IST date. Relative time ("2h ago") is used only for at-a-glance card metadata, never as a table's source of truth.
- **Best-effort side effects**: notifications and bulk operations never let one failure abort the rest or roll back the DB; log and continue.
- Env vars: `DATABASE_URL`, `AUTH_SECRET`, `AUTH_GOOGLE_ID`, `AUTH_GOOGLE_SECRET`, `ALLOWED_EMAIL_DOMAINS`, `ADMIN_EMAILS`, `BLOB_READ_WRITE_TOKEN`, `RESEND_API_KEY`, `EMAIL_FROM`, `NEXT_PUBLIC_APP_URL`.

## 10. Design & UI conventions
The visual system is locked in `design-system.md` (also a reusable design
language) — read it before any UI work. Load-bearing rules:
- One cobalt accent, reserved for actions + active state. Neutral everywhere else.
- **Readability first**: primary data text is foreground (near-black), not muted gray; table headers are black, semibold, 12px, uppercase, sticky. Muted is only for sub-labels, placeholders (`—`/"Unset"), and separators.
- Status/priority render as chips with a dot/icon + label (never color-only).
- Tables: zebra-free, hover wash, sticky header, mono for number/date columns, inline status/priority controls for staff, optional bulk-select checkbox column + selection action bar.
- Status sub-tabs (Open / In Progress / Resolved / Closed) with count badges; the active tab is an accent-soft pill.
- **Modals close only via the X / an explicit button** — backdrop click and Escape do NOT dismiss a form/detail modal (protects in-progress input); the image lightbox is the one opt-in exception.
- Motion: pick the 3–4 effects in `design-system.md §8` and reuse them; respect `prefers-reduced-motion`. One optional generative accent (login + empty states) — subtle, deterministic, reduced-motion aware.

## 11. How phases work
Prompts are labelled P0–P9. UI-only phases must not touch schema/API. Schema phases
must not touch styling. If a phase needs a new field or env var, STOP and ask before
adding it — then reflect it back into §2/§4/§9 here.
