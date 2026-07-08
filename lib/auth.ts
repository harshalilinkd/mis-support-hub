import { DrizzleAdapter } from "@auth/drizzle-adapter";
import { eq } from "drizzle-orm";
import NextAuth from "next-auth";

import { authConfig } from "./auth.config";
import { db } from "./db";
import { getUserByEmail, getUserById } from "./db/queries";
import { accounts, sessions, users, verificationTokens } from "./db/schema";

const adminEmails = (process.env.ADMIN_EMAILS ?? "")
  .split(",")
  .map((e) => e.trim().toLowerCase())
  .filter(Boolean);

export const { handlers, auth, signIn, signOut } = NextAuth({
  ...authConfig,
  adapter: DrizzleAdapter(db, {
    usersTable: users,
    accountsTable: accounts,
    sessionsTable: sessions,
    verificationTokensTable: verificationTokens,
  }),
  callbacks: {
    ...authConfig.callbacks,
    // Full (Node-runtime) sign-in gate: domain allowlist (edge-safe) + is_active.
    async signIn(params) {
      const domainOk = await authConfig.callbacks!.signIn!(params);
      if (domainOk === false) return false;
      const email = (
        params.profile?.email ??
        params.user?.email ??
        ""
      ).toLowerCase();
      // New users (no row yet) default to active; only block known-inactive users.
      const dbUser = email ? await getUserByEmail(email) : null;
      if (dbUser && !dbUser.isActive) return false;
      return true;
    },
    // Read the authoritative role from the DB on sign-in, and (idempotently)
    // promote ADMIN_EMAILS to MIS_ADMIN on every sign-in — matches CLAUDE.md §7
    // "on upsert" and avoids the create-only provisioning deadlock.
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
