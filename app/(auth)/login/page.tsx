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
  // Invite-only (§7). A first-time Google sign-in now ALSO files an access request
  // for an admin to approve (recorded server-side on this denied attempt), so the
  // copy points at that path rather than just refusing. A deactivated member sees the
  // same message; "if this is your first time" keeps it accurate for both.
  AccessDenied:
    "This account doesn't have access yet. If this is your first time signing in with Google, we've sent a request to the MIS team — you'll get an email once an admin approves it.",
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
        The ONE generative accent (design-system.md §9): a deterministic seeded
        flow-field, cobalt-tinted at low opacity, strictly behind the card.
        NOTE: this must NOT be `-z-10`. <main> is `position:relative; z-index:auto`,
        so it creates no stacking context — a negative-z child paints behind main's
        own `bg-background` and the field disappears. z-0 here + z-10 on the card
        keeps the layering honest.
      */}
      <div aria-hidden className="pointer-events-none absolute inset-0 z-0">
        <GenerativeField seed={42} density={850} />
      </div>

      {/* Card is fully opaque (bg-surface), so all text sits on solid surface — the
          field can never eat into text contrast. Entrance = motion rule #1 only. */}
      <div className="enter-up relative z-10 w-full max-w-sm space-y-6 rounded-[var(--radius-card)] border border-border bg-surface px-8 py-10 text-center shadow-[var(--shadow-popover)]">
        <div className="enter-up space-y-2" style={{ animationDelay: "60ms" }}>
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
          className="enter-up"
          style={{ animationDelay: "120ms" }}
          action={async () => {
            "use server";
            await signIn("google", { redirectTo: "/" });
          }}
        >
          <Button type="submit" className="w-full">
            Continue with Google
          </Button>
        </form>

        <div className="enter-up flex items-center gap-3" style={{ animationDelay: "180ms" }}>
          <span className="h-px flex-1 bg-border" />
          <span className="text-xs text-text-muted">or</span>
          <span className="h-px flex-1 bg-border" />
        </div>

        <div className="enter-up" style={{ animationDelay: "220ms" }}>
          <CredentialsForm />
        </div>

        <p className="enter-up text-xs text-text-muted" style={{ animationDelay: "280ms" }}>
          New here? Sign in with Google and the MIS team will be asked to approve your
          access.
        </p>
      </div>
    </main>
  );
}
