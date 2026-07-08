# CLAUDE.md — MIS Ticketing System · Single Source of Truth

This file is the constitution. Every architectural decision, schema rule, and
convention lives here. Phase prompts inherit from this file — if a phase prompt
conflicts with CLAUDE.md, CLAUDE.md wins. Do not invent fields, routes, or
libraries that are not described here without flagging it first.

## 1. What we are building
An internal MIS support ticketing web app for a textile group (departments:
LINKD, LD SILK MILLS, VHAGAR, LD COTTON MILLS). Employees raise tickets for
system/sheet/app issues; the MIS team owns, works, and resolves them; the
reporter is notified on resolution and can confirm or reopen. Replaces a Google
Form + Sheet. Most issues reference a specific Google Sheet/AppSheet/Apps Script
artifact, so "Sheet Link" is a first-class field.

## 2. Non-negotiable stack
- Next.js 15 (App Router, Server Actions, Route Handlers), TypeScript strict.
- Neon PostgreSQL, Drizzle ORM (`drizzle-orm/neon-http` + `@neondatabase/serverless`), drizzle-kit for migrations.
- Auth.js v5 (`next-auth@beta`) + `@auth/drizzle-adapter`, Google provider only.
- Tailwind CSS + shadcn/ui + lucide-react icons.
- File storage: Vercel Blob (`@vercel/blob`).
- Email: Resend (`resend`).
- Kanban drag-drop: `@dnd-kit/core` + `@dnd-kit/sortable`.
- Toasts: `sonner`. Forms: `react-hook-form` + `zod`.
Do NOT use Prisma, do NOT use an ORM other than Drizzle, do NOT store files in the DB.

## 3. Folder structure
```
/app
  /(auth)/login/page.tsx
  /(app)/layout.tsx            # app shell: sidebar + topbar, session-gated
  /(app)/page.tsx              # role-aware home → redirects USER to /my, staff to /dashboard
  /(app)/my/page.tsx           # employee: my tickets
  /(app)/new/page.tsx          # raise a ticket
  /(app)/tickets/[number]/page.tsx  # ticket detail (shared)
  /(app)/dashboard/page.tsx    # MIS table view + KPI cards
  /(app)/board/page.tsx        # MIS Kanban view
  /api/auth/[...nextauth]/route.ts
  /api/upload/route.ts         # Vercel Blob client-upload token (if needed)
/lib
  /db/schema.ts /db/index.ts /db/queries.ts
  /auth.ts /auth.config.ts
  /actions/*.ts                # server actions, one file per domain
  /notifications/*.ts          # email + whatsapp interface
  /validators/*.ts             # zod schemas
/components
  /ui/*                        # shadcn
  /tickets/* /dashboard/* /board/* /shell/*
/design-system.md              # the locked visual spec — read before any UI work
```

## 4. Data model (authoritative)
Enums:
- `role`: USER | MIS_STAFF | MIS_ADMIN
- `department`: LINKD | LD_SILK_MILLS | VHAGAR | LD_COTTON_MILLS
- `status`: OPEN | IN_PROGRESS | RESOLVED | CLOSED | REOPENED
- `priority`: LOW | MEDIUM | HIGH | URGENT

Tables:
- `users`: id (uuid), name, email (unique), image, role (default USER), is_active (bool, default true), created_at. Auth.js adapter also needs accounts/sessions/verification_tokens tables — generate them via the drizzle adapter's standard schema.
- `tickets`: id (uuid), number (text, unique, e.g. "MIS-1001", generated from a Postgres sequence starting at 1001), title (text, short summary), description (text), department (enum), sheet_link (text, nullable), status (enum, default OPEN), priority (enum, default MEDIUM), created_by (fk users.id), assigned_to (fk users.id, nullable), resolved_at (timestamp, nullable), resolved_by (fk users.id, nullable), created_at, updated_at.
- `ticket_comments`: id, ticket_id (fk, cascade), author_id (fk users.id), body (text), created_at.
- `ticket_attachments`: id, ticket_id (fk, cascade), comment_id (fk, nullable), url (text, Vercel Blob), filename, content_type, size_bytes, uploaded_by (fk), created_at.
- `ticket_activity`: id, ticket_id (fk, cascade), actor_id (fk), type (text: CREATED|STATUS_CHANGED|ASSIGNED|PRIORITY_CHANGED|COMMENTED|REOPENED), from_value (text, nullable), to_value (text, nullable), created_at. This is the audit trail — write a row on EVERY mutation.

