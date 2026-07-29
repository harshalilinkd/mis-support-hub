"use client";

import { useState, useTransition } from "react";
import { Plus, UserMinus } from "lucide-react";
import { toast } from "sonner";

import { addGrantee, deactivateGrantee } from "@/lib/actions/systems";
import type { AccessGrantee } from "@/lib/db/schema";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

/**
 * Access-grantee config (§13.3) — MIS_ADMIN only, gated at the page.
 *
 * This list is what §13.4's hard rule is quantified over: every ACTIVE grantee must
 * be confirmed before a system can be logged, and with NO active grantees the server
 * refuses to log anything at all. So deactivating the last one blocks the directory
 * rather than silently waving systems through — the warning below says so.
 */
export function GranteesView({ grantees }: { grantees: AccessGrantee[] }) {
  const [label, setLabel] = useState("");
  const [pending, startTransition] = useTransition();

  const activeCount = grantees.filter((g) => g.isActive).length;

  const add = () => {
    const value = label.trim();
    if (!value) return;
    startTransition(async () => {
      const res = await addGrantee(value);
      if (!res.ok) {
        toast.error(res.error);
        return;
      }
      toast.success(`${value} added`);
      setLabel("");
    });
  };

  const remove = (g: AccessGrantee) => {
    startTransition(async () => {
      const res = await deactivateGrantee(g.id);
      if (!res.ok) {
        toast.error(res.error);
        return;
      }
      toast.success(`${g.label} deactivated`);
    });
  };

  return (
    <div className="space-y-4">
      <div className="rounded-[var(--radius-card)] border border-border bg-surface p-4 shadow-[var(--shadow-elevation)]">
        <h2 className="text-sm font-semibold">Add a grantee</h2>
        <p className="mt-1 text-xs text-text-muted">
          These are people who must be given access to every system MIS builds (e.g.
          shared on the Sheet) — <strong>not</strong> app users. A system can&apos;t be
          logged in the directory until each active name here is confirmed.
        </p>
        <div className="mt-3 flex gap-2">
          <Input
            value={label}
            onChange={(e) => setLabel(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                add();
              }
            }}
            placeholder="e.g. Naushi Ma'am"
            disabled={pending}
            aria-label="Grantee name"
          />
          <Button onClick={add} disabled={pending || !label.trim()} className="shrink-0">
            <Plus className="size-4" /> Add
          </Button>
        </div>
      </div>

      {activeCount === 0 ? (
        <div className="rounded-[var(--radius-input)] border border-border bg-surface-muted px-3 py-2 text-sm text-text-muted">
          <span className="font-medium text-foreground">No active grantees.</span> Systems
          cannot be logged until at least one exists — the sharing checklist is what makes
          the record accountable.
        </div>
      ) : null}

      <div className="overflow-hidden rounded-[var(--radius-card)] border border-border bg-surface shadow-[var(--shadow-elevation)]">
        {grantees.length === 0 ? (
          <p className="p-4 text-sm text-text-muted">No grantees configured yet.</p>
        ) : (
          <ul className="divide-y divide-border">
            {grantees.map((g) => (
              <li
                key={g.id}
                className={cn(
                  "flex items-center gap-3 px-4 py-2.5",
                  !g.isActive && "opacity-60"
                )}
              >
                <span className="min-w-0 flex-1 truncate text-sm font-medium">{g.label}</span>
                <span className="shrink-0 text-xs text-text-muted">
                  {g.isActive ? "Required" : "Inactive"}
                </span>
                {g.isActive ? (
                  <Button
                    size="sm"
                    variant="ghost"
                    disabled={pending}
                    onClick={() => remove(g)}
                    className="shrink-0"
                  >
                    <UserMinus className="size-4" /> Deactivate
                  </Button>
                ) : (
                  // Re-adding the same label re-activates it (the label is unique),
                  // so a mistaken deactivation is one click to undo.
                  <span className="shrink-0 text-xs text-text-muted">
                    Add again to re-activate
                  </span>
                )}
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
