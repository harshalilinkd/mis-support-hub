# design-system.md — Visual Spec & Reusable Design Language

This is both the **locked visual spec for this app** and a **portable design
language you can carry into future projects**. The philosophy, tokens, component
rules, and motion set are product-agnostic; the MIS ticketing app is just the
*reference instance* that proves them out. To reuse it elsewhere: keep §1–§4 and
§8–§11 verbatim, and swap the domain specifics (status/priority palettes, the
sidebar sections) in §5–§7.

> One-line summary of the taste: **a calm, precise control-room UI — neutral
> surfaces, one confident cobalt accent, high-contrast readable text, dense but
> never cramped, restrained motion, accessible by construction.**

---

## 1. Design principles (the through-line)

These are the non-negotiable instincts. When a decision is ambiguous, these break
the tie.

1. **Readability first.** Primary data is near-black (`--text`), never muted gray.
   Muted is *only* for genuinely secondary things: sub-labels, placeholders,
   separators, empty-state copy, disabled. If a user has to squint at a value,
   it's wrong. (Table rows, nav items, and metrics all read at full contrast.)
2. **One accent, reserved.** A single cobalt is the only brand color, and it's
   spent only on *actions* and *active/selected state* — primary buttons, the
   active nav item, the active tab, focus rings, links, the "created" data series.
   Everything else is neutral. No second brand hue.
3. **Calm precision over decoration.** Neutral surfaces, hairline borders, soft
   layered shadows. NOT: purple-gradient-on-white, glassmorphism everywhere,
   glowing orbs, mesh gradients, drop-shadow soup.
4. **Dense, but breathing.** Operations tools are data-dense; earn the density
   with consistent rhythm (one radius scale, one shadow scale, one spacing step)
   so nothing feels cramped.
5. **Restraint in motion.** Pick a *small* fixed set of motion effects (§8) and
   reuse them everywhere. Never layer many effects on one surface.
6. **Accessible by construction.** Color is never the only signal (chips carry a
   dot/label; series carry a legend + direct labels). Contrast targets met in both
   themes. Every interactive thing is keyboard-reachable with a visible focus ring.
   Everything honors `prefers-reduced-motion`.
7. **Deterministic rendering.** Anything rendered on both server and client
   (dates, seeded art) must be deterministic — fixed timezone/locale/seed — so
   there is never a hydration mismatch and never a layout flash.

---

## 2. Foundations — Type

Three families, each with one job:

- **Display / headings — Cabinet Grotesk** (Fontshare), weights 600/700. Page
  titles, section headers, KPI numbers, dialog titles.
- **Body / UI — Hanken Grotesk**, weights 400/500/600. Everything else.
- **Numeric / IDs / timestamps — IBM Plex Mono**, weights 400/500, **tabular
  figures**. Ticket numbers, dates, counts, metrics — anything that should align
  in a column or read as "data."

Wire them with `next/font` and expose as CSS variables consumed by the theme:
`--font-display`, `--font-body`, `--font-mono` (mapping to `--font-cabinet` /
`--font-hanken` / `--font-plex`). Body font is the document default.

**Scale (px):** 12 · 14 · 16 · 18 · 20 · 24 · 32. Body 14–16, line-height 1.5.
Table headers 12px, uppercase, letter-spacing wide. Rule of thumb: IDs, dates, and
metrics are **always** in the mono face with `tabular-nums`.

---

## 3. Foundations — Color

Semantic tokens only — **never raw hex in components.** Tokens are declared as CSS
variables in `globals.css` and surfaced to Tailwind v4 via `@theme inline`.
Dark mode is a `.dark` class on `<html>` (next-themes, `class` strategy), and the
dark palette is *authored*, not an inversion.

### Light
| Token | Hex | Use |
|---|---|---|
| `--background` | `#f6f7f9` | app canvas |
| `--surface` | `#ffffff` | cards, tables, sheets |
| `--surface-muted` | `#f2f3f5` | table header, hover rows, inset fills |
| `--border` | `#e6e8ec` | hairline dividers, input borders |
| `--text` / `--foreground` | `#101828` | **primary text (near-black)** |
| `--text-muted` | `#667085` | secondary only |
| `--accent` / `--primary` | `#2563eb` | cobalt — actions + active state |
| `--accent-hover` | `#1d4ed8` | primary hover |
| `--accent-soft` | `#eff3ff` | active nav/tab pill, selection bar tint |
| `--destructive` | `#f43f5e` | delete / danger |

### Dark (own palette)
| Token | Hex |
|---|---|
| `--background` | `#0b0b0f` |
| `--surface` | `#141419` |
| `--surface-muted` | `#1c1c22` |
| `--border` | `#27272e` |
| `--text` | `#fafafa` |
| `--text-muted` | `#a1a1aa` |
| `--accent` | `#3b82f6` |
| `--accent-soft` | `#16233f` |

