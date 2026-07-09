"use server";

import bcrypt from "bcryptjs";
import { AuthError } from "next-auth";

import { signIn, signOut } from "@/lib/auth";
import { createUserWithPassword, getUserByEmail } from "@/lib/db/queries";
import { isEmailDomainAllowed } from "@/lib/email-domains";
import {
  signInSchema,
  signUpSchema,
  type AuthFormState,
} from "@/lib/validators/auth";

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

/**
 * Self-service email + password sign-up. Enforces the same company-domain
 * allowlist as Google SSO (CLAUDE.md §7), rejects existing emails (never
 * overwrites a password on an account you don't control), creates a USER-role
 * account, then signs them in.
 */
export async function registerWithPassword(
  _prev: AuthFormState,
  formData: FormData
): Promise<AuthFormState> {
  const parsed = signUpSchema.safeParse({
    name: formData.get("name"),
    email: formData.get("email"),
    password: formData.get("password"),
  });
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Check the form and try again." };
  }
  const { name, email, password } = parsed.data;

  if (!isEmailDomainAllowed(email)) {
    return { error: "Use your approved company email address to sign up." };
  }

  const existing = await getUserByEmail(email);
  if (existing) {
    return { error: "An account with this email already exists — sign in instead." };
  }

  const passwordHash = await bcrypt.hash(password, 10);
  try {
    await createUserWithPassword({ name, email, passwordHash });
  } catch {
    // Unique-constraint race (two sign-ups at once) or a transient DB error.
    return { error: "Could not create the account. Please try again." };
  }

  try {
    await signIn("credentials", { email, password, redirectTo: "/" });
  } catch (error) {
    if (error instanceof AuthError) {
      // Account exists now, but auto sign-in failed — let them sign in manually.
      return { error: "Account created. Please sign in with your new password." };
    }
    throw error;
  }
  return {};
}
