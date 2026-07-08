import { Resend } from "resend";

import { renderTemplate } from "./templates";
import type { NotificationProvider } from "./types";

const apiKey = process.env.RESEND_API_KEY;
const from = process.env.EMAIL_FROM ?? "MIS Support <onboarding@resend.dev>";
const resend = apiKey ? new Resend(apiKey) : null;

/** Resend email provider. No-ops gracefully when RESEND_API_KEY is unset. */
export const emailProvider: NotificationProvider = {
  channel: "email",
  async send(input) {
    if (!input.to.email) {
      return { ok: false, error: "no recipient email" };
    }
    if (!resend) {
      console.warn(
        `[notifications:email] RESEND_API_KEY not set — skipping ${input.template} to ${input.to.email}`
      );
      return { ok: false, error: "RESEND_API_KEY not set" };
    }
    const { subject, html } = renderTemplate(input);
    try {
      const { error } = await resend.emails.send({
        from,
        to: input.to.email,
        subject,
        html,
      });
      if (error) return { ok: false, error: error.message };
      return { ok: true };
    } catch (e) {
      return { ok: false, error: (e as Error).message };
    }
  },
};
