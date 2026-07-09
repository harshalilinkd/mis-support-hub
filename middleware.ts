import NextAuth from "next-auth";
import { NextResponse } from "next/server";

import { authConfig } from "@/lib/auth.config";
import { DEV_STUB_ENABLED } from "@/lib/dev-session";

// Edge middleware uses the DB-free config. It reads the JWT session cookie
// (signed by the full instance in lib/auth.ts) and redirects unauthenticated
// requests to /login via the `authorized` callback + pages.signIn.
const { auth } = NextAuth(authConfig);

// In dev with DEV_AUTH_STUB=true, bypass auth entirely so the shell renders
// without Google OAuth. This branch can never run in production (see dev-session).
export default DEV_STUB_ENABLED
  ? function middleware() {
      return NextResponse.next();
    }
  : auth;

export const config = {
  matcher: [
    // Run on PAGES only — never API routes (they do their own auth and must
    // return JSON, not a login redirect; the client-upload POST to /api/upload
    // broke when the middleware redirected it). Also skip the login page, Next
    // internals, and static files (anything with a file extension).
    "/((?!api|login|_next/static|_next/image|favicon.ico|.*\\..*).*)",
  ],
};
