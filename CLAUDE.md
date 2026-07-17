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
- Dashboard charts: `recharts` (client components, styled with the design tokens). This is the chosen charting library — supersedes the earlier hand-built-SVG approach for the dashboard; see §10.
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
  /(app)/settings/page.tsx          # admin: Settings landing (cards → the 3 tools below)
  /(app)/settings/users/page.tsx    # admin: user management + bulk add
  /(app)/settings/bulk-delete/page.tsx # admin: multi-select active tickets → soft-delete
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
- `ticket_activity.type` (stored as TEXT, TS-constrained — new kinds need no migration): CREATED | STATUS_CHANGED | ASSIGNED | CLAIMED | UNCLAIMED | STARTED | PRIORITY_CHANGED | COMMENTED | REOPENED | EDITED
- `notifications.type` (TEXT): NEW_TICKET | TICKET_RESOLVED | TICKET_ASSIGNED | TICKET_CLAIMED | TICKET_REOPENED | TICKET_CLOSED | TICKET_UPDATED | NEW_COMMENT

Tables:
- `users`: id (uuid), name, email (unique), email_verified, image, **password_hash (nullable — bcrypt; null = Google-only)**, role (default USER), **department (nullable)**, is_active (bool, default true), created_at. Auth.js adapter also owns `accounts`, `sessions`, `verification_tokens`.
- `tickets`: id (uuid), number (text, unique, e.g. "MIS-001" — zero-padded to 3 digits via `lpad(nextval('ticket_seq'), 3, '0')`, never a row count), title, description, department (enum), sheet_link (nullable), status (enum, default OPEN), **priority (enum, NULLABLE — a raised ticket has NO priority; MIS sets it on claim; null renders "Unset")**, created_by (fk users.id), assigned_to (fk, nullable), resolved_at (nullable), resolved_by (fk, nullable), **deadline (timestamp, nullable — estimated resolution date set on claim)**, **deleted_at / deleted_by (nullable — soft delete / recycle bin)**, created_at, updated_at (`$onUpdate`). Indexes on status, assigned_to, created_by.
- `ticket_comments`: id, ticket_id (fk, cascade), author_id (fk), body, created_at. Index on ticket_id.
- `ticket_attachments`: id, ticket_id (fk, cascade), comment_id (fk, nullable), url (Vercel Blob), filename, content_type, size_bytes, uploaded_by (fk), created_at.
- `ticket_activity`: id, ticket_id (fk, cascade), actor_id (fk), type (see enum above), from_value (nullable), to_value (nullable), created_at. **Audit trail — write a row on EVERY mutation.** Index on ticket_id.
- `notifications`: id, user_id (fk, cascade), type (see enum), ticket_id (fk, nullable), ticket_number, title, body (nullable), read_at (nullable), created_at. One row per recipient per event. Index on user_id.

