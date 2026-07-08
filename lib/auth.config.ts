import type { NextAuthConfig, Session } from "next-auth";
import Google from "next-auth/providers/google";

/**
 * Edge-safe Auth.js config: providers + callbacks that do NOT touch the DB.
 * The full config (adapter, DB-backed role lookup) lives in `lib/auth.ts`.
 * Middleware imports this file so it stays lightweight at the edge.
 */
const allowedDomains = (process.env.ALLOWED_EMAIL_DOMAINS ?? "")
  .split(",")
  .map((d) => d.trim().toLowerCase())
  .filter(Boolean);

export const authConfig = {
  providers: [Google],
  pages: {
    signIn: "/login",
  },
  session: { strategy: "jwt" },
  callbacks: {
    // Domain allowlist (CLAUDE.md §7). Empty list = allow any (local dev).
    signIn({ profile, user }) {
      const email = (profile?.email ?? user?.email ?? "").toLowerCase();
      if (!email) return false;
      if (allowedDomains.length === 0) return true;
      const domain = email.split("@")[1] ?? "";
      return allowedDomains.includes(domain);
    },
    // Pass-through at the edge; the DB-backed role is set in lib/auth.ts.
    jwt({ token, user }) {
      if (user) {
        token.id = user.id;
        if ("role" in user && user.role) {
          token.role = user.role;
        }
      }
      return token;
    },
    session({ session, token }) {
      if (session.user) {
        session.user.id = (token.id as string) ?? session.user.id;
        session.user.role = (token.role as Session["user"]["role"]) ?? "USER";
      }
      return session;
    },
    // Used by middleware: allow only authenticated requests through.
    authorized({ auth }) {
      return !!auth?.user;
    },
  },
} satisfies NextAuthConfig;
