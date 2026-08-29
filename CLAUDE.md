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
- File storage: Vercel Blob (`@vercel/blob`) — client-upload token flow. **Voice notes**
  use no extra service: the browser's own `MediaRecorder` (webm/opus, mp4 on Safari,
  5-min cap) uploads through the same flow and is stored as an ordinary
  `ticket_attachments` row (§5.1). Unsupported/insecure-origin browsers hide the
  recorder — typing always works.
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
  /(app)/page.tsx                   # home → everyone redirects to /dashboard (role-aware view)
  /(app)/my/page.tsx                # "My Tickets" (employee) / "Assigned to Me" (staff)
  /(app)/new/page.tsx               # raise a ticket
  /(app)/tickets/page.tsx           # MIS: All Tickets table (status tabs, bulk claim)
  /(app)/tickets/[number]/page.tsx  # ticket detail (shared, deep-link/fallback)
  /(app)/dashboard/page.tsx         # landing for ALL: staff = KPI+charts (issue/request); USER = own-tickets view (EmployeeDashboard)
  /(app)/board/page.tsx             # MIS: Kanban
  /(app)/profile/page.tsx           # edit name/department + set/change password
  /(app)/settings/page.tsx          # admin: Settings landing (cards → the tools below)
  /(app)/settings/access-requests/page.tsx # admin: approve/reject Google request-to-join (§7)
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
- `ticket_activity.type` (stored as TEXT, TS-constrained — new kinds need no migration): CREATED | STATUS_CHANGED | ASSIGNED | CLAIMED | UNCLAIMED | STARTED | PRIORITY_CHANGED | COMMENTED | REOPENED | EDITED | MOVED (§12.9) | **AUTO_CLOSED** (§5, actor = SYSTEM) | **COMPLETION_DATED** (§5.2 — an issue resolved / a build marked complete, dated to a day other than today; from_value = when it was recorded, to_value = the date recorded) | **START_DATED** / **CLAIM_DATED** (§5.3 — work started / a ticket claimed, dated to a day other than today; same from/to shape, both modules)
- `notifications.type` (TEXT): NEW_TICKET | TICKET_RESOLVED | TICKET_ASSIGNED | TICKET_CLAIMED | TICKET_REOPENED | TICKET_CLOSED | TICKET_UPDATED | NEW_COMMENT | …REQUEST_* (§12.6) | ACCESS_REQUESTED (→ admins) | ACCESS_APPROVED (→ the new user) | **TICKET_AUTO_CLOSED** (§5 → the reporter)
- `access_request_status`: PENDING | APPROVED | REJECTED (§7)

