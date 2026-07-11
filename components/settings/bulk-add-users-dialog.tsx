"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Upload } from "lucide-react";
import { toast } from "sonner";

import { adminBulkCreateUsers } from "@/lib/actions/users";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";

type Row = {
  name: string;
  department: string;
  email: string;
  role: string;
  password: string;
};

/** Split pasted text into rows. Comma or tab separated; a header row is skipped. */
function parseRows(text: string): Row[] {
  const lines = text
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter(Boolean);
  const rows: Row[] = [];
  lines.forEach((line, i) => {
    const cols = line.split(/\t|,/).map((c) => c.trim());
    if (
      i === 0 &&
      cols.some((c) => /^(name|email|role|department|password)$/i.test(c))
    ) {
      return; // header row
    }
    const [name = "", department = "", email = "", role = "", password = ""] =
      cols;
    rows.push({ name, department, email, role, password });
  });
  return rows;
}

export function BulkAddUsersDialog() {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [text, setText] = useState("");
  const [result, setResult] = useState<{
    created: number;
    skipped: { row: number; email: string; error: string }[];
  } | null>(null);
  const [pending, startTransition] = useTransition();

  function onOpenChange(next: boolean) {
    setOpen(next);
    if (!next) {
      setText("");
      setResult(null);
    }
  }

  function submit() {
    const rows = parseRows(text);
    if (!rows.length) {
      toast.error("Paste at least one row.");
      return;
    }
    startTransition(async () => {
      const res = await adminBulkCreateUsers({ rows });
      if (!res.ok) {
        toast.error(res.error);
        return;
      }
      setResult(res.data);
      if (res.data.created > 0) {
        toast.success(
          `${res.data.created} user${res.data.created === 1 ? "" : "s"} added`
        );
        setText("");
      }
      router.refresh();
    });
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogTrigger asChild>
        <Button size="sm" variant="outline">
          <Upload className="size-4" /> Bulk add
        </Button>
      </DialogTrigger>
      <DialogContent className="flex max-h-[90vh] max-w-2xl flex-col overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Bulk add users</DialogTitle>
          <DialogDescription>
            One user per line:{" "}
            <span className="font-mono text-foreground">
              name, department, email, role, password
            </span>
            . Comma or tab separated (paste straight from a spreadsheet).
            Department accepts the code (LINKD) or label; role accepts Employee /
            MIS Admin and defaults to Employee.
          </DialogDescription>
        </DialogHeader>

        <Textarea
          value={text}
          onChange={(e) => setText(e.target.value)}
          disabled={pending}
          className="max-h-56 min-h-32 shrink-0 resize-y overflow-y-auto font-mono text-xs"
          placeholder={
            "Nikita Dhawde, LINKD, nikita@company.com, Employee, secret123\n" +
            "Aman Khan, LD Silk Mills, aman@company.com, MIS Admin, secret123"
          }
        />

        {result ? (
          <div className="rounded-[var(--radius-input)] border border-border bg-surface-muted/50 p-3 text-sm">
            <p className="font-medium text-status-resolved">
              {result.created} added
            </p>
            {result.skipped.length > 0 ? (
              <div className="mt-2">
                <p className="text-xs font-medium text-text-muted">
                  {result.skipped.length} skipped
                </p>
                <ul className="mt-1 max-h-40 space-y-0.5 overflow-y-auto text-xs text-text-muted">
                  {result.skipped.map((s, i) => (
                    <li key={i}>
                      <span className="font-mono">row {s.row}</span>{" "}
                      {s.email} — {s.error}
                    </li>
                  ))}
                </ul>
              </div>
            ) : null}
          </div>
        ) : null}

        <DialogFooter>
          <DialogClose asChild>
            <Button type="button" variant="ghost" disabled={pending}>
              {result ? "Done" : "Cancel"}
            </Button>
          </DialogClose>
          <Button
            type="button"
            onClick={submit}
            disabled={pending || !text.trim()}
          >
            {pending ? "Adding…" : "Add users"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