### Status & priority (domain palette — swap per product)
Status: `--status-open` amber `#f59e0b` · `--status-in-progress` / `--status-reopened`
blue `#3b82f6` · `--status-resolved` green `#10b981` · `--status-closed` zinc `#71717a`.
Priority: `--priority-low` zinc `#71717a` · `--priority-medium` slate `#64748b` ·
`--priority-high` orange `#f97316` · `--priority-urgent` rose `#f43f5e`.

> **shadcn gotcha (keep this):** shadcn's semantic `accent` is a *subtle hover
> surface*, not the brand color. Map `--color-accent` → `--surface-muted` and put
> the cobalt in `--primary`. Otherwise dropdown/select hover states flash bright
> cobalt. Brand cobalt is always `--primary` / `--accent`, never `--color-accent`.

### Radius & elevation
- Radius: **cards 14px** (`--radius-card`), **inputs/buttons 10px**
  (`--radius-input`), **chips 999px** (`--radius-chip`). Base `--radius` = 14px;
  shadcn `sm/md/lg/xl` derive from it.
- Shadow: exactly three tokens — `--shadow-elevation` (resting cards),
  `--shadow-hover` (hover lift), `--shadow-popover` (menus/dialogs). Never invent
  ad-hoc shadow values.

---

## 4. Layout

**App shell:** a **fixed** left sidebar (≈64px icon rail on `md`, full ~256px on
`lg`, off-canvas drawer on mobile) + a slim sticky topbar (search, notification
bell, theme toggle, avatar menu) + a scrolling `main`. The sidebar is
`position: fixed` and never scrolls with content; `main` is offset by its width.

- **Sidebar:** grouped nav sections with tiny uppercase muted section labels; each
  item is icon + label. **Item text is foreground (readable), not gray**; the
  active item gets `--accent-soft` background + `--primary` text; hover gets a
  `--surface-muted` wash. A pinned user card sits at the bottom.
- **Content patterns:** a page header (display title + one muted subline, optional
  right-aligned action) then the working surface — KPI stat-card row (bento, one
  radius/shadow) → table or board.
- **Detail:** open record detail as a centered modal from lists; keep a full
  `/…/[id]` page as the deep-link / fallback.

---

## 5. Components

- **Buttons.** Solid cobalt **primary — exactly one per view**; quiet
  `outline`/`ghost` for everything else; `destructive` for delete. Icon + label,
  10px radius, visible focus ring.
- **Chips (status / priority).** Compact, 999px, a **leading dot or icon + a text
  label** — never color alone. Color comes from the domain tokens. A null/unset
  value renders as a muted "Unset" chip, not a blank.
