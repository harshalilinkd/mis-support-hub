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

export const signUpSchema = z.object({
  name: z.string().trim().min(1, "Enter your name").max(120),
  email: z.string().trim().toLowerCase().email("Enter a valid email"),
  password: z
    .string()
    .min(8, "Use at least 8 characters")
    .max(200, "Keep it under 200 characters"),
});
export type SignUpInput = z.infer<typeof signUpSchema>;

/** useActionState shape for the login/signup forms. */
export type AuthFormState = { error?: string };
