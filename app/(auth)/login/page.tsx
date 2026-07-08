import type { Metadata } from "next";
import { redirect } from "next/navigation";

import { auth, signIn } from "@/lib/auth";
import { Button } from "@/components/ui/button";

export const metadata: Metadata = {
  title: "Sign in",
};

export default async function LoginPage() {
  const session = await auth();
  if (session?.user) redirect("/");

  return (
    <div className="grid min-h-screen place-items-center bg-background p-6">
      <div className="w-full max-w-sm space-y-6 rounded-[var(--radius-card)] border border-border bg-surface p-8 text-center shadow-[var(--shadow-elevation)]">
        <div className="space-y-1.5">
          <h1 className="font-display text-2xl font-semibold">
            MIS Support Hub
          </h1>
          <p className="text-sm text-text-muted">
            Sign in with your company Google account to raise and track tickets.
          </p>
        </div>
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
      </div>
    </div>
  );
}
