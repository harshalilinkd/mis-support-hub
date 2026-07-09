import type { NotificationProvider } from "./types";

/**
 * WhatsApp provider — STUB (CLAUDE.md §8). Implements the same interface as the
 * email provider but only logs intent. All notifications keep working; only the
 * delivery mechanism is missing.
 */
export const whatsappProvider: NotificationProvider = {
  channel: "whatsapp",
  async send(input) {
    // TODO(P-later): replace this stub with a real WhatsApp Business API call.
    // Send a template message to input.to.phone using the WhatsApp Cloud API, e.g.:
    //   await fetch(`https://graph.facebook.com/v21.0/${WHATSAPP_PHONE_NUMBER_ID}/messages`, {
    //     method: "POST",
    //     headers: { Authorization: `Bearer ${WHATSAPP_TOKEN}`, "Content-Type": "application/json" },
    //     body: JSON.stringify({
    //       messaging_product: "whatsapp",
    //       to: input.to.phone,
    //       type: "template",
    //       template: { name: mapTemplate(input.template), language: { code: "en" }, components: [...] },
    //     }),
    //   });
    // Add WHATSAPP_TOKEN + WHATSAPP_PHONE_NUMBER_ID env vars and a phone field on users.
    console.info(
      `[notifications:whatsapp:stub] would send ${input.template} to ${input.to.phone ?? "(no phone)"}`
    );
    return { ok: true };
  },
};
