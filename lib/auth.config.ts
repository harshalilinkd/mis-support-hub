import type { NextAuthConfig, Session } from "next-auth";
import Google from "next-auth/providers/google";

import { isEmailDomainAllowed } from "./email-domains";

/**
 * Edge-safe Auth.js config: providers + callbacks that do NOT touch the DB.
 * The full config (adapter, DB-backed role lookup, Credentials provider) lives
 * in `lib/auth.ts`. Middleware imports this file so it stays lightweight at the
 * edge — no DB driver, no bcrypt.
 */
const useSecureCookies = process.env.NODE_ENV === "production";

export const authConfig = {
  // allowDangerousEmailAccountLinking: let a Google sign-in attach to an existing
  // account that has the same email (e.g. one created via email+password), instead
  // of failing with OAuthAccountNotLinked. Safe with Google because Google verifies
  // email ownership — so the same person can use either door on one account.
  providers: [Google({ allowDangerousEmailAccountLinking: true })],
  pages: {
    signIn: "/login",
    // Route auth errors to our own /login (which reads ?error= and shows friendly
    // copy) instead of Auth.js's default /api/auth/error page. This is what lets a
    // refused Google sign-in see "we've sent a request to the MIS team" (§7) rather
    // than a bare "You do not have permission to sign in."
    error: "/login",
  },
  session: { strategy: "jwt" },
  // App-specific cookie name so we never read a foreign/stale
  // `authjs.session-token` set by another app on localhost (ports share cookies).
  cookies: {
    sessionToken: {
      name: `${useSecureCookies ? "__Secure-" : ""}mis-hub.session-token`,
      options: {
        httpOnly: true,
        sameSite: "lax",
        path: "/",
        secure: useSecureCookies,
      },
    },
  },
  callbacks: {
    // Domain allowlist (CLAUDE.md §7). Empty list = allow any (local dev).
    signIn({ profile, user }) {
      const email = (profile?.email ?? user?.email ?? "").toLowerCase();
      if (!email) return false;
      return isEmailDomainAllowed(email);
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
