"use server";

import { AuthError } from "next-auth";

import { signIn, signOut } from "@/lib/auth";
import { signInSchema, type AuthFormState } from "@/lib/validators/auth";

/**
 * There is deliberately NO self-service sign-up here (§7). The app is invite-only:
 * accounts are created by an MIS_ADMIN in Settings → Users, and a user sets or
 * changes their own password in Profile once they're in.
 *
 * A `registerWithPassword` action used to live here and defeated the whole gate.
 * The invite check in lib/auth.ts asks "does a users row exist?" — and this was a
 * public, unauthenticated way to make one exist, so any stranger could mint their
 * own active USER row and sign straight in. It leaned on the domain allowlist,
 * which is empty by design (see §7: this org signs in with personal Gmail, so a
 * domain list can never be the gate). Do not reintroduce it.
 */

export async function signOutAction() {
  await signOut({ redirectTo: "/login" });
}

/**
 * Email + password sign-in. On success, signIn() throws NEXT_REDIRECT (which we
 * must let propagate); on bad credentials Auth.js throws AuthError, which we
 * turn into a friendly message for useActionState. (CLAUDE.md §7 — passwords
 * are an additional door alongside Google SSO.)
 */
export async function signInWithPassword(
  _prev: AuthFormState,
  formData: FormData
): Promise<AuthFormState> {
  const parsed = signInSchema.safeParse({
    email: formData.get("email"),
    password: formData.get("password"),
  });
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Enter your email and password." };
  }

  try {
    await signIn("credentials", {
      email: parsed.data.email,
      password: parsed.data.password,
      redirectTo: "/",
    });
  } catch (error) {
    if (error instanceof AuthError) {
      return { error: "Invalid email or password." };
    }
    throw error; // NEXT_REDIRECT and other control-flow errors must bubble up.
  }
  return {};
}