## 5. Ticket lifecycle (state machine)
OPEN → IN_PROGRESS → RESOLVED → CLOSED. From RESOLVED the reporter may reopen → REOPENED (treated as active, behaves like IN_PROGRESS in the board). Only assignee/MIS may move to IN_PROGRESS/RESOLVED; RESOLVED auto-CLOSES after 7 days if not reopened (spec the logic, cron optional/stub). Setting RESOLVED requires an assignee. Reopen is allowed only by the reporter or MIS_ADMIN.

## 6. Roles & permissions
| Action | USER | MIS_STAFF | MIS_ADMIN |
|---|---|---|---|
| Raise ticket | ✓ | ✓ | ✓ |
| See own tickets | ✓ | ✓ | ✓ |
| See all tickets / dashboard / board | ✗ | ✓ | ✓ |
| Assign / change status / priority | ✗ | ✓ | ✓ |
| Comment on a ticket they can see | ✓ | ✓ | ✓ |
| Reopen own ticket | ✓ | ✓ | ✓ |
| Manage users / change roles | ✗ | ✗ | ✓ |
Enforce on the server (in actions/queries), never trust the client. USER may only read tickets where `created_by = session.user.id`.

## 7. Auth rules
Google SSO only. Restrict sign-in to the company Google Workspace domain(s) via an env allowlist `ALLOWED_EMAIL_DOMAINS`. On first sign-in, upsert a `users` row with role USER. Bootstrap: emails in `ADMIN_EMAILS` env get MIS_ADMIN on upsert. Session must carry `id` and `role` (extend the session callback). Protect all `/(app)` routes with middleware; unauthenticated → `/login`.

## 8. Notification contract
`sendResolutionNotification(ticketId)` and `sendAssignmentNotification(ticketId)` live in `/lib/notifications`. They are channel-agnostic: an internal `notify({to, template, data})` dispatches to providers. Ship the Resend email provider now. Add a `whatsappProvider` that implements the same interface but is a no-op stub logging intent (wire real WhatsApp Business API later). Triggers:
- Status → RESOLVED or CLOSED → email the reporter ("Issue {number} resolved by {name}, please verify") + in-app.
- Ticket assigned → email the assignee + in-app.
- New comment → in-app for the other party (email optional, off by default).
All sends are best-effort: never let a failed notification roll back the DB mutation; log and continue.

## 9. Conventions
- All writes go through Server Actions in `/lib/actions`, validated with a matching zod schema in `/lib/validators`. Return typed results `{ ok: true, data } | { ok: false, error }`.
- Every mutation writes a `ticket_activity` row in the same transaction as the change.
- Use `revalidatePath`/`revalidateTag` after mutations. Optimistic UI only on the Kanban drop.
- Ticket numbers come from the Postgres sequence — never compute from row count.
- Dates stored UTC; format in the UI with the user's locale, show relative time ("2h ago") in lists.
- Env vars: `DATABASE_URL`, `AUTH_SECRET`, `AUTH_GOOGLE_ID`, `AUTH_GOOGLE_SECRET`, `ALLOWED_EMAIL_DOMAINS`, `ADMIN_EMAILS`, `BLOB_READ_WRITE_TOKEN`, `RESEND_API_KEY`, `EMAIL_FROM`, `NEXT_PUBLIC_APP_URL`.

## 10. Design
The visual system is locked in `design-system.md`. Read it before writing any UI.
Restraint rule: pick 3–4 motion effects and reuse them; do not layer many effects.
One single accent (cobalt). One optional generative accent (login + empty states) —
subtle, deterministic, reduced-motion aware. No mesh-gradient-everything, no glowing orbs.

## 11. How phases work
Prompts are labelled P0–P9. UI-only phases must not touch schema/API. Schema phases
must not touch styling. If a phase needs a new field or env var, STOP and ask before adding it.
