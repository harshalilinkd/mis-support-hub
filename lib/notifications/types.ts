export type NotificationChannel = "email" | "whatsapp" | "in_app";

export type NotificationTemplate =
  // ISSUE (§8)
  | "TICKET_RESOLVED"
  | "TICKET_ASSIGNED"
  | "TICKET_CLAIMED"
  // The reversal of TICKET_CLAIMED (work started) — see §12.6.
  | "TICKET_RELEASED"
  | "TICKET_REOPENED"
  | "TICKET_CLOSED"
  | "NEW_COMMENT"
  // REQUEST (§12.6). Deliberately NOT the whole notifications.type enum: a template
  // exists only where §12.6 says email goes out. REQUEST_PROGRESS stays in-app —
  // a build update every few days shouldn't fill an inbox, and it makes no earlier
  // email false.
  | "REQUEST_SUBMITTED"
  | "REQUEST_PENDING_APPROVAL"
  | "REQUEST_DECISION_RECORDED"
  // The reversal of a DROPPED decision — see REQUEST_RELEASED's note; same rule.
  | "REQUEST_REVIVED"
  | "REQUEST_CLAIMED"
  // §12.6's reversal rule: CLAIMED emails, so its undo MUST email — otherwise the
  // claim mail sits in the inbox asserting something false.
  | "REQUEST_RELEASED"
  | "REQUEST_DEADLINE_CHANGED"
  | "REQUEST_READY_FOR_TESTING"
  | "REQUEST_CHANGES_REQUESTED"
  | "REQUEST_ACCEPTED"
  // Access requests (§7). ACCESS_REQUESTED → admins ("someone asked to be let in");
  // ACCESS_APPROVED → the new user ("you're in — sign in with Google"). These do NOT
  // deep-link to a ticket, so they build their own CTA from appUrl.
  | "ACCESS_REQUESTED"
  | "ACCESS_APPROVED"
  // §5 auto-close → the reporter. Wording differs by kind (issue "resolved" vs request
  // "accepted"); `kind` = ISSUE | REQUEST, `days` = the grace window.
  | "TICKET_AUTO_CLOSED";

export interface NotifyRecipient {
  email?: string | null;
  phone?: string | null;
  name?: string | null;
}

export interface NotifyInput {
  to: NotifyRecipient;
  template: NotificationTemplate;
  data: Record<string, string>;
}

export interface NotificationResult {
  ok: boolean;
  error?: string;
}

/** Channel-agnostic provider interface (CLAUDE.md §8). */
export interface NotificationProvider {
  channel: NotificationChannel;
  send(input: NotifyInput): Promise<NotificationResult>;
}
