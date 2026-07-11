"use client";

import { useState, useTransition } from "react";
import { toast } from "sonner";

import { changeMyPassword } from "@/lib/actions/users";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

/**
 * Self-service password change on the profile. If the account already has a
 * password, the current one is required; a Google-only account can set one here.
 */
export function ChangePasswordCard({ hasPassword }: { hasPassword: boolean }) {
  const [current, setCurrent] = useState("");
  const [next, setNext] = useState("");
  const [confirm, setConfirm] = useState("");
  const [pending, startTransition] = useTransition();

  function submit() {
    if (next.length < 8) {
      toast.error("New password must be at least 8 characters.");
      return;
    }
    if (next !== confirm) {
      toast.error("The new passwords don't match.");
      return;
    }
    if (hasPassword && !current) {
      toast.error("Enter your current password.");
      return;
    }
    startTransition(async () => {
      const res = await changeMyPassword({
        currentPassword: hasPassword ? current : undefined,
        newPassword: next,
      });
      if (!res.ok) {
        toast.error(res.error);
        return;
      }
      toast.success(hasPassword ? "Password changed" : "Password set");
      setCurrent("");
      setNext("");
      setConfirm("");
    });
  }

  return (
    <div className="rounded-[var(--radius-card)] border border-border bg-surface p-5 shadow-[var(--shadow-elevation)]">
      <h2 className="text-sm font-semibold">Password</h2>
      <p className="mt-0.5 text-xs text-text-muted">
        {hasPassword
          ? "Change the password you use for email + password sign-in."
          : "Set a password to also sign in with email + password (in addition to Google)."}
      </p>

      <div className="mt-4 space-y-3">
        {hasPassword ? (
          <div>
            <label htmlFor="cur-pw" className="mb-1 block text-sm font-medium">
              Current password
            </label>
            <Input
              id="cur-pw"
              type="password"
              value={current}
              onChange={(e) => setCurrent(e.target.value)}
              autoComplete="current-password"
              disabled={pending}
            />
          </div>
        ) : null}
        <div>
          <label htmlFor="new-pw" className="mb-1 block text-sm font-medium">
            New password
          </label>
          <Input
            id="new-pw"
            type="password"
            value={next}
            onChange={(e) => setNext(e.target.value)}
            autoComplete="new-password"
            placeholder="At least 8 characters"
            disabled={pending}
          />
        </div>
        <div>
          <label htmlFor="cf-pw" className="mb-1 block text-sm font-medium">
            Confirm new password
          </label>
          <Input
            id="cf-pw"
            type="password"
            value={confirm}
            onChange={(e) => setConfirm(e.target.value)}
            autoComplete="new-password"
            disabled={pending}
          />
        </div>
        <div className="flex justify-end">
          <Button
            onClick={submit}
            disabled={pending || !next || !confirm || (hasPassword && !current)}
          >
            {pending
              ? "Saving…"
              : hasPassword
                ? "Change password"
                : "Set password"}
          </Button>
        </div>
      </div>
    </div>
  );
}
