import type { NotificationProvider } from "./types";

/**
 * WhatsApp provider — STUB (CLAUDE.md §8).
 * Implements the same interface as the email provider but only logs intent.
 * Wire the real WhatsApp Business API here later; no other call site changes.
 */
export const whatsappProvider: NotificationProvider = {
  channel: "whatsapp",
  async send(input) {
    console.info(
      `[notifications:whatsapp:stub] would send ${input.template} to ${input.to.phone ?? "(no phone)"}`
    );
    return { ok: true };
  },
};