- **Tables (the workhorse — readability rules matter here).**
  - Header: **foreground (black), semibold, 12px, uppercase, wide tracking,
    sticky** on scroll with a translucent `--surface-muted` backdrop.
  - Rows: **foreground text** for real data (number, name, dept, timestamps). Only
    placeholders (`—`) and secondary sub-labels stay muted. Zebra-free; a single
    `--surface-muted` hover wash. `align-top`, compact vertical padding.
  - Numbers/IDs/dates in the **mono** face, `tabular-nums`; numeric columns
    right-aligned.
  - **Inline controls:** status and priority are editable in-row via dropdowns
    (for staff), not a detour to a detail page. Controls `stopPropagation` so a
    click edits instead of opening the row's detail modal.
  - **Timestamps are absolute, in a fixed timezone** (this app: IST) rendered as a
    stacked `date / time` in mono — *not* "2h ago." Relative time is acceptable
    only for at-a-glance card metadata, never as the source of truth in a table.
  - **Bulk actions:** an optional leading checkbox column (desktop) on eligible
    rows + a select-all header checkbox with an **indeterminate** state; a
    selection appears as an `--accent-soft` action bar ("N selected · <action> ·
    Clear"). Keep the selection in sync with the visible/eligible set.
  - Mobile (`< md`): the table collapses to tap-to-open cards; keep the same
    inline controls.
- **Toolbar & tabs.** Status sub-tabs as a segmented control: **foreground +
  semibold** labels, the active one a `--accent-soft` pill with `--primary` text,
  each with a **count badge**. Filtering is instant/client-side where the data is
  already loaded; facets reflect into the URL.
- **Inputs / selects / checkboxes.** 10px radius, `--border`, focus ring in the
  accent. Selects and dropdowns use the *muted* hover surface (not cobalt).
  Checkboxes fill with `--primary` when checked; support `indeterminate`.
- **Dialogs / modals — close discipline (important taste rule).** Centered,
  `--shadow-popover`, slide+fade in. **A form/detail modal closes ONLY via its X
  or an explicit Cancel/Close button** — a stray backdrop click or Escape must not
  discard it (protects half-entered input and multi-step flows). Implement this as
  the default in the shared `DialogContent` (`onInteractOutside`/`onEscapeKeyDown`
  → `preventDefault`), overridable per-dialog. The **one exception** is a
  view-only surface like an image lightbox, where click-away/Escape *should*
  dismiss (nothing to lose) — opt those back in explicitly.
- **Empty states.** The generative accent (§9) + one clear CTA, never a bare
  "nothing here."
- **KPI stat cards.** Bento row, uniform radius/shadow, big display-font number
  (with the count-up in §8), a muted label, optional tiny trend.

---

## 6. Data display conventions

- **Contrast:** real values full-contrast; muted reserved for secondary. (This is
  worth repeating because it's the most common regression.)
- **Time:** store UTC; render absolute in a fixed timezone with a deterministic
  formatter (no locale drift → no hydration mismatch). Provide a plain date for
  due-dates/deadlines and a stacked date+time for created/updated.
- **Numbers/IDs:** mono, tabular. Never compute an identifier from a row index —
  use a real sequence/id.
- **Optional/absent:** show an explicit muted `—` or "Unset," never blank.

---

## 7. Domain-specific (swap per product)

For this app: departments, the 5-state ticket lifecycle, and the status/priority
palettes above. The sidebar sections are Overview (Dashboard, All Tickets, Board),
Tickets (Assigned to Me / My Tickets, Raise Ticket), Administration (Users,
Recycle Bin). In a new product, replace this section and the status/priority
tokens; everything else stays.

---

## 8. Motion (pick exactly these, reuse everywhere)

1. **Page/list load:** staggered fade-up of cards/rows (`enter-up`, ~40ms step,
   ~500ms each, `backwards` fill so it doesn't pin `transform` and block hover).
2. **Dialog/sheet:** slide+fade in ~200ms, exit faster (~120ms).
3. **State change (status/assign/priority):** chip cross-fade + a single `sonner`
   toast for feedback.
4. **Kanban:** dnd-kit drag with a subtle lift shadow + spring settle on drop;
   this is the only place with optimistic UI.

Dashboard flourishes reuse the same restraint: **count-up** KPI numbers, **growing
bars**, a **line-draw** for charts (`flow-draw`), a resolution **gauge**. Sound is
a single Web-Audio chime for new notifications (with a mute toggle), primed on
first interaction (autoplay policy).

Everything degrades to instant/opacity-only under `prefers-reduced-motion` via a
global CSS block. Use `backwards`, not `both`, on entrance animations so a finished
animation never traps a `transform`.

---

## 9. Generative accent (the only "art," used sparingly)

A **deterministic seeded flow-field**, rendered to canvas/SVG, tinted with the
cobalt accent at very low opacity. Used only as (a) the login background and (b)
empty-state illustration. Seeded so it's stable per render; slow drift only;
pauses under reduced-motion; always behind content, never competing with text
contrast. No mesh-gradient-everything, no glowing orbs.

---

## 10. Data visualization

Charts are hand-built SVG driven entirely by the design tokens (see
`components/dashboard/flow-chart.tsx` as the reference implementation). Rules:

- **One axis.** Two series of the same unit share one scale (e.g. created vs
  resolved counts). Never a dual-axis chart.
- **Token-driven color.** Series use `var(--accent)` and `var(--status-*)` — never
  raw hex; text uses the ink tokens, never the series color.
- **Identity beyond color.** A legend is always present for ≥2 series; add a hover
  crosshair + a text caption so a data point is legible without color.
- **Recessive chrome.** Thin 2px marks, hairline gridlines at low opacity,
  10px muted axis labels, ~3.5px hover markers with a surface ring.
- **Accessible fallback.** Ship an `sr-only` data table mirroring the chart, and a
  deterministic date formatter (no locale) so SSR and client agree.
- **Motion.** Line-draw on mount (`flow-draw`) + area fade (`flow-fade`), both
  collapsing to instant under reduced-motion.

---

## 11. Reuse checklist (starting a new project)

1. Copy the token block (`globals.css`) + `@theme inline` mapping; keep the
   neutral/accent/shadow/radius scales; re-pick only the **status/priority**
   palette for the new domain.
2. Keep the three font roles (display / body / mono) and the mono-for-data rule.
3. Keep the shell (fixed sidebar + slim topbar), the readability rules
   (foreground data text, black semibold table headers), and the **modal
   close-only-via-X** default.
4. Keep the four motion effects and the reduced-motion block; don't add more.
5. Keep accessibility invariants: chips carry dot+label, focus rings visible,
   `sr-only` chart tables, deterministic dates.
6. Everything domain-specific (entities, lifecycle, sidebar sections) is the only
   thing you rewrite.
