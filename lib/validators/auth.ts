import { z } from "zod";

/**
 * Email + password auth schemas (CLAUDE.md §7 additional door — Google SSO
 * stays the primary provider). Kept out of the DB-coupled validators so they
 * can be imported into the login client component.
 */
export const signInSchema = z.object({
  email: z.string().trim().toLowerCase().email("Enter a valid email"),
  password: z.string().min(1, "Enter your password"),
});
export type SignInInput = z.infer<typeof signInSchema>;

// No signUpSchema: the app is invite-only (§7), so there is no self-service sign-up
// to validate. Admins create accounts in Settings → Users (see lib/validators/user.ts).

/** useActionState shape for the login form. */
export type AuthFormState = { error?: string };
