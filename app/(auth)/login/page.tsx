import type { Metadata } from "next";
import type { Session } from "next-auth";
import { redirect } from "next/navigation";
import { Ticket } from "lucide-react";

import { auth, signIn } from "@/lib/auth";
import { CredentialsForm } from "@/components/auth/credentials-form";
import { GenerativeField } from "@/components/generative-field";
import { Button } from "@/components/ui/button";

export const metadata: Metadata = {
  title: "Sign in",
};

const ERROR_MESSAGES: Record<string, string> = {
  AccessDenied:
    "This Google account isn't permitted. Sign in with your approved company account.",
  Configuration:
    "Sign-in is misconfigured. Please contact the MIS team.",
  Verification: "That sign-in link is invalid or has expired.",
};

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  let session: Session | null = null;
  try {
    session = await auth();
  } catch {
    session = null;
  }
  if (session?.user) redirect("/");

  const { error } = await searchParams;
  const errorMessage = error
    ? (ERROR_MESSAGES[error] ?? "Something went wrong signing in. Please try again.")
    : null;

  return (
    <main className="relative grid min-h-screen place-items-center overflow-hidden bg-background p-6">
      {/*
        Generative flow-field background — filled in P9 (design-system.md §Generative
        accent): a deterministic, reduced-motion-aware canvas tinted with the cobalt
        accent, rendered here behind the card. Left as an empty slot for now.
      */}
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 -z-10"
      >
        <GenerativeField seed={42} density={850} />
      </div>

      <div className="relative w-full max-w-sm space-y-6 rounded-[var(--radius-card)] border border-border bg-surface p-8 text-center shadow-[var(--shadow-elevation)]">
        <div className="space-y-2">
          <div className="mx-auto flex size-10 items-center justify-center rounded-[var(--radius-input)] bg-accent-soft text-primary">
            <Ticket className="size-5" />
          </div>
          <h1 className="font-display text-2xl font-semibold">MIS Support Hub</h1>
          <p className="text-sm text-text-muted">
            Sign in with your company Google account to raise and track tickets.
          </p>
        </div>

        {errorMessage ? (
          <p
            role="alert"
            className="rounded-[var(--radius-input)] border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive"
          >
            {errorMessage}
          </p>
        ) : null}

        <form
          action={async () => {
            "use server";
            await signIn("google", { redirectTo: "/" });
          }}
        >
          <Button type="submit" className="w-full">
            Continue with Google
          </Button>
        </form>

        <div className="flex items-center gap-3">
          <span className="h-px flex-1 bg-border" />
          <span className="text-xs text-text-muted">or</span>
          <span className="h-px flex-1 bg-border" />
        </div>

        <CredentialsForm />

        <p className="text-xs text-text-muted">
          Access is restricted to approved company domains.
        </p>
      </div>
    </main>
  );
}