Tables:
- `users`: id (uuid), name, email (unique), email_verified, image, **password_hash (nullable — bcrypt; null = Google-only)**, role (default USER), **department (nullable)**, is_active (bool, default true), created_at. Auth.js adapter also owns `accounts`, `sessions`, `verification_tokens`.
- `tickets`: id (uuid), number (text, unique, e.g. "MIS-001" — zero-padded to 3 digits via `lpad(nextval('ticket_seq'), 3, '0')`, never a row count), title, description, department (enum), sheet_link (nullable), status (enum, default OPEN), **priority (enum, NULLABLE — a raised ticket has NO priority; MIS sets it on claim; null renders "Unset")**, created_by (fk users.id), assigned_to (fk, nullable), resolved_at (nullable), resolved_by (fk, nullable), **auto_closed_at (timestamp, nullable — set when the SYSTEM auto-closes it (§5); marks the close as reopenable, vs a permanent manual confirm)**, **claimed_at / started_at (timestamps, nullable — the DAYS the ticket was claimed and work began, §5.3; picked by MIS, cleared by a release)**, **deadline (timestamp, nullable — estimated resolution date set on claim)**, **deleted_at / deleted_by (nullable — soft delete / recycle bin)**, created_at, updated_at (`$onUpdate`). Indexes on status, assigned_to, created_by.
- `ticket_comments`: id, ticket_id (fk, cascade), author_id (fk), body, created_at. Index on ticket_id.
- `ticket_attachments`: id, ticket_id (fk, cascade), comment_id (fk, nullable), url (Vercel Blob), filename, content_type, size_bytes, uploaded_by (fk), created_at.
- `ticket_activity`: id, ticket_id (fk, cascade), actor_id (fk), type (see enum above), from_value (nullable), to_value (nullable), created_at. **Audit trail — write a row on EVERY mutation.** Index on ticket_id.
- `notifications`: id, user_id (fk, cascade), type (see enum), ticket_id (fk, nullable), ticket_number (nullable), title, body (nullable), read_at (nullable), created_at. One row per recipient per event. Index on user_id. (ACCESS_* notifications have null ticket_id/ticket_number — they aren't about a ticket.)
- `access_requests` (§7): id (uuid), email (unique), name (nullable), image (nullable), status (`access_request_status`, default PENDING), requested_at, **decided_by (fk users.id, nullable), decided_at (nullable)** — the accountability trail, **created_user_id (fk users.id, nullable — the account an approval minted; no cascade, so deleting the user keeps the audit)**. Index on status. Written by a refused Google sign-in (grants nothing); the `users` row is minted only by an MIS_ADMIN approval.

## 5. Ticket lifecycle (state machine)
OPEN → IN_PROGRESS → RESOLVED → CLOSED. From RESOLVED the reporter may reopen →
REOPENED (treated as active; behaves like IN_PROGRESS on the board). **Claiming
and starting are two distinct steps** — a claimed ticket stays OPEN until it is
explicitly started.
- **Claim** (`claimTicket`): an MIS member takes ownership — **assigns the ticket to themselves and sets a priority**. It **stays OPEN** (NOT started/In Progress) and appears under "Assigned to Me". Writes a CLAIMED activity row. No deadline yet; the reporter is not notified (§8). The per-row Claim button, the detail action bar, and **bulk claim** all do this claim-only step. Never steals a ticket already claimed by someone else (§6).
- **Release / undo a claim** (`releaseTicket`): the mis-claim AND mis-start escape hatch — the assignee sends a ticket back to the **open pool**. Clears the assignee, priority and deadline, and forces the status back to **OPEN**; it is claimable again. Writes an UNCLAIMED activity row carrying the status it left (so the timeline distinguishes "never started" from "abandoned mid-work"). **Assignee-locked** — even an MIS_ADMIN may release only a ticket assigned to themselves, never someone else's claim (§6). Allowed from **OPEN, IN_PROGRESS and REOPENED**; never from RESOLVED/CLOSED, where the reporter is mid-verification. Gated by `canReleaseTicket` in `lib/ticket-state.ts` — one unit-tested predicate shared by the action and the button.
  - **Notification is conditional, and the rule decides — not the status.** Releasing from OPEN is **silent**: the claim was silent (§8), so nothing needs correcting. Releasing from IN_PROGRESS/REOPENED **notifies the reporter** (`sendTicketReleasedNotification`, in-app + email): starting told them "work has started, expected by {date}", and abandoning it makes that false. `releaseNeedsNotice(status)` encodes exactly that. This is §12.6's reversal rule applied to issues.
  > §5 originally forbade release once started, reasoning that the reporter had already been told so it was "no longer a quiet undo". The premise was right and the conclusion was backwards: the answer to "an announcement would be falsified" is to **announce the reversal**, not to ban it. Forbidding it left a mis-started ticket with **no exit but "Mark resolved"** — resolving work nobody did, then asking the reporter to confirm a fix that doesn't exist. Issues also forbade the very undo requests permit (§12.3), for no reason other than the rule not having been applied here yet.
- **Start task** (`startTask`, OPEN/REOPENED → IN_PROGRESS): when the assignee is ready to begin, they Start the task — collecting a **start date (§5.3, defaulted to today, any date allowed)** and an **OPTIONAL deadline** (expected completion date).
  > **The deadline used to be required, and that was wrong.** MIS often begins work before
  > they can honestly commit to a finish date, and a required field does not produce
  > commitment — it produces invented dates, which are worse than none because the reporter
  > is TOLD them (§8). It is now optional in `startTaskSchema`, in `startTaskRow`
  > (`deadline: Date | null`, and a start never overwrites an existing date with null), on
  > the STARTED activity row (`to_value` null reads as "started" with no "due by"), and in
  > all three dialogs. The reporter's notice already degraded correctly — "Work has
  > started." without the ETA clause. A date can still be set, and is still announced.
  >
  > **Consequence for the combined "claim & start" shortcut:** it used to be inferred from
  > the presence of a deadline (`startWork = !!deadline`), which stops working the moment a
  > start can legitimately have none. `claimTicketSchema` now carries an explicit `start`
  > flag, which `ClaimDialog` sets whenever `withStart` is on. This moves it to IN_PROGRESS ("officially started"), writes a STARTED activity row (deadline in `to_value`), and **notifies the reporter** (priority + ETA; §8). Only the assignee may start their own claimed ticket.
- **Combined "claim & start" shortcut**: dragging/moving an **unassigned** ticket straight to In Progress (Kanban drag, All-Tickets status dropdown, mobile move) does both at once — `claimTicket` with a deadline claims + starts in one step. A bare status change must never leave a ticket unassigned; starting always needs an assignee + a deadline. `updateStatus` therefore **refuses OPEN → IN_PROGRESS** — that path goes through `startTask`.
- Only the assignee/MIS may move to IN_PROGRESS. Setting RESOLVED requires an assignee.
- **Resolving is MIS_ADMIN-only, and only their own claimed ticket** — `canResolveIssue`
  (`lib/ticket-state.ts`, unit-tested, shared by the action and every surface that offers
  the move). Deliberately narrower than claim / start / release, which stay open to
  MIS_STAFF: declaring an issue fixed is what the reporter is asked to verify and what
  every resolution-time metric is computed from. See §6 for the consequence.
- **Mark resolved asks WHEN (§5.2).** Resolving opens `ResolveDialog`, which collects the
  IST calendar **day** the work actually finished (`updateStatus(id,"RESOLVED",resolvedOn)`),
  defaulted to today and accepting **any** date. MIS commonly fixes something and records it
  days later; that day is what `tickets.resolved_at` should hold.
- **Confirm resolved**: when the reporter confirms the fix, the ticket goes to **CLOSED permanently** (the "Did this resolve your issue?" prompt does not reappear).
- Reopen is allowed only by the reporter or MIS_ADMIN.
- **Auto-close (as built).** A RESOLVED issue the reporter never confirms auto-CLOSES
  after **`AUTO_CLOSE_DAYS` = 8** (the reporter's grace window; requests auto-close the
  same way from IN_TESTING — see §12.4). A daily **Vercel Cron** (`vercel.json` →
  `/api/cron/auto-close`, guarded by `CRON_SECRET`) runs `autoCloseStaleTickets()`:
  eligible = RESOLVED/IN_TESTING with `resolved_at`/`completed_at` older than the window.
  Each close stamps **`tickets.auto_closed_at`**, writes an `AUTO_CLOSED` activity row
  authored by the **SYSTEM** user placeholder (so `actor_id` has a truthful owner for an
  action no human took), and notifies the reporter (in-app + email, type-aware wording —
  "resolved" for an issue, "accepted on your behalf" for a request).
  - **Auto-close is reversible.** `auto_closed_at` is the marker that distinguishes it
    from a manual confirm/accept (which never sets it and stays permanent): the reporter
    (or admin) may still **reopen** an auto-closed ticket — an ISSUE → REOPENED, a
    REQUEST → IN_TESTING (back at the UAT gate). Reopen clears `auto_closed_at`.
  - Degrades safe: with `CRON_SECRET` unset the endpoint refuses (401), so nothing
    auto-closes until it's configured.
- Allowed transitions live in `lib/ticket-state.ts` (`STATUS_TRANSITIONS` / `canTransition`); enforce them server-side. (OPEN → IN_PROGRESS is listed so the UI can offer it, but it's performed by `startTask`, never `updateStatus`.)

### 5.1 ISSUE intake — what "Raise a Ticket" requires (`NewTicketForm`)
Four requirements, and they are **independent checks that must never be pooled into
one count**:
1. **Subject** — required, min 4 chars (zod, `createTicketSchema`).
2. **Sheet link / System** — required, min 1 char. Deliberately NOT url-validated: a
   link **or** just the system's name ("Data entry Interface") is accepted (§13.6).
3. **Describe the problem — typed text OR a voice note.** Either one alone is enough.
   The recorder is an accessibility feature for people who would rather speak than
   type; it is **never required, and never required *alongside* text**. A voice-only
   ticket is stored with the placeholder body "🎤 Voice note attached — please listen
   to the recording below." so MIS knows to play the audio.
4. **At least one file attachment (screenshot/PDF) — mandatory.** A **voice note does
   NOT satisfy this**; only a real file does.

`description` is therefore `z.string().trim().max(5000)` with **no `min`** in both
`createTicketSchema` and `editTicketSchema` — a voice-only ticket has no typed body and
must stay valid AND editable later. Requirement 3 is a hand-written check in the form,
not a zod rule, because it spans a form field and a piece of component state.

> **Why "never pooled" is load-bearing.** The form used to build
> `allAttachments = [...attachments, voiceNote]` and require `length > 0` as a single
> gate. That one line broke both rules at once, in both directions: a voice note
> satisfied the mandatory-file requirement, and a screenshot satisfied the
> describe-the-problem requirement. `allAttachments` still exists — it is what gets
> written via `attachTo` — but it is used **only for the upload**, never for validation.
> Validate `attachments.length` (files) and `hasText || voiceNote` (description)
> separately.

Both failures are reported together, inline on the field that is missing (`setError` on
the textarea, a `fileError` state under the dropzone — the dropzone is not a
react-hook-form field), plus one combined toast. Each clears as soon as it is satisfied.

> **These are CLIENT-side gates.** `createTicket` cannot enforce requirement 4:
> attachments are written by `attachTo` *after* the ticket row exists, so there is no
> point at which the server can see "this ticket has ≥1 file". A ticket created through
> the action directly can have no attachment — accepted, and the reason the rule lives
> in the form. Requirements 1 and 2 ARE server-enforced by zod (§9).

### 5.2 Completion date — "Mark resolved" / "Mark complete" record the DAY the work finished
Both modules ask WHEN, not just THAT. Resolving an ISSUE goes through **`ResolveDialog`**
(`updateStatus(id, "RESOLVED", resolvedOn)`); marking a REQUEST build complete goes through
**`CompleteDialog`** (`markComplete({ticketId, note, completedOn})`), which collects the date
alongside the handover note. Both take a `"YYYY-MM-DD"` IST **calendar day**, never a
timestamp, and both **default to today** — so the ordinary case is one extra click. The field
exists for the common other case: MIS fixes something (or delivers a build) on Tuesday and
only gets round to recording it on Thursday. Recording Thursday overstates the work in every
dashboard average (§10) — `resolved_at − created_at` for issues, `completed_at − claimed_at`
in the Team performance report — and tells the reporter the wrong story.

**ANY date is accepted — past or future.** `completionDateFor(dayKey, now)` in
`lib/ticket-state.ts` (pure, unit-tested, shared by both actions and both dialogs, so UI and
server always agree) refuses ONLY a string that isn't a calendar day — `"2026-02-31"`,
`"yesterday"`. The date inputs carry no `min`/`max` for the same reason.

> **This deliberately removed two bounds** that the first implementation enforced — not in
> the future, not before the ticket was raised — each of which described an impossible
> history. **The risk they guarded is real and now live: a future or pre-creation date will
> skew the resolution-time averages and the created-vs-resolved chart** (§10), and nothing
> stops it. It was removed anyway, by product decision, because MIS needs to record dates the
> bounds refused (a fix agreed before the ticket was filed; a delivery dated to an agreed
> future hand-over). Accuracy of the record beat tidiness of the averages, and the audit row
> below is what keeps it honest. **Do not re-add the bounds without raising it** — their
> absence is a decision, not an oversight.

The stored instant is the **END of the picked IST day**, except today, which collapses to
`now()` (exactly what an undated completion has always stored). End-of-day, not midnight —
**midnight would land before the ticket's own `created_at`** when the work and the report
share a day, making the duration negative in the very averages above. IST day↔instant
conversion lives in `istDayKey` / `istDayEnd` (`lib/format.ts`): IST is a fixed +05:30, so it
is arithmetic, but two traps are handled there — reading the day in UTC would refuse "today"
for anyone working before 05:30 IST, and `Date.parse` SILENTLY ROLLS OVER an out-of-range day
(`"2026-02-31"` → 3 Mar), so `istDayEnd` round-trips the parse and rejects a mismatch.

**A date other than today is audited (§12.5)**: a `COMPLETION_DATED` activity row is written
in the SAME `db.batch` — `from_value` = when it was recorded, `to_value` = the date recorded.
ONE activity type serves both modules (each timeline words it for its own vocabulary:
"dated the resolution" / "dated the completion"). Required because the STATUS_CHANGED /
MARKED_COMPLETE row cannot show it: its `created_at` says today while `resolved_at` /
`completed_at` says last week, with nothing linking the two or naming who chose the date.
Picking today writes no such row — nothing was moved.

**Every resolve path goes through the dialog** — the detail action bar, the All-Tickets /
My-Tickets status dropdown ("Mark resolved…"), the mobile board move, and a **board drag into
Resolved** (which opens the dialog instead of moving optimistically; a drag can't supply a
date). This is the §13.5 lesson applied: a prompt wired into one of several call sites is
silently skipped by the others. Both `resolvedOn` and `completedOn` stay **OPTIONAL** in their
schemas and stamp `now()` when absent, so any caller that legitimately has no date — the
auto-close cron included — is unaffected.

### 5.3 MIS picks the lifecycle dates — claim, start, completion (BOTH modules)
Every step where MIS records that something happened asks **which day it happened**, in
both pipelines, because the work and the recording of it routinely fall on different days.
The dates are the record; the button-press time is not.

| Step | ISSUE | REQUEST | Stored in | Dialog |
|---|---|---|---|---|
| Claim | `claimTicket({claimedOn})` | `claimRequest({claimedOn})` | `tickets.claimed_at` / `request_details.claimed_at` | ClaimDialog / RequestBuildPanel |
| Start | `startTask({startedOn})` | `startWork({startedOn})` | `tickets.started_at` / `request_details.started_at` | StartTaskDialog / StartWorkDialog |
| Finish | `updateStatus(id,"RESOLVED",resolvedOn)` | `markComplete({completedOn})` | `tickets.resolved_at` / `request_details.completed_at` | ResolveDialog / CompleteDialog |

Every one of them **defaults to today** and accepts **ANY date, past or future** — the §5.2
decision, applied to the whole lifecycle. The pickers carry no `min`/`max`, and the server
refuses only a string that isn't a calendar day.

**Two shared predicates, both unit-tested** (`lib/ticket-state.ts`), used by every action AND
every dialog so the UI can never offer a date the server rejects:
- `startDateFor(day, now)` — claims and starts. Takes the **FIRST** instant of the IST day.
- `completionDateFor(day, now)` — resolutions and completions. Takes the **LAST** instant.

**Why opposite ends of the day.** Claim → start → finish are bounds of one interval, so the
earliest moment for the openers and the latest for the closer keeps `claim ≤ start < finish`
true even when all three land on the same day. Same-end-for-all would collapse a same-day
lifecycle to zero, or invert it. Today always collapses to `now()` in both — when the answer
is "today" the honest value is the real timestamp, not a rounded-off midnight.

**Where the dates show:** the ISSUE detail header (Claimed / Started beside Created), the
request build panel ("Claimed 24 Aug · Started 25 Aug"), and both timelines.

> **Timeline lines carry a DATE ONLY — never a clock time.** Both timelines answer
> "when did this happen" at day resolution: a dated event cannot have a meaningful time
> (its stored instant is just the day's boundary), so showing a time on the undated rows
> beside it made one column read two different ways. The exact instant is not lost — it
> is the `title` tooltip on every date. Comment bubbles keep their time, deliberately:
> several can land on one day and their order within it is the conversation.
>
> **ONE date per timeline line, and it is the picked one.** A dated event (claim, start,
> resolve/complete) shows the day MIS chose **in place of** the row's `created_at`, as a
> plain date with no clock time — the stored instant is just that day's boundary, so a time
> would be invented precision. Events nobody dates (raised, priority changed, edited,
> comments) keep their real timestamp, which for them IS when they happened. The picked date
> is never also repeated inside the sentence.
>
> This replaced a version that showed both — "started work on 07 Aug 2026 · due by 27 Aug
> 2026" followed by "26 Aug 2026, 12:22 PM" — where the timestamp was the one date the
> reader did not want, and every dated event also rendered its own audit line above it
> ("dated the start 07 Aug 2026"), so each event read twice. `eventDate()` in each timeline
> maps event → picked date; keep the two in step when a new dated event is added.

**A date moved off today is audited (§12.5)** with a row in the SAME batch —
`CLAIM_DATED` / `START_DATED` / `COMPLETION_DATED`, `from_value` = when it was recorded,
`to_value` = the date chosen. One type per step serves both modules. Picking today writes
nothing: there is nothing to audit.

> **These rows are written but NOT rendered.** They are the record of who chose a date and
> when they entered it, and they stay in the database for exactly that. Showing them was
> duplication once the line they annotate carries the date itself. The recording time is not
> lost from the UI — it is the `title` tooltip on any date that differs from the day it was
> entered. Do not re-add them to the timeline; widen the tooltip instead.

**Set and cleared in the right places.** A claim date is stamped only on the FIRST self-claim
(`writeAssigned`), so re-claiming your own ticket to re-prioritise never moves the day you
took it on. The combined **claim & start** shortcut collects both dates; a **board drag** has
no dialog, so it stamps `now()`. **Release clears `claimed_at` and `started_at`** (both
modules) along with the assignee, priority and deadline — a release undoes the claim, and a
stale date would attach a later re-claim to the abandoned attempt. **Bulk claim collects a date PER
TICKET**, alongside that ticket's priority, on each step of the wizard (both default to
today, so claiming a batch as "all today" is still zero extra clicks). It first shipped
with one shared date for the batch, on the reasoning that a bulk claim is a single act on
a single day; that was wrong about how the batch arises — it is usually a backlog being
caught up on, where each ticket was genuinely taken on a different day, and one shared
field made the later pick silently overwrite the earlier one. A date the user actively
clears blocks the submit and jumps the wizard to that ticket rather than defaulting it.

**Bulk resolve (`bulkResolveTickets`)** completes the set. Same wizard shape, keyed off
the START date instead of the claim date: per ticket it asks **"was it completed on the
day work started?"** — *Same day* fills `resolved_at` from THAT ticket's `started_at`,
*Different day* opens a free field, and a ticket resolved straight from Open (never
started) says so and asks outright. `resolveOne` is extracted from `updateStatus` and
shared, so the single "Mark resolved" and the bulk one apply the same §5/§6 guards —
including `canResolveIssue`, which makes bulk resolve **admin-only in effect**: both
lists offer the button only to an MIS_ADMIN, and only for their own **started**
claims — IN_PROGRESS / REOPENED, never OPEN.

> **Bulk resolve excludes OPEN deliberately, though the machine permits OPEN → RESOLVED.**
> On the Claimed tab every row is claimed-but-unstarted, so offering "Resolve selected"
> there skipped a lifecycle step, and the wizard's own question ("completed on the day
> work started?") is unanswerable for a ticket that never started. Start is the next step
> there. The SINGLE-ticket "Mark resolved…" keeps the OPEN shortcut, for the odd ticket
> that turns out to be nothing — so the state machine is unchanged and only what the bulk
> bar offers is narrowed.

**Bulk start (`bulkStartTasks`) lives on BOTH issue lists** — All Issues and, more
usefully, **Assigned to Me** (whose Claimed tab IS your unstarted queue, so that is where
the multi-select belongs; All Issues mixes in other people's claims, which are not
startable by you). Same wizard, same action, both restricted to rows that are yours and
unstarted. The twin of bulk claim:
step through the selected tickets with Prev/Next and give each its OWN start date and
delivery deadline. Per ticket it asks the question MIS actually has — **"did work start on
the day it was claimed?"** — because most tickets did: answering *Same day* fills the start
date from THAT ticket's `claimed_at`, *Different day* reveals a free date field, and a
ticket with no recorded claim date (claimed before the column existed) says so and asks for
the date outright rather than inventing one. Both actions share `startOne`, so the single
Start task and the bulk one cannot drift on the §5/§6 rules; it is **assignee-locked**, so
the button offers only the tickets in the selection that are yours and unstarted, and the
count on it says how many. Best-effort per ticket like bulk claim, and each started ticket
notifies its reporter (§8) — starting is the announced step, unlike a claim.

Every `*On` field stays **OPTIONAL** in its schema and stamps `now()` when absent, so callers
with no date (board drag, auto-close cron) are unaffected.

> **Consequence, stated plainly:** `completed_at − claimed_at` (Team performance, §10) and
> `resolved_at − created_at` are now computed from dates MIS chooses by hand. That is the
> point — they were previously computed from when someone got round to clicking — but it does
> mean a careless pick moves a team's numbers, and nothing bounds it. The audit rows are the
> check on that.

## 6. Roles & permissions
| Action | USER | MIS_STAFF | MIS_ADMIN |
|---|---|---|---|
| Raise ticket | ✓ | ✓ | ✓ |
| See own tickets | ✓ | ✓ | ✓ |
| See all tickets / staff dashboard / board | ✗ | ✓ | ✓ |
| See own dashboard (landing: own issues & requests) | ✓ | ✓ | ✓ |
| Claim (assign to self + priority; stays Open) | ✗ | ✓ | ✓ |
| Start task (set deadline; Open → In Progress) — own claimed ticket | ✗ | ✓ | ✓ |
| Release own claim (Open-only; back to unclaimed Open) — own claimed ticket | ✗ | ✓ | ✓ |
| **Mark resolved (with the resolution date, §5.2) — own claimed ticket** | ✗ | **✗** | **✓** |
| Change status / priority | ✗ | ✓ | ✓ |
| Bulk claim | ✗ | ✓ | ✓ |
| Take over a ticket assigned to someone else | ✗ | ✗ | **✗ — see below** |
| Comment on a ticket they can see | ✓ | ✓ | ✓ |
| Reopen own ticket / confirm resolved | ✓ | ✓ | ✓ |
| Soft-delete a ticket | ✗ | ✓ | ✓ |
| Recycle bin: restore / permanently delete | ✗ | ✗ | ✓ |
| Manage users / change roles / bulk-add users | ✗ | ✗ | ✓ |
| **Set (reset) another user's password — never READ it (§7)** | ✗ | ✗ | ✓ |
| Approve / reject Google access requests (§7) | ✗ | ✗ | ✓ |
Enforce on the server (in actions/queries), never trust the client. USER may only read tickets where `created_by = session.user.id`.

> **There is NO takeover, for anyone.** This row previously read "✓" for MIS_ADMIN; the
> code has always refused — `claimOne`: *"never steal a ticket already claimed by someone
> else — not even as an admin. Once claimed, the assignee owns it end-to-end."* There is
> also no `assignTicket`/reassign action, deliberately (see the note in
> `lib/actions/tickets.ts`). The table was wrong, not the code, so the table is corrected.
> The escape hatch is the assignee **releasing** it (§5) — now possible even after a start.
> **Consequence, same shape as `docs/known-issues/0003` for requests:** if an assignee is
> deactivated mid-work, their ticket cannot be released or reassigned by anyone, and its
> only exit is an admin marking it resolved. Accepted, unhit, tracked there.

> **Resolving is admin-only AND assignee-locked (`canResolveIssue`), and those two combine
> into a gap worth knowing.** An MIS_STAFF assignee cannot resolve their own ticket, and no
> admin may resolve it for them either — that would be a takeover of the claim, which §6
> forbids for everyone. So a staff-held ticket has no direct resolve path: the exit is the
> staff member **releasing** it (§5) so an admin can claim and resolve it. This is why the
> release hatch must stay open to MIS_STAFF. It affects nobody today — MIS_STAFF is retired
> from the admin role picker (§12.1), so the whole MIS team is MIS_ADMIN — but
> `adminBulkCreateUsers` can still mint an MIS_STAFF row (§13.3), so it is reachable.

## 7. Auth rules
Google SSO **and** email + password. Google is first-class SSO; passwords are an
additional door (`bcryptjs` verify against `users.password_hash`).

**The app is INVITE-ONLY — membership is the gate, not the email domain.** You may
sign in only if a `users` row already exists for your email (an admin created it in
Settings → Users) and `is_active` is true. An unknown Google account is refused
(`AccessDenied`) — it does NOT self-provision.

**Two admin-mediated ways to onboard (both end at an MIS_ADMIN action):**
1. An admin creates the account directly — Settings → Users (single or bulk add).
2. **Request-to-join (§7, Google only):** a stranger's first Google sign-in is still
   refused, but instead of a dead-end it records a **PENDING `access_requests` row**
   (name/email/photo from the Google profile) and alerts every admin (in-app + email).
   An admin **approves** → this creates the `users` row as **USER (Employee)**, active;
   the admin changes role/department afterwards in Users. **Reject** is sticky (a
   declined stranger's retry does not re-open it; an admin can clear it). The requester
   is emailed on approval (they have no in-app presence until then).

   **This does NOT weaken the invariant below.** A login attempt writes an
   `access_requests` row, which grants NOTHING — it is a knock on the door. The ONLY
   thing that inserts a `users` row is the admin approval action
   (`approveAccessRequest` → `approveAccessRequestTx`). So "account creation belongs to
   MIS_ADMIN actions only" still holds exactly. The request path is Google-only on
   purpose: the **password door stays invite-only** (a stranger has no password, and a
   public password signup was the exact hole closed below). Tables/enum:
   `access_requests` + `access_request_status` (§4).
> **Why not the domain allowlist (as originally specified):** it cannot gate this
> organisation. The team signs in with **personal Gmail**, not a Workspace domain
> (15 of 18 users are @gmail.com), so `ALLOWED_EMAIL_DOMAINS="gmail.com"` would admit
> nearly every Google account in existence, and leaving it empty admits everyone.
> `ALLOWED_EMAIL_DOMAINS` therefore remains supported as an **optional extra filter**
> layered on top (useful if this ever moves to a Workspace domain) — but it is never
> the thing keeping strangers out.

**`ADMIN_EMAILS` is the bootstrap exception**: those addresses may self-provision on
first sign-in, and are promoted to MIS_ADMIN on every sign-in (idempotent, never
downgrades). Without it a fresh deployment with an empty `users` table would admit
nobody — an unrecoverable lockout, since the only way in is a UI you can't reach.

**Passwords can be SET by an admin, never READ by anyone.** `users.password_hash` holds a
bcrypt hash — a one-way function the login check re-computes against — so the original
text is stored nowhere and cannot be derived. Three write paths, no read path:
- `changeMyPassword` (Profile) — your own; requires the CURRENT password when you already
  have one (a Google-only account may set its first without).
- `adminSetUserPassword` (Settings → Users → Edit user) — an MIS_ADMIN **replaces** anyone's
  password. **No current password is required**, because a resetting admin doesn't have it;
  that makes it a genuine account-takeover tool, hence MIS_ADMIN-only, and the new password
  is handed over out-of-band by the admin who set it.
- `adminCreateUser` / `adminBulkCreateUsers` — the initial password at account creation.

The Edit-user dialog therefore shows only whether password sign-in is enabled
(`hasPassword`, already selected by `listAllUsers`) plus a field to set a NEW one — there
is no "current password" display, and adding one would mean storing plaintext, which hands
every password in the company to anyone who reads the database. Do not add it.

**There is NO self-service sign-up that mints an account.** Admins create accounts with
a password (bulk add in Settings → Users); a user sets/changes their own password in
Profile once they're in. A public `registerWithPassword` action used to exist and
defeated the gate entirely — the invite check asks "does a `users` row exist?", and
that action was an unauthenticated way to make one exist, so any stranger could mint an
active USER row and sign in through the password door while the Google door was bolted.
Closing only one door is not closing the door: **any new path that can INSERT a `users`
row is a sign-in bypass.** Account creation belongs to MIS_ADMIN actions only — and the
request-to-join path above respects this precisely because it inserts into
`access_requests`, never `users`; the `users` insert is gated behind admin approval.

The decision itself lives in `lib/auth-gate.ts` — pure, unit-tested functions
(`lib/auth-gate.test.ts`), same convention as `lib/ticket-state.ts`:
- `canSignIn(...)` — the invite gate. Two orderings in it are load-bearing (below).
- `shouldRequestAccess(...)` — whether a REFUSED sign-in should file a request. True
  ONLY for a genuinely-new Google account (provider google, email present, **no
  existing `users` row**, not a bootstrap admin, domain allowed). The "no existing row"
  clause is load-bearing: a **deactivated or demoted member must not re-request their
  way back in** — their refusal was an admin's decision, not a newcomer knocking.
  Recording the request is a best-effort side effect in the `signIn` callback; the
  callback still returns false, so the `users`-writes-nothing guarantee is untouched.

Two orderings in `canSignIn` are load-bearing:
- An existing row's `is_active` is checked BEFORE `ADMIN_EMAILS`, so deactivating a
  bootstrap admin still locks them out (otherwise removing an admin would silently do
  nothing).
- `ADMIN_EMAILS` is **exempt from `ALLOWED_EMAIL_DOMAINS`**. The bootstrap is the
  recovery hatch, and a hatch a config change can lock is not a hatch: setting the
  domain filter to a domain the team doesn't use (the docs used to instruct exactly
  that) would otherwise refuse every user AND the only account that could add them
  back — with no way in through the UI.

Session carries `id` and `role` (extended session callback). Protect all `/(app)`
routes with middleware; unauthenticated → `/login`.
> **Known gap (pre-existing, not fixed):** sessions are JWT (`strategy: "jwt"`), so
> deactivating a user does not revoke a session already issued — their token stays
> valid at the edge until it expires. `getCurrentUser()` re-checks `is_active` on
> every `/(app)` request and returns null, so the app itself still locks them out.

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
- `sendTicketReleasedNotification` — **work stopped** → reporter ("{number} is back with the MIS team"), in-app + email. The reversal of the above, fired ONLY when the release undoes a *started* ticket. Releasing an unstarted claim sends nothing, because the claim sent nothing. See §5 and §12.6's reversal rule.
- `sendAssignmentNotification` — assigned → assignee, in-app + email.
- `sendResolutionNotification` — RESOLVED/CLOSED → reporter ("please verify"), in-app + email.
- `sendReopenNotification` — reopened → assignee, in-app + email.
- `sendClosureNotification` — reporter confirmed → assignee ("closed for good"), in-app + email.
- `sendEditNotification` — reporter edited after work started → assignee, in-app only.
- `sendCommentNotification` — new comment → the other party, in-app only (email off by default).
- `sendAccessRequestedNotification` — a stranger's Google request-to-join (§7) → every MIS_ADMIN, in-app + email. Fired once, only when a NEW pending request appears (not on repeat logins while pending).
- `sendAccessApprovedNotification` — an admin approved a request (§7) → the new user, email (they have no in-app presence until they sign in) + a welcome notice waiting in their bell.

## 9. Conventions
- All writes go through Server Actions in `/lib/actions`, validated with a matching zod schema in `/lib/validators`. Return typed results `{ ok: true, data } | { ok: false, error }` (`lib/actions/result.ts`).
- Every mutation writes a `ticket_activity` row (batched with the change via `db.batch`).
- Use `revalidatePath`/`revalidateTag` after mutations. Optimistic UI only on the Kanban drop.
- Ticket numbers come from the `ticket_seq` sequence — never computed from a row count.
- **Soft delete**: `deleted_at IS NULL` must be filtered from EVERY active ticket read (lists, detail, counts, analytics). Deleted tickets live only in the recycle bin.
- **Dates**: stored UTC. Tables/lists render **absolute time in a fixed timezone (IST)** via the deterministic `AbsoluteTime` component (no locale drift → no hydration mismatch); deadlines render as a plain IST date. Relative time ("2h ago") is used only for at-a-glance card metadata, never as a table's source of truth.
- **Best-effort side effects**: notifications and bulk operations never let one failure abort the rest or roll back the DB; log and continue.
- Env vars: `DATABASE_URL`, `AUTH_SECRET`, `AUTH_GOOGLE_ID`, `AUTH_GOOGLE_SECRET`, `ALLOWED_EMAIL_DOMAINS`, `ADMIN_EMAILS`, `BLOB_READ_WRITE_TOKEN`, `RESEND_API_KEY`, `EMAIL_FROM`, `NEXT_PUBLIC_APP_URL`, `CRON_SECRET` (guards the §5 auto-close cron; unset ⇒ the endpoint refuses and nothing auto-closes).

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
  - **Beyond the six charts**, the staff dashboard has a **Team performance** detail
    report (`TeamPerformance`) per pipeline: one row per MIS member — claimed / in
    progress / completed(delivered) / avg completion time. This is a table, not a chart,
    and it DOES use a dedicated aggregation (`assigneePerformance(type, department)` in
    `lib/db/analytics.ts`) — consistent with the other dashboard aggregations there
    (`dashboardStats`/`requestStats`/`flowTrend`), which the "six charts derive from
    existing queries" rule never forbade. Avg = resolved−created for ISSUE, completed−
    claimed for REQUEST. The **employee** dashboard (§3) shows own-ticket stats, no team
    report.

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
  (nullable), expected_benefit, **requested_by (text, nullable in the DB but REQUIRED at
  intake via the form/zod — who ASKED for the system, e.g. the requester's manager;
  nullable so pre-existing rows and ISSUE→REQUEST moves (§12.9) need no backfill)**,
  md_decision (enum, default PENDING), **md_decision_recorded_by**
  (fk users.id, nullable — the MIS_ADMIN who ticked on the MD's behalf; defaults to the
  acting admin), md_decided_at (nullable), md_remark (text, nullable — **OPTIONAL even
  on reject**), claimed_by (fk users.id, nullable), claimed_at (nullable), **started_at (nullable —
  the day the BUILD began, §5.3; the request twin of tickets.started_at)**, **deadline
  (date, nullable)**, revision_round (int default 0), completed_at (nullable),
  accepted_at (nullable). **There is NO `md_decided_by` column** — the recorder IS the
  accountability record. **There is also NO `urgency` / `target_date`**: a request
  mirrors an issue (§5) — the requester states the need, MIS sets `tickets.priority`
  on claim, and `deadline` is committed at start-work. The requester never
  self-assigns a priority or a date.
- `progress_logs`: id, ticket_id (fk cascade), author_id (fk), type
  (progress_log_type), body (text), percent_complete (int 0-100, nullable),
  created_at. Index on ticket_id.
  **The request's CURRENT percent-complete is the newest log with a non-null
  percent_complete — DERIVED, never stored.** Percent is the state of the REQUEST, not
  of an entry: the detail shows ONE figure at the top ("Progress: 80% · updated by X"),
  and `listRequests` derives the same value with a correlated subquery for the board
  card. Do NOT add a `request_details.percent_complete` column: it would be a second
  source of truth for one number, free to drift from the history it summarises. Entries
  note the % they set inline, small — never a competing bar per entry.

### 12.3 REQUEST state machine
SUBMITTED → UNDER_REVIEW (MIS_STAFF/ADMIN; internal discussion happens as comments)
→ PENDING_MD_APPROVAL (MIS sends it up) → APPROVED or DROPPED.
The APPROVED/DROPPED verdict is RECORDED BY AN MIS_ADMIN on the MD's behalf (writes
md_decision, md_decision_recorded_by, md_decided_at, optional md_remark).
APPROVED → CLAIMED (an MIS member self-claims: sets assigned_to + **priority**; no
date yet) → IN_PROGRESS (`startWork` — the assignee **commits to the delivery
`deadline` here**, and the requester is told) → IN_TESTING (MIS marks complete, **dating
`completed_at` to the day the build was actually finished — §5.2**) →
CLOSED (requester accepts) OR
CHANGES_REQUESTED (requester unsatisfied; revision_round += 1) → IN_PROGRESS (loops,
uncapped). DROPPED → UNDER_REVIEW (MIS_ADMIN revive only). Any other transition is
illegal and rejected server-side.

**Release / undo a claim** (`releaseRequest`, → APPROVED): the mis-claim AND mis-start
escape hatch, mirroring the ISSUE release (§5). The assignee sends a build **back to the
approved pool** — clears assigned_to, priority, claimed_by/claimed_at and any deadline,
so it looks exactly as it did on approval and is claimable again. Writes an UNCLAIMED
activity row carrying the status it left, so the timeline tells "claimed by mistake"
from "handed back mid-build".

Allowed from **CLAIMED, IN_PROGRESS and CHANGES_REQUESTED** — the releasable set is
`REQUEST_RELEASABLE_FROM` in `lib/ticket-state.ts`, shared by the action and the button.
Never from **IN_TESTING or CLOSED**: the requester is verifying, and only their
acceptance closes a request (§12.4) — MIS must not yank a build back from under them.

**Assignee-locked** — even an MIS_ADMIN may release only a build assigned to themselves.
Deliberately stricter than the build steps: an admin may work anyone's build, but taking
one off a colleague is a takeover, not an undo.

**It always notifies** (§12.6), unlike an ISSUE release from OPEN: a request claim is
itself announced ("{member} has picked up {number}"), so every release corrects
something. Releasing a *started* build withdraws more — the delivery date committed at
start-work — and the notice says so explicitly.

> §12.3 originally allowed release **only while CLAIMED**, reasoning that "once started, a
> delivery date has been promised to the requester, so it's no longer a quiet correction."
> That is §5's argument verbatim, and it is wrong the same way: §12.6's reversal rule says
> an announced change needs its reversal **announced, not forbidden**. Forbidding it left a
> mis-started build with no way back at all — not releasable, not reassignable (there is no
> takeover), only markable complete, which hands the requester something to test that was
> never built. Both modules now behave identically: **claim or start by mistake, hand it
> back, and the person who was told gets told.**

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
| Add progress log | no | yes (assignee only) | yes (assignee only — no override) |
| Mark complete (→ IN_TESTING, **with the completion date, §5.2**) | no | yes (assignee) | yes |
| Request changes (→ CHANGES_REQUESTED) | yes (requester only) | no | yes — **detail-only override** |
| Accept & close | yes (requester only) | no | no |
| Comment | yes | yes | yes |

MIS may NEVER force-close a request. Only the requester's acceptance closes it — with
ONE exception: the **system auto-closes** a delivered request (IN_TESTING) the requester
never responds to, after `AUTO_CLOSE_DAYS` (§5). That is a timeout, not MIS acting, and
it is reversible — the requester (or admin) can reopen it back to IN_TESTING
(`reopenRequest`, gated on `auto_closed_at`). No MIS member can force a close by hand.

> **Request-changes is the requester's gate; the admin's is an escape hatch, not a
> normal move.** At IN_TESTING the build is delivered and it is the requester's turn —
> so `availableRequestMoves` offers "Request changes" (and "Accept & close") **only to
> the requester**, and the requests LIST shows the admin nothing there. An admin is
> still server-permitted to send it back (`requestActorAllows` keeps
> `IN_TESTING → CHANGES_REQUESTED` for admin) — because otherwise a request whose
> requester never tests it would be stuck in Testing with no MIS lever at all (release
> is barred from IN_TESTING, close is requester-only). That power is surfaced ONLY in
> the detail (`RequestUatPanel`) as a clearly-secondary "Send back for changes
> (override)", under the primary "Waiting for {requester} to test" message — never as a
> row move, where it read as "MIS is being asked to test the build". The build panel
> likewise stops showing "is building this / Change date" once IN_TESTING: the build is
> **delivered**, so that stage renders a read-only "finished — now in testing" state.

> **Why "Add progress log" has no admin override**, unlike every other build action
> beside it (`canBuild = isAdmin || (isStaff && isAssignee)` lets an admin start,
> complete or resume anyone's build). A progress log is not an administrative act on
> the build — it is a **first-person claim about it** ("I got X done, it's 80% there").
> Someone who isn't doing the work cannot truthfully make that claim, and a log
> attributed to a non-builder makes the timeline lie about who knows what. Enforced by
> `canLogProgress` in `lib/ticket-state.ts` — ONE unit-tested predicate shared by the
> server action and the composer, because the bug it replaces was exactly those two
> drifting apart (both allowed any admin, so a non-assignee posted "80%" on a build
> another member had claimed).
>
> **ACCEPTED DEBT — no reassignment (`docs/known-issues/0003`).** If an assignee is
> deactivated or demoted mid-build, nobody can log progress on that request: there is no
> takeover or reassignment action (§12.3), release is assignee-locked AND CLAIMED-only,
> and `setUserActive` deliberately releases only ISSUE tickets. The one escape is an
> admin marking it complete (`markComplete` is `canBuild`, so an admin may). Known,
> deliberate, unhit so far. **Do not "fix" it by restoring the admin override on
> progress logs** — that re-introduces the bug above. The gap is assignment, not logging.

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

Best-effort; a failed send must never roll back the DB mutation.

**Channels (as built).** In-app for all of the above, **plus email** for the eight
marked — the SAME Resend sender, the SAME `shell()` layout, and the SAME `notify()`
dispatcher the ISSUE templates use (`lib/notifications/templates.ts`). There is no
second email style and no parallel sender. Email is added ALONGSIDE in-app, never
instead of it, and every email deep-links to `{NEXT_PUBLIC_APP_URL}/tickets/{number}`
(§12.7's one link pattern). With `RESEND_API_KEY` unset the provider warns and returns
`{ok:false}` — it never throws, so an unconfigured environment degrades to in-app only.

- REQUEST_RELEASED → requester (the claim or start was undone — "{number} is back with
  the MIS team"). When the build had been STARTED, the notice also withdraws the delivery
  date start-work committed to — releasing takes back both facts, so it states both. See
  the reversal rule below.
- **REQUEST_REVIVED → requester + MIS team** (a DROPPED request was brought back —
  "{number} is back under review"). The reversal of REQUEST_DECISION_RECORDED's drop,
  to the same recipients. Required by the rule below the moment the drop started
  emailing: the drop mail even says "an MIS admin can revive it", so leaving the revive
  silent makes that mail the last word on a request that is no longer dead.

**In-app ONLY, deliberately:** `REQUEST_PROGRESS` — a build update every few days would
fill an inbox for no gain, and no earlier email is made false by it.

> ### The reversal rule (applies to every channel decision, not just this list)
> **Any state change announced by email must have its reversal announced by email too.**
>
> The reason is not symmetry for its own sake. An email that is never corrected doesn't
> leave the reader uninformed — it leaves them **misinformed**, holding something false
> with no reason to doubt it. A requester with "Aditya has picked up REQ-005" sitting in
> their inbox *believes* work is under way. Correcting that only in-app fixes it for
> people who happen to open the app; for everyone else the app is now actively lying.
> Silence would have been better than an uncorrected announcement — and correcting it
> is better than both.
>
> So: `REQUEST_CLAIMED` emails ⇒ `REQUEST_RELEASED` must email. The same test decides
> any future undo — a reopen after an accept, a de-assignment, a revive — without
> re-litigating it per event. **Before adding an email, ask what reverses it, and
> whether that reversal mails too.** If it can't, don't send the first one either.

### 12.7 Routing (Hybrid)
- **Shared, type-aware detail:** `/tickets/[number]` renders BOTH types, branching on
  `type` to show issue vs request panels. One route, one deep-link pattern, used by
  every notification link.
- **The sidebar is built PER ROLE** (`navSectionsFor(role)`), not one list filtered by
  flags — the two audiences want genuinely different SHAPES, not the same menu with rows
  hidden, and flag-filtering also can't reorder (an employee needs "My Tickets" at the
  top, staff need it mid-list). Construction sets order and labels directly.
  - **MIS staff / admin** get the pipeline-grouped triage nav, so it is obvious at a
    glance which pipeline a menu serves (a generic "Overview" holding "All Tickets" +
    "Board" made that impossible — the confusion this grouping removes). Issue-only
    entries say "issue" outright:
    - **Issues** — `/tickets` ("All Issues"), `/board` ("Issue Board"), `/new`
      ("Report an issue").
    - **System Requests** — `/requests` ("All Requests"), `/requests/board`
      ("Request Board"), `/requests/new` ("New Request").
    - `/dashboard` ("Dashboard") sits above the split (reports on both pipelines via its
      own toggle); **"Assigned to Me"** (`/my`) sits below both — their cross-pipeline
      work queue (assigned issues AND requests they are building, §12.3).
    - Systems (§13.3) + admin-only Settings form an unlabeled tail group.
  - **Employees (USER)** never triage, so they get a job-oriented nav, NOT the staff nav
    with rows removed. The old approach left them a broken shape (a lone "Report an issue"
    under an ISSUES header, their issue list orphaned at the bottom, a pointless "Request
    Board" of their own 1–2 requests, and a redundant "My Requests"). Their nav is exactly
    two jobs:
    1. **My Tickets** (`/my`) — ONE home showing BOTH their issues and their requests
       (see the `/my` note below). This is why employees have **no** "My Requests" or
       "Request Board" link: the first is redundant with the sub-tab, the second is noise.
    2. The two RAISE actions, kept deliberately distinct so "broken system" can't blur
       into "new system" — **"Report an issue"** (`/new`) vs **"Request a system"**
       (`/requests/new`).
    - **Systems is NOT in the employee nav** (product decision): the directory link is
      surfaced only in the MIS staff/admin tail. This is a **nav-surface** choice, not a
      permission change — the `/systems` route itself stays USER-readable per §13.3, so
      the two are consistent as long as the link's absence isn't mistaken for a route
      guard. (If Systems is ever meant to be truly admin-only, §13.3's permission table
      must change too, not just this nav entry.)
  - **`/my` shows BOTH types for everyone** via `MyWorkView` (an Issues | System Requests
    sub-tab pair, each reusing its real list — `MyTicketsView` / `RequestsView`). Its one
    `variant` differs by role: staff see tickets ASSIGNED to them (inline controls), a USER
    sees tickets they RAISED (read-only) + requests they submitted (row-scoped, §12.7).
    (Previously `/my` was issue-only for a USER, which stranded their requests — the bug
    this fixes.)
  - **Section headers are optional and must earn their space** (`label?` on `NavSection`).
    A header costs a text row plus a gap, so it is used only where it disambiguates — i.e.
    the two staff pipelines. Lone links render as unlabeled groups separated by a hairline
    rule. `sectionsFor` still drops any empty group as a safety net so a header/rule never
    renders over nothing.
- **A pipeline toggle on every list/board surface** (`ScopeToggle`) — the issue⇄request
  switch on `/tickets`, `/board`, `/requests`, `/requests/board`. It NAVIGATES rather than
  filtering in place, preserving the Table/Board choice across the switch. The two lists
  have different columns, stage tabs and row controls, so rendering requests inside the
  issue table would create a second request surface free to drift from the real one.
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
  - `availableRequestMoves(status, {role, isRequester, isAssignee, assigned})` — the ONE
    list of stage moves a viewer may make from a status, shared by the detail action bar
    and the **inline stage control on the requests list** (`RequestStageControl`), so the
    two can't drift. Each move is tagged `inline` (runs its server action from the row) or
    `detail` (needs a priority/date/verdict/note → opens the detail, where the tested
    dialog collects it). A unit test asserts every offered move is a transition
    `canTransition` permits, so the row never shows a move the server rejects.
- **Type isolation:** the ISSUE actions reject REQUEST ids, and every issue
  list/count/analytics query filters `type = 'ISSUE'` — otherwise requests leak into
  the issue lists/dashboard, and MIS could force-close a request through the ISSUE
  machine (IN_PROGRESS is shared). `getTicketById` is deliberately NOT type-filtered —
  the request actions call it and then check `type` themselves.

### 12.9 Moving a misfiled ticket (ISSUE ⇄ REQUEST)
Doers sometimes file a system request in Issues, or a bug in System Requests. A **Move**
converts a ticket to the other module in place (`moveTicketType`, `lib/actions/tickets.ts`
→ `moveTicketType` query). **MIS staff + admin only** — they triage, so they fix the
misfile; a USER never sees it.

**As built:**
- **Renumbered into the target sequence.** The ticket draws a FRESH number from the
  other sequence (`MIS-` ⇄ `REQ-`, same `nextval` expression the creators use), because
  the prefix encodes the type everywhere. The old number is retired (a just-misfiled
  ticket isn't deeply linked yet). Never computed from a row count (§9).
- **Reset to the target's intake stage**, fresh: ISSUE → REQUEST lands at `SUBMITTED`;
  REQUEST → ISSUE lands at `OPEN`. The old `assigned_to` / `priority` / `deadline` /
  `resolved_*` are cleared — it re-enters the correct pipeline clean.
- **The brief is reconciled.** ISSUE → REQUEST creates the `request_details` row
  (system_name ← title, problem_statement ← description, current_sheet_link ←
  sheet_link) and collects the **one** field a request needs that an issue lacks —
  `expected_benefit` — in the move dialog. REQUEST → ISSUE folds the brief back into the
  issue description (problem + benefit + current process) and drops `request_details`
  (1:1 with REQUEST). Comments, attachments and activity hang off `ticket_id`, so they
  come across untouched.
- **Audited.** A `MOVED` activity row (TEXT-constrained, no migration) records
  `from_value` = old number, `to_value` = new number, so the timeline reads "moved from
  MIS-004 to REQ-012". All the above is ONE atomic `db.batch` (§2); the `to_value`
  back-stamp is a best-effort follow-up (a batch statement can't read a sibling's
  `nextval`).
- **Gated by `canMoveTicketType(type, status)`** (`lib/ticket-state.ts`, unit-tested) —
  a move is blocked once the ticket reaches a done/verification state (ISSUE: RESOLVED /
  CLOSED; REQUEST: IN_TESTING / CLOSED), where a reset would destroy real work or a
  sign-off. Everything earlier, including a claimed/in-progress misfile, may still move.
  The `MoveTicketButton` shares this predicate, so it hides exactly when the action
  would refuse.

## 13. Systems Repository module (ADDITIVE — new tables only)

Central directory of every system the MIS team builds, so URLs aren't lost and
searching is instant. Purely additive: it does NOT change issue/request logic, and no
issue/request query, action, or state machine is touched by it.

### 13.1 Enums
- `system_type`: SHEET | APPS_SCRIPT | WEB_APP | OTHER
- `system_status`: ACTIVE | DEPRECATED | ARCHIVED (default ACTIVE)

Both are brand-new `CREATE TYPE`s on brand-new tables, so none of the
`ALTER TYPE … ADD VALUE` caveats that applied to `status` in 0010 are in play.

### 13.2 Tables (mirrors `lib/db/schema.ts`)
- `systems`: id (uuid), **code (text, unique — 'SYS-001'; see §13.7)**, name,
  system_type (enum), department (the EXISTING `department` enum — reused, never
  redeclared), owner_id (fk users.id), frontend_url (text, **required, a real URL**),
  backend_url (nullable), status (system_status, default ACTIVE), notes (nullable),
  linked_ticket_id (fk tickets.id, nullable — set when logged from a REQUEST; **no
  cascade**, deleting a ticket must never silently delete a directory entry),
  logged_by (fk users.id), created_at, updated_at (`$onUpdate`). Indexes on code,
  name, department, status.
- `system_access_confirmations`: id, system_id (fk **cascade**), grantee_id (fk
  access_grantees.id, nullable), **grantee_label (text — a SNAPSHOT of the name at
  confirm time)**, confirmed (bool), confirmed_by (fk users.id), confirmed_at. One row
  per active grantee per system. Index on system_id.
  The label is snapshotted rather than joined so that renaming or deactivating a
  grantee later cannot rewrite history.
- `access_grantees` (config): id, **label (text, UNIQUE)**, is_active (bool, default
  true), sort_order (int), created_at. Seeded with "Naushi Ma'am" (1) and "Raghav Sir"
  (2) **by migration 0013**, idempotently (`ON CONFLICT (label) DO NOTHING`).
  This table drives the required checklist — **never hardcode grantee names** in a
  form, an action, or the seed script. Grantees are deactivated, never deleted.

> **Why the grantee seed lives in the MIGRATION, not `lib/db/seed.ts`:** seed.ts is a
> dev-only script (it creates `@example.com` users and is never run against
> production). Grantees seeded only there would not exist in prod — and an EMPTY
> `access_grantees` table silently voids §13.4, because "every active grantee has
> confirmed = true" is **vacuously true over an empty set**. See §13.4.

### 13.3 Permissions
| Action | USER | MIS_STAFF | MIS_ADMIN |
|---|---|---|---|
| View + search the directory | ✓ (read-only) | ✓ | ✓ |
| Create / edit / archive a system | ✗ | ✓ | ✓ |
| Manage the `access_grantees` config | ✗ | ✗ | ✓ |

Two deliberate departures worth knowing:
- **The directory is company-wide readable.** Every other USER-facing read is
  row-scoped (§6: `created_by = session.user.id`); this is the first authenticated
  read-all surface, and it exposes frontend/backend URLs + notes across all four
  departments. That is the point of a directory, but it IS a departure from §6.
- **The MIS_STAFF / MIS_ADMIN split here is real, not nominal.** §12.1 notes MIS_STAFF
  is retired from the admin role picker, but `adminBulkCreateUsers` still maps a
  "staff" row to MIS_STAFF, so MIS_STAFF users are reachable in production. Do not
  collapse the two tiers.

There is **no soft delete** on `systems` (no `deleted_at`, no recycle bin) — §9's
soft-delete rule is scoped to tickets. `status = ARCHIVED` is retirement, and a system
is never hard-deleted.

### 13.4 Compliance rule (hard requirement, server-enforced)
A system cannot be created unless EVERY currently-active `access_grantee` has a
confirmation row with `confirmed = true`. Re-fetch the active grantees server-side on
every create; **never trust the client checkboxes** (their labels are ignored entirely —
the snapshot is taken from the server's own row).

**This is TWO checks, not one:**
1. **Refuse when the active grantee list is EMPTY** — "No active access-grantees
   configured — add at least one before logging a system". Without this the rule is
   vacuous: a universally-quantified predicate over an empty set is true, so a
   database with no grantees would wave every system through the very gate meant to
   stop it. An empty checklist means the config is missing, not that everyone approved.
2. Every active grantee present AND `confirmed = true`.

The checklist is **self-attested**: it records confirmed_by + confirmed_at as the
accountability trail. It does NOT verify Google sharing — that needs the Drive API and
is explicitly out of scope (future work).

The system row and its confirmation rows are written in ONE `db.batch` (neon-http has
no interactive transactions, §2). The id is generated app-side (`crypto.randomUUID`)
because a batch statement cannot read a previous statement's returned id — same
pattern as `createRequestTicket`. A system row without its confirmations would be a
non-compliant directory entry, which is exactly what §13.4 exists to prevent.

### 13.5 Integration with REQUEST completion
When a REQUEST is marked complete (`markComplete` → IN_TESTING), prompt the acting
MIS member to log the built system, pre-filled (name = system_name, owner = assignee,
department, linked_ticket_id = the ticket). A **soft prompt, never a hard block** on
the request lifecycle — only the requester closes a request (§12.4). Completed/closed
requests show a "system logged ✓ / not logged" flag so nothing slips.

**As built (P16):**
- **The actor is the assignee, not necessarily an admin.** `markComplete` is gated on
  STAFF_ROLES and is normally called by the assignee (who may be MIS_STAFF), so the
  prompt gates on `canBuild` (`isAdmin || (isStaff && isAssignee)`) — mirroring the
  action exactly. An admin-only prompt would never fire for a staff member's own build.
- **The dialog lives ONLY on the request detail** (`RequestLogSystem`), and the board
  now **refuses** a drag into Testing ("Open the request to mark complete and log the
  system"). `markComplete` used to have two call sites — the detail's note dialog and a
  bare board drag — so a prompt wired only into the detail was silently skipped on every
  drag. Refusing the drag is the fix: one source of truth for a flow that carries a
  mandatory compliance checklist, and a drag can't supply the handover note either.
- **Soft by construction.** The prompt is raised from `run()`'s success callback — i.e.
  only AFTER markComplete has already committed. Dismissing it changes nothing about the
  request, and the requester's accept/close (§12.4) is untouched.
- **The flag** reads `systemCode`, a correlated subquery on `listRequests` /
  `getRequestByNumber` (same shape as `percentComplete`) — no join, no extra round-trip.
  It shows only once a build is finished (IN_TESTING / CLOSED / CHANGES_REQUESTED);
  before that there is nothing to log, so a flag would just be a nag.
- **Type auto-detect** (`systemTypeFromUrl`, unit-tested in `lib/validators/systems.test.ts`):
  `docs.google.com` + path `/spreadsheets` → SHEET; **any other docs.google.com path →
  OTHER** (that host also serves Docs, Slides and Forms, which are not spreadsheets);
  `script.google.com` → APPS_SCRIPT; anything else → WEB_APP; an unparseable/half-typed
  URL → null (leave the field alone). Matched on HOSTNAME, not substring —
  `includes("script.google.com")` would match `https://evil.test/?x=script.google.com`.
  It is a prefilled DEFAULT and must never override a manual choice: the form latches a
  `typeTouched` ref **when the picker OPENS**, not only on change — Radix fires no
  `onValueChange` when you re-pick the value already selected, so latching on change
  alone would let a later URL edit silently overwrite a choice the user had just made.
- **Owner pre-fill vs. the owner picker.** §13.5 pre-fills owner = assignee, but the
  picker is fed by `listAssignableUsers()` (ACTIVE MIS_STAFF/MIS_ADMIN). Those sets
  legitimately diverge: deactivating a member releases their ISSUE tickets but
  deliberately NOT their requests, so a request can still be assigned to someone since
  deactivated or demoted. The prompt therefore **appends the assignee to the picker when
  they're missing** rather than dropping the default — otherwise the id matches no option,
  Radix renders the trigger BLANK while the form holds a valid uuid, and the system is
  logged with an owner nobody saw. (`createSystem` validates `ownerId` as a uuid, not as
  a member of any set.)
- **Hosts that don't supply the form's data** (the request *sheet* is a preview, not the
  detail) pass `owners`/`grantees` as **null**, and the prompt routes to the full detail
  instead of opening a form that would wrongly report "no grantees configured". null =
  not supplied; `[]` = genuinely none configured. The two must not be conflated.

### 13.6 Enforcement (as built)
- `lib/validators/systems.ts` — zod; enum values mirrored as const tuples so a client
  component never imports the DB driver (same convention as `lib/validators/user.ts`).
  `frontend_url` is validated as a real URL (stricter than `tickets.sheet_link`, which
  deliberately accepts a URL *or* a plain name), so the shared `isUrl` render guard
  never meets a row it must downgrade to text.
- `lib/actions/systems.ts` — every action re-checks permissions server-side via
  `getCurrentUser()` + typed `fail()` (actions never use the redirect-based
  `requireRole`, which is for pages).
- `lib/db/queries.ts` — `systemCodeSql` is the ONE place a code is generated.
- **The `canBuild` gate** (`isAdmin || (isStaff && isAssignee)`) mirrors `markComplete`
  exactly and is the gate for the §13.5 prompt. It is computed in BOTH
  `app/(app)/tickets/[number]/page.tsx` (to decide whether to fetch owners/grantees at
  all) and `components/tickets/request-detail.tsx` (to render the prompt). They must stay
  identical — if they ever diverge, the prompt renders without the data it needs.
- **`owners`/`grantees` are `null` when a host didn't supply them**, and `[]` when there
  genuinely are none. **Never conflate the two.** The request *sheet* is a preview and
  passes null, so the prompt routes to the full detail; passing `[]` there would open the
  form and wrongly announce "No access-grantees configured" (§13.4's fail-closed state)
  when the checklist is perfectly well configured.

> **KNOWN ISSUE — `systems.linked_ticket_id` is unindexed and non-unique
> (`docs/known-issues/0002`).** The §13.5 flag is a correlated subquery over that column,
> and nothing stops two systems linking to one request. Tracked, not fixed — both need a
> migration.

### 13.7 Numbering (correct from day one)
`systems.code` = `'SYS-' || lpad(n::text, greatest(3, length(n::text)), '0')` drawn
from the `system_seq` sequence — a scalar subquery, so `nextval()` runs exactly once
per insert. Unique; **never computed from a row count** (§9).

The width is `greatest(3, length(n))`, i.e. pad to a MINIMUM of three digits, so it
can never truncate: 1 → SYS-001, 999 → SYS-999, 1000 → SYS-1000, 12345 → SYS-12345.

> This deliberately does NOT repeat the tracked MIS-/REQ- ceiling
> (`docs/known-issues/0001`): `lpad(n, 3, '0')` TRUNCATES once the number outgrows the
> pad width — `lpad('1000',3,'0')` → `'100'`, which then collides on the unique index.
> `to_char(n, 'FM000')` is also wrong: it overflows to `'###'`. Both were verified
> against Postgres before choosing this expression. **This new sequence is correct at
> every scale; the ISSUE/REQUEST ceiling remains open and is tracked separately.**
