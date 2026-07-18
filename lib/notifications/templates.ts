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
  // Both types deep-link to the shared detail route (§12.7) — one link pattern.
  const link = appUrl && number ? `${appUrl}/tickets/${number}` : "";
  const cta = link ? { href: link, label: "View ticket" } : undefined;
  // Same shell, same button — only the word changes, because a REQUEST isn't a ticket
  // to the person reading it.
  const requestCta = link ? { href: link, label: "View request" } : undefined;

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
    /**
     * The correction to TICKET_CLAIMED (§8 + §12.6's reversal rule). That mail said
     * "X started working on this, expected by DATE" — this one withdraws both halves.
     * Never the word "released": that's our state name, and a reporter would read it
     * as "cancelled". Their ticket is fine; it's back in the queue.
     */
    case "TICKET_RELEASED":
      return {
        subject: `${number} is back with the MIS team`,
        html: shell(
          `${number} is back with the MIS team`,
          `<p style="margin:0;line-height:1.6">Work on <strong>${escapeHtml(number)}</strong> — “${escapeHtml(title)}” — has stopped for now, and it's back in the queue to be picked up.</p>
           <p style="margin:12px 0 0;line-height:1.6">This replaces the earlier note that someone had started on it, and <strong>the date given then no longer applies</strong>. Your ticket is still open — nothing is needed from you.</p>`,
          cta
        ),
      };
    case "TICKET_REOPENED":
      return {
        subject: `${number} was reopened`,
        html: shell(
          `${number} was reopened`,
          `<p style="margin:0;line-height:1.6"><strong>${escapeHtml(number)}</strong> — “${escapeHtml(title)}” — was reopened by the reporter and is back in your In Progress list.</p>`,
          cta
        ),
      };
    case "TICKET_CLOSED":
      return {
        subject: `${number} confirmed resolved & closed`,
        html: shell(
          `${number} was confirmed & closed`,
          `<p style="margin:0;line-height:1.6"><strong>${escapeHtml(input.data.closedBy ?? "The reporter")}</strong> confirmed that <strong>${escapeHtml(number)}</strong> — “${escapeHtml(title)}” — is resolved. The ticket is now closed.</p>`,
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

    /* ---------------- REQUEST (§12.6) ----------------
     * Same shell, same sender, same link pattern as the issue templates above —
     * only the words differ. `system` is the requested system's name.
     */
    case "REQUEST_SUBMITTED":
      return {
        subject: `New system request ${number} — needs review`,
        html: shell(
          `New request ${number}`,
          `<p style="margin:0;line-height:1.6"><strong>${escapeHtml(input.data.submittedBy ?? "Someone")}</strong> requested a new system: <strong>${escapeHtml(title)}</strong>.</p>
           <p style="margin:12px 0 0;line-height:1.6">It's waiting for the MIS team to review it.</p>`,
          requestCta
        ),
      };
    case "REQUEST_PENDING_APPROVAL":
      return {
        subject: `${number} is awaiting the MD's decision`,
        html: shell(
          `${number} is awaiting approval`,
          `<p style="margin:0;line-height:1.6"><strong>${escapeHtml(title)}</strong> has been reviewed and sent up for approval.</p>
           <p style="margin:12px 0 0;line-height:1.6">Confirm with the MD, then record the decision in the app — the recorded decision is the accountability trail.</p>`,
          requestCta
        ),
      };
    case "REQUEST_DECISION_RECORDED": {
      const approved = input.data.decision === "APPROVED";
      const remark = input.data.remark
        ? `<p style="margin:12px 0 0;padding:12px;background:#f4f4f5;border-radius:8px;line-height:1.6">“${escapeHtml(input.data.remark)}”</p>`
        : "";
      return {
        subject: approved
          ? `${number} was approved`
          : `${number} was not approved`,
        html: shell(
          approved ? `${number} was approved` : `${number} was dropped`,
          `<p style="margin:0;line-height:1.6"><strong>${escapeHtml(title)}</strong> was <strong>${approved ? "approved" : "dropped"}</strong>.</p>
           ${remark}
           <p style="margin:12px 0 0;line-height:1.6">${
             approved
               ? "An MIS member will pick it up and confirm a delivery date when they start building."
               : "If circumstances change, an MIS admin can revive it."
           }</p>
           <p style="margin:12px 0 0;color:#71717a;font-size:12px">Recorded by ${escapeHtml(input.data.recordedBy ?? "an MIS admin")} on the MD's behalf.</p>`,
          requestCta
        ),
      };
    }
    /**
     * The correction to a DROPPED verdict (§12.6's reversal rule). The drop email
     * says "an MIS admin can revive it" — this is that revival actually happening,
     * so the earlier mail can't be left standing as the last word.
     */
    case "REQUEST_REVIVED":
      return {
        subject: `${number} is back under review`,
        html: shell(
          `${number} is back under review`,
          `<p style="margin:0;line-height:1.6"><strong>${escapeHtml(title)}</strong> was dropped earlier, and has now been brought back — it is under review again.</p>
           <p style="margin:12px 0 0;line-height:1.6">This replaces the earlier note that it had been dropped. It will go back through approval before any build starts.</p>`,
          requestCta
        ),
      };
    case "REQUEST_CLAIMED":
      return {
        subject: `${input.data.claimedBy ?? "An MIS member"} has picked up ${number}`,
        html: shell(
          `${number} has been picked up`,
          `<p style="margin:0;line-height:1.6"><strong>${escapeHtml(input.data.claimedBy ?? "An MIS member")}</strong> is building <strong>${escapeHtml(title)}</strong>.</p>
           <p style="margin:12px 0 0;line-height:1.6">${
             input.data.deadline
               ? `Delivery is targeted for <strong>${escapeHtml(input.data.deadline)}</strong>.`
               : "They'll confirm a delivery date when the build starts."
           }</p>`,
          requestCta
        ),
      };
    /**
     * The correction to REQUEST_CLAIMED (§12.6's reversal rule). Its whole job is to
     * cancel a mail already sitting in the inbox saying someone is building this.
     *
     * Never the word "released" — that's our state name, not theirs; the requester
     * would read it as "cancelled". Say what actually happened, and say plainly that
     * nothing is required of them, because the previous mail implied progress and this
     * one takes it away.
     *
     * The releaser is deliberately unnamed: releaseRequest clears the assignee before
     * this fires, and naming-and-shaming a mis-click isn't the point.
     */
    case "REQUEST_RELEASED":
      return {
        subject: `${number} is back with the MIS team`,
        html: shell(
          `${number} is back with the MIS team`,
          `<p style="margin:0;line-height:1.6">The MIS member who picked up <strong>${escapeHtml(title)}</strong> has handed it back, so it is not currently being built.</p>
           <p style="margin:12px 0 0;line-height:1.6">It is <strong>still approved</strong> and back in the queue to be picked up again${
             // A started build had a delivery date committed at start-work; releasing
             // withdraws that too, and saying so is the whole point of this mail.
             input.data.wasStarted
               ? " — and <strong>the delivery date you were given no longer applies</strong>"
               : ""
           }. This replaces the earlier note about it. Nothing is needed from you.</p>`,
          requestCta
        ),
      };
    case "REQUEST_DEADLINE_CHANGED":
      return {
        subject: input.data.previousDeadline
          ? `${number} — delivery date moved to ${input.data.deadline ?? ""}`
          : `${number} — delivery targeted for ${input.data.deadline ?? ""}`,
        html: shell(
          input.data.previousDeadline
            ? `${number}: the delivery date moved`
            : `${number}: delivery date confirmed`,
          `<p style="margin:0;line-height:1.6"><strong>${escapeHtml(title)}</strong></p>
           <p style="margin:12px 0 0;line-height:1.6">${
             input.data.previousDeadline
               ? `Delivery moved from <strong>${escapeHtml(input.data.previousDeadline)}</strong> to <strong>${escapeHtml(input.data.deadline ?? "")}</strong>.`
               : `Delivery is now targeted for <strong>${escapeHtml(input.data.deadline ?? "")}</strong>.`
           }</p>`,
          requestCta
        ),
      };
    case "REQUEST_READY_FOR_TESTING":
      return {
        subject: `${number} is ready for you to test`,
        html: shell(
          `${number} is ready to test`,
          `<p style="margin:0;line-height:1.6"><strong>${escapeHtml(title)}</strong> has been built and is ready for you to try.</p>
           <p style="margin:12px 0 0;line-height:1.6">Have a look, then either accept it — which closes the request — or send it back with what needs changing. Only you can close it.</p>`,
          requestCta
        ),
      };
    case "REQUEST_CHANGES_REQUESTED":
      return {
        subject: `${number} — changes requested (round ${input.data.round ?? "2"})`,
        html: shell(
          `${number}: changes requested`,
          `<p style="margin:0;line-height:1.6"><strong>${escapeHtml(input.data.requestedBy ?? "The requester")}</strong> tested <strong>${escapeHtml(title)}</strong> and asked for changes.</p>
           <p style="margin:12px 0 0;line-height:1.6">The note they left is on the request — it's back in your build queue.</p>`,
          requestCta
        ),
      };
    case "REQUEST_ACCEPTED":
      return {
        subject: `${number} was accepted and closed`,
        html: shell(
          `${number} was accepted`,
          `<p style="margin:0;line-height:1.6"><strong>${escapeHtml(input.data.acceptedBy ?? "The requester")}</strong> accepted <strong>${escapeHtml(title)}</strong>. The request is closed.</p>
           ${input.data.rounds && input.data.rounds !== "0" ? `<p style="margin:12px 0 0;line-height:1.6">It took ${escapeHtml(input.data.rounds)} round(s) of changes to get there.</p>` : ""}`,
          requestCta
        ),
      };
  }
}
