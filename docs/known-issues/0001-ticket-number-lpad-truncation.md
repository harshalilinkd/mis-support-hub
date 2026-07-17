# 0001 — `lpad(number, 3, '0')` truncates past 999 → duplicate `tickets.number`

- **Status:** Open · tracked, **not scheduled** (do not fix ad hoc)
- **Severity:** High when it lands (hard failure), low urgency today (large headroom)
- **Found:** P10/P11 adversarial verification of the REQUEST data layer
- **Scope note:** ISSUE numbering is explicitly out of scope for P10/P11 (CLAUDE.md §12
  says the live MIS- sequence and format must not change), so this is **documented, not
  fixed**. It needs its own phase.

## The bug

Ticket numbers are built with Postgres `lpad`:

```sql
-- lib/db/queries.ts · createTicket
'MIS-' || lpad(nextval('ticket_seq')::text, 3, '0')
-- lib/db/queries.ts · createRequestTicket  (and lib/db/seed.ts)
'REQ-' || lpad(nextval('request_seq')::text, 3, '0')
```

**`lpad` truncates on the right when the input is longer than the target width** — it is
not "pad to at least N". Verified against the live database:

```sql
select lpad('999',3,'0'), lpad('1000',3,'0'), lpad('1001',3,'0');
--        '999'            '100'               '100'
```

So once a sequence passes 999 the rendered number silently collapses back into the
3-digit space and collides with an existing row. `tickets.number` is `UNIQUE`, so the
insert fails with a duplicate-key error and **ticket/request creation starts throwing**.

| Sequence | nextval | rendered | outcome |
|---|---|---|---|
| `ticket_seq` | 999 | `MIS-999` | ok |
| `ticket_seq` | 1000 | `MIS-100` | **collides with MIS-100** |
| `request_seq` | 1000 | `REQ-100` | **collides with REQ-100** |

Both sequences are affected. It is not specific to REQUEST.

## Second, sharper hazard: a fresh provision is broken *immediately*

`ticket_seq` is **declared** `START WITH 1001` (`lib/db/schema.ts`, created by
`lib/db/migrations/0002_true_wildside.sql`), but the **live** sequence dispenses `1,2,3…`
(it was restarted at some point) — which is why real issues read `MIS-001 … MIS-006`
(`ticket_seq.last_value = 6`).

On any **freshly provisioned** database the declared start applies, so:

- 1st issue → `lpad('1001',3,'0')` → `MIS-100`
- 2nd issue → `lpad('1002',3,'0')` → `MIS-100` → **duplicate key on the 2nd insert**

This is why `lib/db/seed.ts` deliberately keeps the **un-padded** `'MIS-' || nextval('ticket_seq')`
form. Do not "align" the seed to the padded app format without fixing this card first —
doing so makes `npm run db:seed` abort on a fresh database.

## Current headroom

- Live `ticket_seq.last_value` = **6** (≈993 issues of headroom)
- `request_seq` = **0 used** (starts at 1 in `0010_nifty_dagger.sql`; ≈999 of headroom)

**Trigger to schedule this: before either count approaches ~900.**

## Options to propose when scheduled

1. **Non-truncating pad (recommended)** — keep the exact current format, remove the cap.
   Pad only when the value is short, calling `nextval` exactly once:
   ```sql
   'REQ-' || (select lpad(v::text, greatest(3, length(v::text)), '0')
              from (select nextval('request_seq') as v) s)
   ```
   → `REQ-001 … REQ-999`, then `REQ-1000`. Identical output in the current range, so no
   visual change and no renumbering.
2. **Widen the pad** — `lpad(…, 4, '0')` → `MIS-0001`. Pushes the cliff to 9999 but does
   not remove it, and mixes widths against existing 3-digit rows.
3. **Drop the cap** — `'MIS-' || nextval('ticket_seq')` → `MIS-1, MIS-2 …`. Never
   truncates, but changes the format and mixes with existing padded rows.

**Invariant for any option:** existing stored numbers are immutable identifiers and must
**not** be renumbered; only newly-issued numbers change. Also decide whether to reconcile
`ticket_seq`'s declared `START WITH 1001` against live reality (it only affects fresh
provisions, and changing it touches live ISSUE numbering — hence out of scope here).

## Anchors

- `lib/db/queries.ts` — `createTicket`, `createRequestTicket`
- `lib/db/seed.ts` — deliberately un-padded MIS form (see comment)
- `lib/db/schema.ts` — `ticketSeq` / `requestSeq` declarations + inline KNOWN LIMIT note
- `lib/db/migrations/0002_true_wildside.sql` — `ticket_seq … START WITH 1001`
- `lib/db/migrations/0010_nifty_dagger.sql` — `request_seq … START WITH 1`
