# MIS Support Hub

Internal MIS support ticketing app for the LINKD textile group. Employees raise
tickets for system/sheet/app issues; the MIS team owns, works, and resolves them.
Replaces a Google Form + Sheet.

> The architecture, data model, roles, and conventions are locked in
> [`CLAUDE.md`](./CLAUDE.md). The visual system is locked in
> [`design-system.md`](./design-system.md). Read both before changing anything.

## Stack

| Concern | Choice |
| --- | --- |
| Framework | Next.js 15 (App Router, Server Actions), TypeScript strict |
| Database | Neon Postgres + Drizzle ORM (`drizzle-orm/neon-http`) |
| Auth | Auth.js v5 (`next-auth@beta`), Google SSO only, domain-restricted |
| UI | Tailwind CSS v4 + shadcn/ui + lucide-react |
| Files | Vercel Blob |
| Email | Resend (in-app toast via `sonner`; WhatsApp is a stubbed provider) |
| Kanban | `@dnd-kit/core` + `@dnd-kit/sortable` |
| Forms | `react-hook-form` + `zod` |

## Getting started

```bash
# 1. Install dependencies
npm install

# 2. Configure environment
cp .env.example .env.local   # then fill in the values (see below)

# 3. Create the database schema on Neon
npm run db:generate          # emit SQL migration from lib/db/schema.ts
npm run db:migrate           # apply it to DATABASE_URL

# 4. Run
npm run dev                  # http://localhost:3000
```

## Environment variables

See [`.env.example`](./.env.example). Required for a full run:

| Var | Notes |
| --- | --- |
| `DATABASE_URL` | Neon pooled connection string |
| `AUTH_SECRET` | `npx auth secret` |
| `AUTH_GOOGLE_ID` / `AUTH_GOOGLE_SECRET` | Google OAuth Web client. Redirect URI: `{NEXT_PUBLIC_APP_URL}/api/auth/callback/google` |
| `ALLOWED_EMAIL_DOMAINS` | Comma-separated Workspace domains. Empty = allow any (dev only) |
| `ADMIN_EMAILS` | Comma-separated emails bootstrapped to `MIS_ADMIN` |
| `BLOB_READ_WRITE_TOKEN` | Vercel Blob store token |
| `RESEND_API_KEY` / `EMAIL_FROM` | Email. Unset = emails skipped (non-fatal) |
| `NEXT_PUBLIC_APP_URL` | Public base URL |

## Notifications

Events fan out through a channel-agnostic dispatcher in
[`lib/notifications`](./lib/notifications): every resolution/assignment/comment
writes an **in-app** notification (the topbar bell) and, where applicable, sends
**email** via Resend. All sends are best-effort — a failure is logged and never
rolls back the DB mutation.

**Email (Resend) setup**

1. Create a Resend account and **add + verify your sending domain** (Resend →
   Domains → add DNS records: SPF/DKIM). For local testing you can use Resend's
   `onboarding@resend.dev` sender without a domain.
2. Create an API key and set env vars:
   - `RESEND_API_KEY` — the API key.
   - `EMAIL_FROM` — e.g. `MIS Support <support@yourdomain.com>` (must be on the
     verified domain in production).
   - `NEXT_PUBLIC_APP_URL` — used to build the "View ticket" links in emails.
3. If `RESEND_API_KEY` is unset, emails are skipped (in-app notifications still
   work).

**WhatsApp** is a stubbed provider ([`lib/notifications/whatsapp.ts`](./lib/notifications/whatsapp.ts))
that logs intent only. It implements the same `NotificationProvider` interface, so
wiring the real **WhatsApp Business (Cloud) API** is a drop-in replacement — see
the `TODO(P-later)` in that file (needs `WHATSAPP_TOKEN` / `WHATSAPP_PHONE_NUMBER_ID`
env vars and a phone field on `users`).

## Deploy to Vercel

### 1. Provision the external services

- **Database (Neon).** You can reuse the current Neon database or create a fresh
  project/branch for production. Copy the **pooled** connection string
  (`...-pooler...`, `?sslmode=require`).
