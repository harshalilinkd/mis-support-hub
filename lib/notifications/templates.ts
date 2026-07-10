import type { NotifyInput } from "./types";

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function shell(
  title: string,
  bodyHtml: string,
  cta?: { href: string; label: string }
): string {
  const button = cta
    ? `<p style="margin:24px 0"><a href="${escapeHtml(cta.href)}" style="background:#2563eb;color:#ffffff;text-decoration:none;padding:10px 18px;border-radius:8px;font-weight:600;display:inline-block">${escapeHtml(cta.label)}</a></p>`
    : "";
  return `<!doctype html><html><body style="margin:0;background:#f4f4f5;font-family:Segoe UI,Helvetica,Arial,sans-serif;color:#18181b">
  <div style="max-width:520px;margin:0 auto;padding:32px 16px">
    <div style="background:#ffffff;border:1px solid #e4e4e7;border-radius:10px;padding:28px">
      <h1 style="margin:0 0 12px;font-size:18px">${escapeHtml(title)}</h1>
      ${bodyHtml}
      ${button}
      <p style="margin-top:24px;color:#71717a;font-size:12px">MIS Support Hub · automated notification</p>
    </div>
  </div></body></html>`;
}

export function renderTemplate(input: NotifyInput): {
  subject: string;
  html: string;
} {
  const number = input.data.number ?? "";
  const title = input.data.title ?? "";
  const appUrl = input.data.appUrl ?? "";
  const link = appUrl && number ? `${appUrl}/tickets/${number}` : "";
  const cta = link ? { href: link, label: "View ticket" } : undefined;

  switch (input.template) {
    case "TICKET_RESOLVED":
      return {
        subject: `Issue ${number} was resolved — please verify`,
        html: shell(
          `Issue ${number} was resolved`,
          `<p style="margin:0;line-height:1.6">Issue <strong>${escapeHtml(number)}</strong> — “${escapeHtml(title)}” — was resolved by ${escapeHtml(input.data.resolvedBy ?? "the MIS team")}.</p>
           <p style="margin:12px 0 0;line-height:1.6">Please verify the fix${link ? ` — ${escapeHtml(link)}` : ""}. If it isn't resolved, you can reopen it.</p>`,
          cta
        ),
      };
    case "TICKET_ASSIGNED":
      return {
        subject: `Ticket ${number} assigned to you`,
        html: shell(
          `Ticket ${number} assigned to you`,
          `<p style="margin:0;line-height:1.6">You have been assigned <strong>${escapeHtml(number)}</strong> — “${escapeHtml(title)}”.</p>`,
          cta
        ),
      };
    case "TICKET_CLAIMED":
      return {
        subject: `${input.data.claimedBy ?? "The MIS team"} started working on ${number}`,
        html: shell(
          `Work started on ${number}`,
          `<p style="margin:0;line-height:1.6"><strong>${escapeHtml(input.data.claimedBy ?? "The MIS team")}</strong> has started working on <strong>${escapeHtml(number)}</strong> — “${escapeHtml(title)}”.</p>
           <p style="margin:12px 0 0;line-height:1.6">Priority: <strong>${escapeHtml(input.data.priority ?? "")}</strong>${input.data.deadline ? ` · expected resolution by <strong>${escapeHtml(input.data.deadline)}</strong>` : ""}.</p>`,
          cta
        ),
      };
    case "NEW_COMMENT":
      return {
        subject: `New comment on ${number}`,
        html: shell(
          `New comment on ${number}`,
          `<p style="margin:0;line-height:1.6">There's a new comment on <strong>${escapeHtml(number)}</strong> — “${escapeHtml(title)}”.</p>`,
          cta
        ),
      };
  }
}
