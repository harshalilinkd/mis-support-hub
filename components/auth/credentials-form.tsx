"use client";

import { useActionState } from "react";
import { Loader2 } from "lucide-react";

import { signInWithPassword } from "@/lib/actions/auth";
import type { AuthFormState } from "@/lib/validators/auth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

function FieldLabel({
  htmlFor,
  children,
}: {
  htmlFor: string;
  children: React.ReactNode;
}) {
  return (
    <label
      htmlFor={htmlFor}
      className="mb-1 block text-xs font-medium text-text-muted"
    >
      {children}
    </label>
  );
}

/**
 * Email + password sign-in — the second door alongside Google SSO (§7).
 *
 * Sign-IN only. This form used to have a "Create an account" mode, which let any
 * stranger mint their own active USER row and walk in; the app is invite-only, so
 * accounts come from an MIS_ADMIN in Settings → Users and a password is set in
 * Profile. Don't add a sign-up mode back.
 */
export function CredentialsForm() {
  const [state, formAction, pending] = useActionState<AuthFormState, FormData>(
    signInWithPassword,
    {}
  );

  return (
    <form action={formAction} className="space-y-3 text-left">
      <div>
        <FieldLabel htmlFor="email">Email</FieldLabel>
        <Input
          id="email"
          name="email"
          type="email"
          autoComplete="email"
          placeholder="you@company.com"
          required
          disabled={pending}
        />
      </div>

      <div>
        <FieldLabel htmlFor="password">Password</FieldLabel>
        <Input
          id="password"
          name="password"
          type="password"
          autoComplete="current-password"
          placeholder="Your password"
          required
          disabled={pending}
        />
      </div>

      {state?.error ? (
        <p role="alert" className="text-xs text-destructive">
          {state.error}
        </p>
      ) : null}

      <Button type="submit" variant="outline" className="w-full" disabled={pending}>
        {pending ? <Loader2 className="animate-spin" /> : null}
        Sign in
      </Button>
    </form>
  );
}
