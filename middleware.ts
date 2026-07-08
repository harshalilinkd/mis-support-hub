import NextAuth from "next-auth";

import { authConfig } from "@/lib/auth.config";

// Edge middleware uses the DB-free config. It reads the JWT session cookie
// (signed by the full instance in lib/auth.ts) and redirects unauthenticated
// requests to /login via the `authorized` callback + pages.signIn.
export const { auth: middleware } = NextAuth(authConfig);

export const config = {
  matcher: [
    // Run on everything except Auth.js routes, the login page, Next internals,
    // and static files (anything with a file extension).
    "/((?!api/auth|login|_next/static|_next/image|favicon.ico|.*\\..*).*)",
  ],
};