## 5. Ticket lifecycle (state machine)
OPEN → IN_PROGRESS → RESOLVED → CLOSED. From RESOLVED the reporter may reopen →
REOPENED (treated as active; behaves like IN_PROGRESS on the board). **Claiming
and starting are two distinct steps** — a claimed ticket stays OPEN until it is
explicitly started.
- **Claim** (`claimTicket`): an MIS member takes ownership — **assigns the ticket to themselves and sets a priority**. It **stays OPEN** (NOT started/In Progress) and appears under "Assigned to Me". Writes a CLAIMED activity row. No deadline yet; the reporter is not notified (§8). The per-row Claim button, the detail action bar, and **bulk claim** all do this claim-only step. Never steals a ticket already claimed by someone else (§6).
- **Release / undo a claim** (`releaseTicket`): a mis-claim escape hatch — the assignee sends a ticket they claimed by mistake **back to the open pool**. Clears the assignee, priority, and deadline; the ticket **stays OPEN** and is claimable again. Writes an UNCLAIMED activity row. **Assignee-locked** — even an MIS_ADMIN may release only a ticket assigned to themselves, never someone else's claim (§6). Allowed **only on a claimed-but-not-started ticket (OPEN)**: once started, the reporter has already been notified, so it's no longer a quiet undo. No notification is sent (a plain claim is quiet per §8, so releasing it is too).
- **Start task** (`startTask`, OPEN/REOPENED → IN_PROGRESS): when the assignee is ready to begin, they Start the task — **required to set a deadline** (expected completion date). This moves it to IN_PROGRESS ("officially started"), writes a STARTED activity row (deadline in `to_value`), and **notifies the reporter** (priority + ETA; §8). Only the assignee may start their own claimed ticket.
- **Combined "claim & start" shortcut**: dragging/moving an **unassigned** ticket straight to In Progress (Kanban drag, All-Tickets status dropdown, mobile move) does both at once — `claimTicket` with a deadline claims + starts in one step. A bare status change must never leave a ticket unassigned; starting always needs an assignee + a deadline. `updateStatus` therefore **refuses OPEN → IN_PROGRESS** — that path goes through `startTask`.
- Only the assignee/MIS may move to IN_PROGRESS/RESOLVED. Setting RESOLVED requires an assignee.
- **Confirm resolved**: when the reporter confirms the fix, the ticket goes to **CLOSED permanently** (the "Did this resolve your issue?" prompt does not reappear).
- Reopen is allowed only by the reporter or MIS_ADMIN. RESOLVED auto-CLOSES after 7 days if not reopened (spec'd; cron optional/stub).
- Allowed transitions live in `lib/ticket-state.ts` (`STATUS_TRANSITIONS` / `canTransition`); enforce them server-side. (OPEN → IN_PROGRESS is listed so the UI can offer it, but it's performed by `startTask`, never `updateStatus`.)

## 6. Roles & permissions
| Action | USER | MIS_STAFF | MIS_ADMIN |
|---|---|---|---|
| Raise ticket | ✓ | ✓ | ✓ |
| See own tickets | ✓ | ✓ | ✓ |
| See all tickets / dashboard / board | ✗ | ✓ | ✓ |
| Claim (assign to self + priority; stays Open) | ✗ | ✓ | ✓ |
| Start task (set deadline; Open → In Progress) — own claimed ticket | ✗ | ✓ | ✓ |
| Release own claim (Open-only; back to unclaimed Open) — own claimed ticket | ✗ | ✓ | ✓ |
| Change status / priority | ✗ | ✓ | ✓ |
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
- `sendClaimNotification` — **work started** → reporter (priority + ETA/deadline), in-app + email. Fired on **Start task** (or the combined claim & start), NOT on a plain claim — a claim that hasn't started yet is quiet.
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
- **Dashboard charts** use `recharts` (§2), not hand-built SVG — this supersedes design-system.md §10's hand-built-SVG default for the dashboard. The data-viz *rules* still hold: one shared axis (never dual-axis), colour from the design tokens only (cobalt accent + status/priority tokens, never raw hex), identity beyond colour (legend / direct labels), mono numerals, one card radius/shadow, a per-chart **skeleton + empty state**, and `prefers-reduced-motion` honoured (disable chart animation). The dashboard shows exactly six charts (created-vs-resolved area, status donut, department bar, priority-by-week stacked bar, avg-resolution line, aging columns) plus a sparkline per KPI card. Chart series are **derived in the page from existing queries** — charts never add schema/queries/actions. (`components/dashboard/flow-chart.tsx` remains the hand-built-SVG reference for anything outside the dashboard.)

## 11. How phases work
Prompts are labelled P0–P9. UI-only phases must not touch schema/API. Schema phases
must not touch styling. If a phase needs a new field or env var, STOP and ask before
adding it — then reflect it back into §2/§4/§9 here.

## 12. Two ticket types (AMENDS §4, §5, §6; EXTENDS §8)

ONE unified ticket model with two types.
- **ISSUE** — something is broken (the original support ticket). Uses the EXISTING
  live MIS- issue sequence and format — do not change it, do not renumber existing
  tickets.
- **REQUEST** — "build me a new system" (Purchase, Sales, HRMS, …). Gets its OWN
  separate sequence (REQ-), formatted to match the live issue format.

Both types share: users, comments, attachments, activity log, notifications, roles,
the detail-page shell, and the app shell. Do NOT create a parallel table set.
`tickets` gains `type` (ISSUE|REQUEST, default ISSUE); its number is drawn from the
issue sequence (ISSUE) or the request sequence (REQUEST). `status` is a single enum
holding BOTH state sets; the machine applied is chosen by `type`; a status from the
wrong type's set is rejected server-side.

**Numbering (as built).** Both zero-pad to 3, matching the live issue format:
- ISSUE → `'MIS-' || lpad(nextval('ticket_seq'), 3, '0')` → live rows read MIS-001…
  `ticket_seq` is declared `START WITH 1001` but the live sequence dispenses 1,2,3…
  Leave it alone: reconciling it would change live ISSUE numbering.
- REQUEST → `'REQ-' || lpad(nextval('request_seq'), 3, '0')` → REQ-001, REQ-002, …
  `request_seq` **starts at 1**.
Numbers are never computed from a row count.

> **KNOWN ISSUE — numbering ceiling (`docs/known-issues/0001`).** Postgres `lpad`
> TRUNCATES past the pad width (`lpad('1000',3,'0')` → `'100'`), so BOTH sequences
> collide on the `tickets.number` unique index once they pass 999. Pre-existing for
> ISSUE; the same shape for REQUEST. **Tracked, not fixed** — needs a dedicated fix
> before either count approaches ~900. A corollary: `lib/db/seed.ts` deliberately
> keeps the UN-padded `'MIS-' || nextval('ticket_seq')`, because on a fresh database
> `ticket_seq` starts at its declared 1001 and a padded seed emits MIS-100 twice.

### 12.1 Enums
- `role`: **UNCHANGED** — USER | MIS_STAFF | MIS_ADMIN. **THERE IS NO MD ROLE.** Do
  not add one, and do not add any MD env var. (Note: `MIS_STAFF` is retired from the
  admin role picker — the MIS team is `MIS_ADMIN` — so the staff/admin split in §12.4
  is enforced in code but nominal in practice.)
- request states (added to the `status` enum): SUBMITTED | UNDER_REVIEW |
  PENDING_MD_APPROVAL | APPROVED | DROPPED | CLAIMED | IN_PROGRESS | IN_TESTING |
  CHANGES_REQUESTED | CLOSED. (PENDING_MD_APPROVAL = waiting for the MD's verdict to
  be RECORDED BY AN MIS_ADMIN; **the MD never logs in**.) IN_PROGRESS and CLOSED are
  shared with the ISSUE set — which is exactly why the machine must be type-aware.
- `ticket_type`: ISSUE | REQUEST (default ISSUE).
- `md_decision`: PENDING | APPROVED | REJECTED (default PENDING).
- `progress_log_type`: UPDATE | REVIEW_SESSION | BLOCKER
- `activity.type` gains: SUBMITTED, MOVED_TO_REVIEW, SENT_FOR_APPROVAL,
  APPROVAL_RECORDED, REJECTION_RECORDED, DROPPED, REVIVED, CLAIMED, DEADLINE_SET,
  PROGRESS_LOGGED, MARKED_COMPLETE, CHANGES_REQUESTED, ACCEPTED

### 12.2 New tables
- `request_details` (1:1 with REQUEST tickets): ticket_id (pk, fk cascade),
  system_name, problem_statement, current_process (nullable), current_sheet_link
  (nullable), intended_users, expected_benefit,
  md_decision (enum, default PENDING), **md_decision_recorded_by**
  (fk users.id, nullable — the MIS_ADMIN who ticked on the MD's behalf; defaults to the
  acting admin), md_decided_at (nullable), md_remark (text, nullable — **OPTIONAL even
  on reject**), claimed_by (fk users.id, nullable), claimed_at (nullable), **deadline
  (date, nullable)**, revision_round (int default 0), completed_at (nullable),
  accepted_at (nullable). **There is NO `md_decided_by` column** — the recorder IS the
  accountability record. **There is also NO `urgency` / `target_date`**: a request
  mirrors an issue (§5) — the requester states the need, MIS sets `tickets.priority`
  on claim, and `deadline` is committed at start-work. The requester never
  self-assigns a priority or a date.
- `progress_logs`: id, ticket_id (fk cascade), author_id (fk), type
  (progress_log_type), body (text), percent_complete (int 0-100, nullable),
  created_at. Index on ticket_id.

### 12.3 REQUEST state machine
SUBMITTED → UNDER_REVIEW (MIS_STAFF/ADMIN; internal discussion happens as comments)
→ PENDING_MD_APPROVAL (MIS sends it up) → APPROVED or DROPPED.
The APPROVED/DROPPED verdict is RECORDED BY AN MIS_ADMIN on the MD's behalf (writes
md_decision, md_decision_recorded_by, md_decided_at, optional md_remark).
APPROVED → CLAIMED (an MIS member self-claims: sets assigned_to + **priority**; no
date yet) → IN_PROGRESS (`startWork` — the assignee **commits to the delivery
`deadline` here**, and the requester is told) → IN_TESTING (MIS marks complete) →
CLOSED (requester accepts) OR
CHANGES_REQUESTED (requester unsatisfied; revision_round += 1) → IN_PROGRESS (loops,
uncapped). DROPPED → UNDER_REVIEW (MIS_ADMIN revive only). Any other transition is
illegal and rejected server-side.

**Release / undo a claim** (`releaseRequest`, CLAIMED → APPROVED): the mis-claim
escape hatch, mirroring the ISSUE release (§5). The assignee sends a build they
claimed by mistake **back to the approved pool** — clears assigned_to, priority,
claimed_by/claimed_at and any deadline, so it looks exactly as it did on approval and
is claimable again. Writes an UNCLAIMED activity row. **Assignee-locked** — even an
MIS_ADMIN may release only a build assigned to themselves, never someone else's claim
(deliberately stricter than the build steps: an admin may work anyone's build, but
taking one off a colleague is a takeover, not an undo). Allowed **only while CLAIMED**:
once started, a delivery date has been promised to the requester, so it's no longer a
quiet correction. **Unlike an ISSUE release, this one notifies** — the claim already
told the requester someone picked it up (§12.6), so silence would leave them believing
a build is under way that nobody owns.

### 12.4 REQUEST permissions
| Action | Requester (USER) | MIS_STAFF | MIS_ADMIN |
|---|---|---|---|
| Submit a request | yes | yes | yes |
| See own requests | yes | yes | yes |
| See all requests | no | yes | yes |
| Move to review / send for approval | no | yes | yes |
| Record approval/rejection (on MD's behalf) | no | no | yes |
| Revive a DROPPED request | no | no | yes |
| Claim + set priority + deadline | no | yes | yes |
| Release own claim (Claimed-only; back to the approved pool) | no | yes (assignee) | yes (own claim only) |
| Change an in-flight deadline | no | yes (assignee) | yes |
| Add progress log | no | yes (assignee) | yes |
| Mark complete (→ IN_TESTING) | no | yes (assignee) | yes |
| Request changes (→ CHANGES_REQUESTED) | yes (requester only) | no | yes |
| Accept & close | yes (requester only) | no | no |
| Comment | yes | yes | yes |

MIS may NEVER force-close a request. Only the requester's acceptance closes it.

### 12.5 Full auditability (hard requirement)
Every transition, claim, approval/rejection record, deadline change, progress log,
comment, and attachment writes a `ticket_activity` row (actor_id, from_value,
to_value, created_at) in the SAME `db.batch` as the change. The recorded-by admin +
timestamp on the approval decision IS the accountability record for the MD formality.
`revision_round` is the source of truth for how many times a request came back; each
increment is also an activity row, so every attempt is timestamped.

### 12.6 REQUEST notifications (reuse the existing `notify()` dispatcher)
- REQUEST_SUBMITTED → MIS team
- REQUEST_PENDING_APPROVAL → MIS_ADMINs (they record the decision)
- REQUEST_DECISION_RECORDED → requester + MIS team (approved or dropped; include the
  remark when present)
- REQUEST_CLAIMED → requester ("{member} has picked up {number}"; the date follows at
  start-work, so a claim promises no ETA)
- **REQUEST_RELEASED → requester** (the claim was undone — "{number} is back in the
  queue, still approved"). A release is NOT silent, precisely because the claim wasn't:
  leaving the "picked up" notice standing would misinform the requester.
- **REQUEST_DEADLINE_CHANGED → requester** (the assignee moved an in-flight delivery
  date — a deadline change is never silent)
- REQUEST_PROGRESS → requester (in-app by default)
- REQUEST_READY_FOR_TESTING → requester
- REQUEST_CHANGES_REQUESTED → assignee
- REQUEST_ACCEPTED → assignee + MIS team

Best-effort; a failed send must never roll back the DB mutation. Currently in-app
only — the Resend email templates for these are not built yet.

### 12.7 Routing (Hybrid)
- **Shared, type-aware detail:** `/tickets/[number]` renders BOTH types, branching on
  `type` to show issue vs request panels. One route, one deep-link pattern, used by
  every notification link.
- **Separate request surfaces:** a **single** "Request a system" nav entry → `/requests`
  (the REQUEST-only list), plus `/requests/new` (the intake form), which is reached
  from the list's header button + empty-state CTA and needs no nav entry of its own.
  Issues keep /new ("Report an issue"), /my, /dashboard, and the issue board unchanged.
- USER row-level visibility still applies: a USER sees only requests where
  `created_by` = their id.
- The request detail shows, in order: the journey strip (Submitted → Review → Approval
  → Claimed → In progress → Testing → Closed), the claim/build panel, the brief, the
  **Progress** section, then the **Conversation**. **Progress logs (structured MIS
  records) and comments (free conversation) are separate concepts — never merge them.**

### 12.8 Enforcement (as built)
- `lib/ticket-state.ts` is the single source of truth and is unit-tested
  (`lib/ticket-state.test.ts`):
  - `assertStatusForType(type, status)` — throws on a status from the other type's set;
    called by the status writers.
  - `canTransition(type, from, to, actorRole, isRequester, isAssignee)` — §12.3 topology
    AND §12.4 permissions. Every request action gates on it (via one `allows()` helper),
    so the tests protect production. (A legacy `canTransition(from, to, type?)` overload
    remains for the issue board's topology-only check.)
- **Type isolation:** the ISSUE actions reject REQUEST ids, and every issue
  list/count/analytics query filters `type = 'ISSUE'` — otherwise requests leak into
  the issue lists/dashboard, and MIS could force-close a request through the ISSUE
  machine (IN_PROGRESS is shared). `getTicketById` is deliberately NOT type-filtered —
  the request actions call it and then check `type` themselves.
