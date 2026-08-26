import test from "node:test";
import assert from "node:assert/strict";

import {
  bulkClaimSchema,
  bulkResolveSchema,
  bulkStartSchema,
} from "./ticket";

/**
 * Contract tests for the three bulk wizards: does the payload each dialog BUILDS
 * survive the schema the action parses it with?
 *
 * This is the failure nobody sees coming — the UI is happy, the types line up
 * (the actions take a hand-written `input` shape, not the zod type), and the whole
 * batch dies on `safeParse` with one generic message. Pure, so it runs with the rest.
 *
 * Each payload below is copied from the dialog's `items = tickets.map(...)`.
 */

const ID = "11111111-2222-4333-8444-555555555555";
const OTHER = "66666666-7777-4888-8999-aaaaaaaaaaaa";

/* ------------------------------- bulk claim ------------------------------ */

test("bulk claim: the wizard's payload parses", () => {
  const items = [
    { ticketId: ID, priority: "MEDIUM", claimedOn: "2026-08-13" },
    { ticketId: OTHER, priority: "URGENT", claimedOn: "2026-08-26" },
  ];
  const parsed = bulkClaimSchema.safeParse({ items });
  assert.equal(parsed.success, true, JSON.stringify(parsed.error?.issues));
});

test("bulk claim: a per-ticket date is preserved, not collapsed to one", () => {
  const parsed = bulkClaimSchema.parse({
    items: [
      { ticketId: ID, priority: "LOW", claimedOn: "2026-08-10" },
      { ticketId: OTHER, priority: "LOW", claimedOn: "2026-08-12" },
    ],
  });
  assert.equal(parsed.items[0].claimedOn, "2026-08-10");
  assert.equal(parsed.items[1].claimedOn, "2026-08-12");
});

/* ------------------------------- bulk start ------------------------------ */

test("bulk start: the wizard's payload parses", () => {
  const items = [
    { ticketId: ID, deadline: "2026-08-27", startedOn: "2026-08-13" },
    { ticketId: OTHER, deadline: "2026-09-01", startedOn: "2026-08-26" },
  ];
  const parsed = bulkStartSchema.safeParse({ items });
  assert.equal(parsed.success, true, JSON.stringify(parsed.error?.issues));
});

test("bulk start: a missing deadline is refused (the wizard gates on it first)", () => {
  const parsed = bulkStartSchema.safeParse({
    items: [{ ticketId: ID, deadline: "", startedOn: "2026-08-13" }],
  });
  assert.equal(parsed.success, false);
});

/* ------------------------------ bulk resolve ----------------------------- */

test("bulk resolve: the wizard's payload parses", () => {
  const items = [
    { ticketId: ID, resolvedOn: "2026-08-24" },
    { ticketId: OTHER, resolvedOn: "2026-08-26" },
  ];
  const parsed = bulkResolveSchema.safeParse({ items });
  assert.equal(parsed.success, true, JSON.stringify(parsed.error?.issues));
});

/* --------------------------- shared expectations -------------------------- */

test("every bulk schema refuses an empty selection", () => {
  for (const [name, schema] of [
    ["claim", bulkClaimSchema],
    ["start", bulkStartSchema],
    ["resolve", bulkResolveSchema],
  ] as const) {
    assert.equal(
      schema.safeParse({ items: [] }).success,
      false,
      `${name} should refuse an empty batch`
    );
  }
});

test("every bulk schema accepts an item with NO date (server stamps now)", () => {
  // The dialogs always send a date, but the actions are also called with none —
  // a board drag, a re-claim. Optional must stay optional.
  assert.equal(
    bulkClaimSchema.safeParse({ items: [{ ticketId: ID, priority: "MEDIUM" }] })
      .success,
    true
  );
  assert.equal(
    bulkStartSchema.safeParse({ items: [{ ticketId: ID, deadline: "2026-08-27" }] })
      .success,
    true
  );
  assert.equal(
    bulkResolveSchema.safeParse({ items: [{ ticketId: ID }] }).success,
    true
  );
});

test("every bulk schema refuses a non-date string in a date field", () => {
  // The pickers emit YYYY-MM-DD, but a cleared field or a hand-built call must not
  // reach the DB as garbage.
  assert.equal(
    bulkClaimSchema.safeParse({
      items: [{ ticketId: ID, priority: "MEDIUM", claimedOn: "13-08-2026" }],
    }).success,
    false
  );
  assert.equal(
    bulkStartSchema.safeParse({
      items: [{ ticketId: ID, deadline: "2026-08-27", startedOn: "yesterday" }],
    }).success,
    false
  );
  assert.equal(
    bulkResolveSchema.safeParse({
      items: [{ ticketId: ID, resolvedOn: "2026-8-24" }],
    }).success,
    false
  );
});

test("every bulk schema refuses a non-uuid ticket id", () => {
  assert.equal(
    bulkResolveSchema.safeParse({ items: [{ ticketId: "MIS-052" }] }).success,
    false
  );
});
