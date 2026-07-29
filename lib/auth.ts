import { DrizzleAdapter } from "@auth/drizzle-adapter";
import bcrypt from "bcryptjs";
import { eq } from "drizzle-orm";
import NextAuth from "next-auth";
import Credentials from "next-auth/providers/credentials";

import { authConfig } from "./auth.config";
import { canSignIn, shouldRequestAccess } from "./auth-gate";
import { db } from "./db";
import { getUserByEmail, getUserById, recordAccessRequest } from "./db/queries";
import { accounts, sessions, users, verificationTokens } from "./db/schema";
import { sendAccessRequestedNotification } from "./notifications";
import { signInSchema } from "./validators/auth";

const adminEmails = (process.env.ADMIN_EMAILS ?? "")
  .split(",")
  .map((e) => e.trim().toLowerCase())
  .filter(Boolean);

export const { handlers, auth, signIn, signOut } = NextAuth({
  ...authConfig,
  // Google (from the edge config) + email/password. The Credentials provider
  // lives ONLY here (Node runtime) so bcrypt/DB never leak into edge middleware.
  providers: [
    ...authConfig.providers,
    Credentials({
      credentials: {
        email: { label: "Email", type: "email" },
        password: { label: "Password", type: "password" },
      },
      async authorize(credentials) {
        const parsed = signInSchema.safeParse(credentials);
        if (!parsed.success) return null;
        const { email, password } = parsed.data;
        const dbUser = await getUserByEmail(email);
        // No account, no password set (Google-only), or deactivated → reject.
        if (!dbUser || !dbUser.passwordHash || !dbUser.isActive) return null;
        const valid = await bcrypt.compare(password, dbUser.passwordHash);
        if (!valid) return null;
        return {
          id: dbUser.id,
          email: dbUser.email,
          name: dbUser.name,
          image: dbUser.image,
          role: dbUser.role,
        };
      },
    }),
  ],
  adapter: DrizzleAdapter(db, {
    usersTable: users,
    accountsTable: accounts,
    sessionsTable: sessions,
    verificationTokensTable: verificationTokens,
  }),
  callbacks: {
    ...authConfig.callbacks,
    /**
     * Full (Node-runtime) sign-in gate: the app is INVITE-ONLY (§7).
     *
     * Why not the domain allowlist alone: it cannot gate this organisation. The
     * team signs in with personal Gmail (not a Workspace domain), so
     * ALLOWED_EMAIL_DOMAINS="gmail.com" would admit roughly every Google account
     * alive, and leaving it empty admits everyone. Either way it's the same open
     * door, and an unknown account used to self-provision a USER row here.
     *
     * So membership — not the domain — is the gate: you may sign in if an admin
     * already created your account (Settings → Users), and the domain allowlist
     * stays on top as an optional extra filter for the day this moves to Workspace.
     *
     * ADMIN_EMAILS is the bootstrap: those addresses may still self-provision, or a
     * fresh deployment with an empty users table could admit nobody at all — an
     * unrecoverable lockout, since the only way in would be the UI you can't reach.
     */
    async signIn(params) {
      const email = (
        params.profile?.email ??
        params.user?.email ??
        ""
      ).toLowerCase();
      // The optional ALLOWED_EMAIL_DOMAINS filter (edge-safe, no DB). Its result is
      // handed to canSignIn rather than short-circuiting here, so the ADMIN_EMAILS
      // bootstrap can be exempted from it — see lib/auth-gate.ts.
      const domainAllowed = (await authConfig.callbacks!.signIn!(params)) !== false;
      // The decision itself is a pure, unit-tested function (lib/auth-gate.ts) —
      // this callback only gathers the facts.
      const dbUser = email ? await getUserByEmail(email) : null;
      const allowed = canSignIn({ email, user: dbUser, adminEmails, domainAllowed });
      if (allowed) return true;

      // Refused — but a genuinely-new Google account is offered the request-to-join
      // path (§7): record a PENDING request and alert the admins, then STILL deny.
      // Recording writes to access_requests, never `users`, so §7's guarantee that a
      // login attempt mints no account is untouched. Wrapped best-effort: a failure
      // here must never turn a denied sign-in into a thrown error page.
      const provider = params.account?.provider ?? "";
      if (
        shouldRequestAccess({ provider, email, user: dbUser, adminEmails, domainAllowed })
      ) {
        try {
          const name =
            params.profile?.name ?? params.user?.name ?? null;
          const image =
            (params.profile?.picture as string | undefined) ??
            params.user?.image ??
            null;
          const { created } = await recordAccessRequest({ email, name, image });
          // Notify admins only when a NEW request appears — not on every repeat login
          // while it's still pending.
          if (created) {
            await sendAccessRequestedNotification({ email, name });
          }
        } catch (e) {
          console.error("[signIn:recordAccessRequest]", e);
        }
      }
      // The login page reads error=AccessDenied and now explains the request path.
      return false;
    },
    // Read the authoritative role from the DB on sign-in, and (idempotently)
    // promote ADMIN_EMAILS to MIS_ADMIN on every sign-in — matches CLAUDE.md §7
    // "on upsert", avoids the create-only provisioning deadlock, and never
    // downgrades an existing higher role (we only ever bump up to MIS_ADMIN).
    async jwt({ token, user }) {
      if (user?.id) {
        let dbUser = await getUserById(user.id);
        if (
          dbUser &&
          dbUser.role !== "MIS_ADMIN" &&
          dbUser.email &&
          adminEmails.includes(dbUser.email.toLowerCase())
        ) {
          await db
            .update(users)
            .set({ role: "MIS_ADMIN" })
            .where(eq(users.id, user.id));
          dbUser = { ...dbUser, role: "MIS_ADMIN" };
        }
        token.id = user.id;
        token.role = dbUser?.role ?? "USER";
      }
      return token;
    },
  },
});
