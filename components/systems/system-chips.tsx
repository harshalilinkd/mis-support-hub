import type { SystemStatus, SystemType } from "@/lib/db/schema";
import {
  SYSTEM_STATUS_LABELS,
  SYSTEM_TYPE_LABELS,
} from "@/lib/validators/systems";
import { Chip } from "@/components/tickets/chips";

/**
 * Systems Repository chips (§13). They reuse the shared `Chip` from
 * components/tickets/chips.tsx, so there is exactly one chip markup, one chip
 * radius, and one dot+label rule in the app — never colour alone.
 *
 * Colours come from the existing design tokens only (design-system.md): a system
 * mirrors the lifecycle language already in use — live/green, winding-down/amber,
 * retired/muted — rather than introducing a new palette.
 */
const SYSTEM_STATUS_COLOR: Record<SystemStatus, string> = {
  ACTIVE: "var(--status-resolved)",
  DEPRECATED: "var(--priority-high)",
  // Retired: deliberately the muted token, so an archived row reads as inactive
  // rather than as another live state competing for attention.
  ARCHIVED: "var(--text-muted)",
};

const SYSTEM_TYPE_COLOR: Record<SystemType, string> = {
  SHEET: "var(--status-resolved)",
  APPS_SCRIPT: "var(--priority-high)",
  WEB_APP: "var(--status-in-progress)",
  OTHER: "var(--text-muted)",
};

export function SystemStatusChip({
  status,
  className,
}: {
  status: SystemStatus;
  className?: string;
}) {
  return (
    <Chip
      label={SYSTEM_STATUS_LABELS[status]}
      color={SYSTEM_STATUS_COLOR[status]}
      className={className}
    />
  );
}

export function SystemTypeChip({
  type,
  className,
}: {
  type: SystemType;
  className?: string;
}) {
  return (
    <Chip
      label={SYSTEM_TYPE_LABELS[type]}
      color={SYSTEM_TYPE_COLOR[type]}
      className={className}
    />
  );
}

/** The reserved colour for a system status — used by the mobile card's accent bar. */
export function systemStatusColor(status: SystemStatus): string {
  return SYSTEM_STATUS_COLOR[status];
}
