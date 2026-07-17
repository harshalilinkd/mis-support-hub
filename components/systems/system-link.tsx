"use client";

import { useState } from "react";
import { Check, Copy, ExternalLink } from "lucide-react";
import { toast } from "sonner";

import { isUrl } from "@/lib/format";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";

/**
 * A system link: open-in-new-tab + copy. One-click access to the artefact is the
 * entire point of the directory (§13), so both affordances sit together wherever a
 * URL is shown — the table and the detail use this same component.
 *
 * The URL is routed through the shared `isUrl` guard rather than anchored blindly.
 * frontend_url is url-validated at the validator (§13.6), but a legacy or
 * hand-edited row must never become a live anchor to a `javascript:` target — if it
 * isn't http(s), it renders as plain text.
 */
export function SystemLink({
  url,
  label,
  className,
}: {
  url: string | null;
  /** What is being copied, for the toast ("Frontend link copied"). */
  label: string;
  className?: string;
}) {
  const [copied, setCopied] = useState(false);

  if (!url) return <span className="text-sm text-text-muted">—</span>;

  if (!isUrl(url)) {
    return (
      <span className={cn("break-all text-sm text-foreground", className)} title={url}>
        {url}
      </span>
    );
  }

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      toast.success(`${label} copied`);
      // Revert the tick so the button doesn't lie about a later copy.
      setTimeout(() => setCopied(false), 1500);
    } catch {
      // clipboard rejects on an insecure origin or an unfocused document.
      toast.error("Couldn't copy — your browser blocked clipboard access.");
    }
  };

  return (
    <div className={cn("flex items-center gap-1", className)}>
      <Button
        asChild
        size="sm"
        variant="ghost"
        className="h-7 gap-1.5 px-2 text-xs font-medium"
      >
        <a href={url} target="_blank" rel="noreferrer" title={url}>
          <ExternalLink className="size-3.5" />
          Open
        </a>
      </Button>
      <Button
        type="button"
        size="sm"
        variant="ghost"
        onClick={copy}
        className="size-7 p-0"
        aria-label={`Copy ${label.toLowerCase()}`}
        title={`Copy ${label.toLowerCase()}`}
      >
        {copied ? (
          <Check className="size-3.5 text-primary" />
        ) : (
          <Copy className="size-3.5" />
        )}
      </Button>
    </div>
  );
}
