import { DrizzleAdapter } from "@auth/drizzle-adapter";
import bcrypt from "bcryptjs";
import { eq } from "drizzle-orm";
import NextAuth from "next-auth";
import Credentials from "next-auth/providers/credentials";

import { authConfig } from "./auth.config";
import { db } from "./db";
import { getUserByEmail, getUserById } from "./db/queries";
import { accounts, sessions, users, verificationTokens } from "./db/schema";
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
