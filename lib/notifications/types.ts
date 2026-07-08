export type NotificationChannel = "email" | "whatsapp" | "in_app";

export type NotificationTemplate =
  | "TICKET_RESOLVED"
  | "TICKET_ASSIGNED"
  | "TICKET_COMMENTED";

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