- **Google OAuth.** [Google Cloud Console](https://console.cloud.google.com) →
  APIs & Services → Credentials → *Create OAuth client ID* → **Web application**.
  You'll add the redirect URI in step 4 once you know the domain. Copy the
  **Client ID** and **Client secret**.
- **Vercel Blob.** In the Vercel project → Storage → *Create* → **Blob**. This
  auto-adds `BLOB_READ_WRITE_TOKEN` to the project.
- **Resend (email, optional).** Create an API key and verify your sending domain
  (Resend → Domains). Without a key, emails are skipped (in-app still works).

### 2. Import the repo into Vercel

New Project → Import `harshalilinkd/mis-support-hub`. Framework preset **Next.js**
is auto-detected (build `next build`, output handled automatically). Don't deploy
yet — set env vars first.

### 3. Set environment variables (Project → Settings → Environment Variables)

| Var | Value |
| --- | --- |
| `DATABASE_URL` | Neon pooled connection string |
| `AUTH_SECRET` | generate a fresh one: `npx auth secret` (don't reuse the dev value) |
| `AUTH_GOOGLE_ID` / `AUTH_GOOGLE_SECRET` | from the Google OAuth client |
| `ALLOWED_EMAIL_DOMAINS` | your Workspace domain(s), comma-separated, e.g. `linkd.com` (**required in prod** — empty allows any Google account) |
| `ADMIN_EMAILS` | comma-separated emails that become `MIS_ADMIN` on first sign-in (put yourself here) |
| `BLOB_READ_WRITE_TOKEN` | added automatically when you create the Blob store |
| `RESEND_API_KEY` / `EMAIL_FROM` | Resend key + a `From` on your verified domain |
| `NEXT_PUBLIC_APP_URL` | your production URL (set after the first deploy, then redeploy) |

Do **not** set `DEV_AUTH_STUB` / `DEV_STUB_ROLE` / `DEV_STUB_ID` in production —
the stub is `NODE_ENV`-gated and never runs in a production build anyway.

### 4. Apply migrations to the production database

If you're using a fresh Neon DB, run the migrations from your machine against it:

```bash
# with the production DATABASE_URL in .env.local (or exported):
npm run db:migrate
```

(The existing Neon database is already migrated.)

### 5. Deploy, then wire the domain

1. Click **Deploy**. Note the assigned URL (e.g. `https://mis-support-hub.vercel.app`).
2. Set `NEXT_PUBLIC_APP_URL` to that URL and **redeploy**.
3. In the Google OAuth client add:
   - **Authorized JavaScript origin:** `https://<your-domain>`
   - **Authorized redirect URI:** `https://<your-domain>/api/auth/callback/google`

### 6. Go-live checklist

- Sign in with an email in `ADMIN_EMAILS` → you land on the dashboard as `MIS_ADMIN`.
- Confirm `ALLOWED_EMAIL_DOMAINS` is set so only your org can sign in.
- Upload a screenshot on a ticket to confirm Blob works; resolve a ticket to
  confirm email (if Resend is configured).
- Reset seed/test data anytime with `npm run db:clean`.

## Scripts

| Script | Does |
| --- | --- |
| `npm run dev` | Dev server |
| `npm run build` / `npm start` | Production build / serve |
| `npm run lint` | ESLint (next) |
| `npm run typecheck` | `tsc --noEmit` |
| `npm run db:generate` | Generate a Drizzle migration from the schema |
| `npm run db:migrate` | Apply migrations to the database |
| `npm run db:push` | Push schema directly (dev convenience) |
| `npm run db:studio` | Drizzle Studio |

## Project layout

```
app/            route groups: (auth) login · (app) shell + pages · api/*
components/     ui/ (shadcn) · shell/ (sidebar, topbar, theme)
lib/db/         schema.ts · index.ts (neon-http client) · queries.ts · migrations/
lib/auth*.ts    edge-safe config + full config (Drizzle adapter, Google)
lib/actions/    Server Actions (per domain) — return { ok, data } | { ok, error }
lib/notifications/  channel-agnostic notify() · email (Resend) · whatsapp (stub)
lib/validators/ zod schemas
middleware.ts   protects /(app) routes → /login
```

## Build phases

This app is built in phases **P0 → P9** (see the prompt book). **P0 (this
scaffold)** ships the stack, schema, auth, notification contract, design tokens,
and the app shell with placeholder pages. Feature work lands in P1+.

### Known follow-ups from P0
- **Google OAuth** credentials are not set yet — sign-in is wired but needs
  `AUTH_GOOGLE_ID` / `AUTH_GOOGLE_SECRET` to function.
- **Cabinet Grotesk** (Fontshare display face) is not bundled yet; `--font-display`
  falls back to Hanken Grotesk until the local font files are added.
- Pages under `/(app)` are on-brand placeholders; tables, board, forms, and the
  ticket detail come in later phases.
