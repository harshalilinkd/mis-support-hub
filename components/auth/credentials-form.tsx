"use client";

import { useActionState, useState } from "react";
import { Loader2 } from "lucide-react";

import {
  registerWithPassword,
  signInWithPassword,
} from "@/lib/actions/auth";
import type { AuthFormState } from "@/lib/validators/auth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

type Mode = "signin" | "signup";

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

/** The actual form — remounted (via `key`) when the mode flips, so a stale
 * error from the other mode doesn't linger. */
function CredentialsFields({ mode }: { mode: Mode }) {
  const action =
    mode === "signin" ? signInWithPassword : registerWithPassword;
  const [state, formAction, pending] = useActionState<AuthFormState, FormData>(
    action,
    {}
  );

  return (
    <form action={formAction} className="space-y-3 text-left">
      {mode === "signup" ? (
        <div>
          <FieldLabel htmlFor="name">Name</FieldLabel>
          <Input
            id="name"
            name="name"
            autoComplete="name"
            placeholder="Your full name"
            required
            disabled={pending}
          />
        </div>
      ) : null}

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
          autoComplete={mode === "signin" ? "current-password" : "new-password"}
          placeholder={mode === "signup" ? "At least 8 characters" : "Your password"}
          required
          minLength={mode === "signup" ? 8 : undefined}
          disabled={pending}
        />
      </div>

      {state?.error ? (
        <p role="alert" className="text-xs text-destructive">
          {state.error}
        </p>
      ) : null}

      <Button
        type="submit"
        variant="outline"
        className="w-full"
        disabled={pending}
      >
        {pending ? <Loader2 className="animate-spin" /> : null}
        {mode === "signin" ? "Sign in" : "Create account"}
      </Button>
    </form>
  );
}

export function CredentialsForm() {
  const [mode, setMode] = useState<Mode>("signin");

  return (
    <div className="space-y-3">
      <CredentialsFields key={mode} mode={mode} />

      <p className="text-center text-xs text-text-muted">
        {mode === "signin" ? (
          <>
            New here?{" "}
            <button
              type="button"
              onClick={() => setMode("signup")}
              className="font-medium text-primary hover:underline"
            >
              Create an account
            </button>
          </>
        ) : (
          <>
            Already have an account?{" "}
            <button
              type="button"
              onClick={() => setMode("signin")}
              className="font-medium text-primary hover:underline"
            >
              Sign in
            </button>
          </>
        )}
      </p>
    </div>
  );
}
