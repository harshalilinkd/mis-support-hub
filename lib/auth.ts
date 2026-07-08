import { DrizzleAdapter } from "@auth/drizzle-adapter";
import { eq } from "drizzle-orm";
import NextAuth from "next-auth";

import { authConfig } from "./auth.config";
import { db } from "./db";
import { getUserById } from "./db/queries";
import {
  accounts,
  sessions,
  users,
  verificationTokens,
} from "./db/schema";

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
  events: {
    // Bootstrap: promote configured emails to MIS_ADMIN on first sign-in.
    async createUser({ user }) {
      if (
        user.id &&
        user.email &&
        adminEmails.includes(user.email.toLowerCase())
      ) {
        await db
          .update(users)
          .set({ role: "MIS_ADMIN" })
          .where(eq(users.id, user.id));
      }
    },
  },
  callbacks: {
    ...authConfig.callbacks,
    // Node runtime: read the authoritative role from the DB on sign-in.
    async jwt({ token, user }) {
      if (user?.id) {
        const dbUser = await getUserById(user.id);
        token.id = user.id;
        token.role = dbUser?.role ?? "USER";
      }
      return token;
    },
  },
});
