# design-system.md — Locked Visual Spec

## Concept
Calm, precise, modern-SaaS operations tool. Feels like a well-run control room:
neutral surfaces, one confident cobalt accent reserved for actions and active
state, data-dense but never cramped. Professional first, distinctive second.
NOT: purple-gradient-on-white, glassmorphism everywhere, decorative motion.

## Type
- Display / headings: **Cabinet Grotesk** (Fontshare) — 600/700.
- Body / UI: **Hanken Grotesk** — 400/500/600.
- Numeric / IDs / timestamps: **IBM Plex Mono** — 400/500 (tabular figures).
Scale: 12 / 14 / 16 / 18 / 20 / 24 / 32. Body 14–16, line-height 1.5. Ticket
numbers, dates, and metrics always in the mono face.

## Color (semantic tokens — never raw hex in components)
Light:
- bg `#FAFAFA`, surface `#FFFFFF`, surface-muted `#F4F4F5`, border `#E4E4E7`
- text `#18181B`, text-muted `#71717A`
- accent (cobalt) `#2563EB`, accent-hover `#1D4ED8`, accent-soft `#EFF3FF`
Dark (its own palette, not inverted):
- bg `#0B0B0F`, surface `#141419`, surface-muted `#1C1C22`, border `#27272E`
- text `#FAFAFA` (~90%), text-muted `#A1A1AA`
- accent `#3B82F6`, accent-soft `#16233F`
Status colors (chips): OPEN amber `#F59E0B` · IN_PROGRESS/REOPENED blue `#3B82F6`
· RESOLVED green `#10B981` · CLOSED zinc `#71717A`.
Priority: LOW zinc · MEDIUM slate · HIGH orange `#F97316` · URGENT rose `#F43F5E`.
Expose all as CSS variables in `globals.css`, map into Tailwind theme, drive dark
mode with the `class` strategy. Every status/priority chip must carry a shape or
label too (never color-only) for accessibility.

## Layout
App shell: fixed left sidebar (240px, collapses to icon rail < lg, drawer on
mobile) + slim topbar (search, theme toggle, avatar menu) + main. Dashboard = KPI
stat cards row (bento, uniform radius/shadow) then table/board. Ticket detail
opens as a right-side Sheet (drawer) from lists; the `/tickets/[number]` page is
the full-page fallback / deep link.

## Components
- Corner radius: 10px cards, 8px inputs/buttons, 999px chips. One shadow token for
  elevation, one for popovers — never random values.
- Buttons: solid cobalt primary (one primary per view), quiet ghost/secondary.
- Status & priority render as compact chips with a leading dot/icon.
- Tables: zebra-free, hover row highlight, sticky header, mono for number/date
  columns, right-aligned numerics.
- Empty states get the generative accent + one clear CTA.

## Motion (pick exactly these four, reuse everywhere)
1. Page/list load: staggered fade-up of cards/rows (40ms step, 200ms each).
2. Sheet/dialog: slide+fade in 200ms, exit faster (120ms).
3. Status/assign change: chip cross-fade + a single sonner toast.
4. Kanban: dnd-kit drag with subtle lift shadow + spring settle on drop.
Everything respects `prefers-reduced-motion` (reduce to instant/opacity-only).

## Generative accent (the only "art", used sparingly)
A deterministic seeded flow-field rendered to canvas, tinted with the cobalt
accent at very low opacity, used as: (a) the login screen background, (b) empty-
state illustrations. Seeded so it is stable per render; slow drift only, pauses on
reduced-motion. Keep it behind content, never competing with text contrast.
