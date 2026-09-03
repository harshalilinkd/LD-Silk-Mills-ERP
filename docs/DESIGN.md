# LD Silk Mills ERP — Design System

Source of truth: `ld-silk-mills-erp-mockup.html` (the approved dark-teal
enterprise design preview). Every screen in this repo — and, eventually,
the shared sidebar package other modules import — must follow these
exact tokens and component patterns. Do not introduce new colors, radii,
or spacing scales without updating this file first.

## Fonts

- **UI text:** Manrope — weights 400, 500, 600, 700, 800.
- **Numeric / tabular / monospace data** (stat values, emails in tables,
  keyboard-shortcut hints): IBM Plex Mono — weights 400, 500, 600.
- Load both from Google Fonts:
  `family=Manrope:wght@400;500;600;700;800&family=IBM+Plex+Mono:wght@400;500;600`
- Base body size: `14px`, line-height `1.5`.

## Text colour — the rule every module follows

**`--text-1` and `--text-2` are the same colour.** Hierarchy is carried by
**weight and size**, never by fading the colour.

On LIGHT that colour is pure black. On DARK it is a soft near-white, NOT pure
white — see § Dark, rule 2: `#ffffff` on a dark ground halates, and the glare
reads as blur. The two sides are not mirror images and should not be made into
them.

| | `--text-1` | `--text-2` | `--text-3` | `--text-placeholder` |
|---|---|---|---|---|
| Light | `#000000` | `#000000` | `#3f4650` | `#6a707c` |
| Dark | `#e7ecee` | `#e7ecee` | `#9ca9b0` | `#838f96` |
| Contrast on white | 21.0 : 1 | 21.0 : 1 | 9.5 : 1 | 5.0 : 1 |
| Contrast on `--surface` (dark) | 13.3 : 1 | 13.3 : 1 | 6.6 : 1 | 4.8 : 1 |

**Why this changed.** `--text-2` was `#2b3038` and `--text-3` was `#5c6270`, on
the reasoning that a table where the value and its caption weigh the same is
harder to scan. That is true in the abstract, and it lost against the actual
screens: those two tokens carry **583 of the ~930** text utilities in this app,
so most of what anybody reads was grey. The report back, twice, was that the
system "looks light and blurry". Weight and size do the same job without
costing legibility, so the ramp collapsed to black and the two remaining greys
became genuinely secondary rather than merely dimmer.

**Which token to use.**

- `text-text-1` — headings, values, anything a reader is looking *for*.
- `text-text-2` — body copy, labels, nav. Same black; kept as a separate token
  so a future adjustment does not have to touch 269 call sites.
- `text-text-3` — genuinely secondary and never load-bearing: timestamps,
  captions, helper text, "3 of 40". At 9.5 : 1 on light and 6.6 : 1 on dark it
  is a step down, not a fade out. If losing it would lose meaning, it is not
  `text-3`.
- `text-text-placeholder` — **empty form fields only.** This is the one thing
  that must stay light: a placeholder as dark as typed text makes an empty
  field look filled, which is worse than a faint one. `--muted-foreground`
  points here, not at `--text-3`. Never use it for content.

**Applies to every module, existing and future.** Use `text-text-1/2/3` — never
a hardcoded hex, never a Tailwind palette grey (`text-gray-500` and friends
bypass the themes and will be wrong in one of them). Every value above clears
WCAG AA; the first three clear AAA.

**Table headers are `font-bold text-text-1`**, uppercase with
`tracking-[0.04em]`. Not `font-semibold`, not muted — a column header is a
label for everything beneath it and has to survive being scanned past. The
`Th` in `src/components/ui/data-table.tsx` already does this; match it in any
hand-rolled table.

## Color tokens

The dark palette below is exact hex/rgba from the mockup — not
approximations. **The app now ships two themes**, dark (the original,
still the default for every new visitor) and light (its complement) —
toggled via `src/components/shell/theme-toggle.tsx`, persisted to
`localStorage` (`ld-erp-theme`), applied before first paint by a blocking
script in `src/app/layout.tsx` so there's no flash of the wrong theme. Both
are defined in `src/app/globals.css`: light values live on bare `:root`,
dark values override them under `.dark` (added to `<html>` when dark is
active). Never add a new color as a hardcoded hex/rgba in a component —
add a token here and to `globals.css` instead, so it resolves correctly in
both themes.

### Dark (default)

**Dark is not light inverted.** Three rules govern this table, and all three
were learned by shipping the opposite:

1. **The ground is not black.** It was `#090c0e`. Combined with rule 2 that
   produced the maximum contrast a screen can emit, on every surface, at all
   times — and left a card indistinguishable from the page it sat on.
2. **The text is not pure white.** It briefly was, when the light side went to
   pure black and mirroring looked consistent. `#ffffff` on a near-black ground
   **halates**: glyph edges bloom and thin strokes shimmer, which at 13px reads
   as blur. Maximum contrast is not maximum legibility. `#e7ecee` still reads
   as white and stops glowing.
3. **Saturated hues vibrate on dark.** The status colours were Tailwind's 400
   tones, tuned for white backgrounds. On near-black they buzz, and six of them
   on one screen reads as gaudy rather than informative. Each lost roughly 15%
   saturation and gained a little body — same hue, so a green badge is still
   green.

| Token | Value | Use |
|---|---|---|
| `--bg` | `#13181c` | Page background |
| `--surface` | `#1d2329` | Cards, sidebar, topbar |
| `--surface-2` | `#272f36` | Hover state, recessed wells |
| `--surface-3` | `#313b43` | Avatar background, dropdown item hover |
| `--border` | `rgba(255,255,255,.12)` | Default hairline border — also the table row rule |
| `--border-strong` | `rgba(255,255,255,.21)` | Emphasized border (dropdowns, focus) |
| `--text-1` | `#e7ecee` | Primary text |
| `--text-2` | `#e7ecee` | Body text — same as `--text-1`, see § Text colour |
| `--text-3` | `#9ca9b0` | Muted / tertiary |
| `--text-placeholder` | `#838f96` | Empty form fields only |
| `--chip` | `rgba(255,255,255,.08)` | Neutral badge/chip fill |
| `--chip-strong` | `rgba(255,255,255,.15)` | Neutral hover fill, low-priority bar |
| `--accent-text` | `#52d3c0` | Accent text/links on the page background |
| `--accent-dim` | `rgba(45,212,191,.14)` | Accent background fill (active nav, active KPI icon bg) |
| `--green` | `#5cc98c` | Success / "active" status |
| `--green-dim` | `rgba(92,201,140,.14)` | Success background fill |
| `--amber` | `#e3ad4e` | Warning / "coming soon" |
| `--amber-dim` | `rgba(227,173,78,.14)` | Warning background fill |
| `--red` | `#ef8080` | Destructive / notification dot |
| `--red-dim` | `rgba(239,128,128,.14)` | Destructive background fill |
| `--blue` | `#71a6ef` | Informational accent |
| `--blue-dim` | `rgba(113,166,239,.14)` | Informational background fill |
| `--purple` | `#b48ceb` | Reserved accent |
| `--purple-dim` | `rgba(180,140,235,.14)` | Reserved accent background |

Measured on `--surface`: text 13.3 : 1 · muted 6.6 : 1 · accent 8.6 : 1 ·
green 7.7 : 1 · amber 7.8 : 1 · red 6.1 : 1 · blue 6.3 : 1 · purple 6.0 : 1 ·
placeholder 4.8 : 1. Every one clears WCAG AA; text and accent clear AAA.
**A new dark value goes in this table only after its contrast on `--surface`
has been measured, not estimated** — the placeholder landed at 3.79 : 1 on the
first arithmetic pass and was raised until it cleared, rather than shipped.

**How these numbers were arrived at.** The ground sat too low twice (`#090c0e`,
then `#0f1417`) and was rejected both times. Four candidates were then put side
by side — a soft slate `#1b2027`, a warm charcoal `#1c1a19` and a deep
`#0b0f11` — and the answer was "balance between 1 and 3". Every value above
except the placeholder is the arithmetic midpoint of those two, channel by
channel. Guessing a fourth time was the thing to avoid.

### Light

Built as light mode's complement, not an afterthought: the page canvas is
a soft cool-grey (never stark white) so pure-white cards read as
"elevated" above it — the same lighter-means-more-elevated relationship
the dark theme has (`surface` lighter than `bg`), just inverted in
absolute lightness. Status hues are deepened (600/700-weight, not the dark
theme's pastel 400s) so they hold WCAG-AA-ish contrast directly on white;
their `-dim` fills stay the same low-alpha-wash idea. `--accent` (brand
teal) is deliberately identical in both themes — see the comment above
`--primary` in `globals.css` for why. `--accent-text` is the one accent
token that DOES change: it's teal sitting directly on the page (links, the
greeting name, active-nav text), and the dark theme's pale `#5eead4` would
all but disappear on white.

| Token | Value | Use |
|---|---|---|
| `--bg` | `#f4f6f6` | Page background |
| `--surface` | `#ffffff` | Sidebar, topbar background |
| `--surface-2` | `#eef2f2` | Hover state background |
| `--surface-3` | `#e4e9e9` | Avatar background, dropdown item hover |
| `--border` | `rgba(15,23,23,.08)` | Default hairline border |
| `--border-strong` | `rgba(15,23,23,.14)` | Emphasized border (dropdowns, focus) |
| `--text-1` | `#000000` | Primary text |
| `--text-2` | `#2b3038` | Secondary text |
| `--text-3` | `#5c6270` | Muted / tertiary text, placeholders |
| `--chip` | `rgba(15,23,23,.045)` | Neutral badge/chip fill |
| `--chip-strong` | `rgba(15,23,23,.09)` | Neutral hover fill, low-priority bar |
| `--accent-text` | `#0f766e` | Accent text/links on the page background |
| `--accent-dim` | `rgba(15,118,110,.10)` | Accent background fill (active nav, active KPI icon bg) |
| `--green` | `#15803d` | Success / "active" status |
| `--green-dim` | `rgba(21,128,61,.10)` | Success background fill |
| `--amber` | `#b45309` | Warning / "coming soon" |
| `--amber-dim` | `rgba(180,83,9,.10)` | Warning background fill |
| `--red` | `#dc2626` | Destructive / notification dot |
| `--red-dim` | `rgba(220,38,38,.10)` | Destructive background fill |
| `--blue` | `#2563eb` | Informational accent |
| `--blue-dim` | `rgba(37,99,235,.10)` | Informational background fill |
| `--purple` | `#7c3aed` | Reserved accent |
| `--purple-dim` | `rgba(124,58,237,.10)` | Reserved accent background |

### Shared (identical in both themes)

| Token | Value | Use |
|---|---|---|
| `--accent` / `--primary` | `#2dd4bf` | Brand teal — badge/button FILLS only (self-contained, so it never needs a per-theme variant the way `--accent-text` does) |
| `--primary-foreground` | `#04211d` | Text/icon color sitting on top of an `--accent` fill |

## Layout constants

| Token | Value |
|---|---|
| `--radius` | `10px` — the default card/button radius |
| Small radius (nav items, icon buttons, badges) | `8px` |
| Pill radius (status tags, "Soon" badge, checkboxes' rounded corners) | `99px` (full pill) |
| `--sidebar-w` | `264px` |
| `--sidebar-w-collapsed` | `72px` (icon-only, collapsible) |
| Topbar height | `66px` |
| Content padding | `28px`, max-width `1240px` |

## Sidebar

- Brand mark: `32×32`, radius `8px`, gradient `155deg, var(--accent) → #0d9488`, "LD" in IBM Plex Mono 600 13px, dark text (`#04211d`).
- Brand text: line 1 `14.5px/700`, line 2 (subtitle) `11px`, `var(--text-3)`.
- Nav item: `8px 10px` padding, `8px` radius, `11px` icon-to-label gap, `13.5px/500` label, 1px transparent border.
  - Default: `var(--text-2)`, hover → `var(--surface-2)` bg + `var(--text-1)`.
  - **Active**: bg `var(--accent-dim)`, text `var(--accent-text)`, border `rgba(45,212,191,.22)`.
  - **Disabled** ("coming soon"): text `var(--text-3)`, no hover state, not clickable.
- "Soon" pill: `9.5px/600`, uppercase, letter-spacing `.03em`, padding `2px 6px`, radius `99px`, bg `var(--amber-dim)`, color `var(--amber)`.
- External-link icon (`12×12`, `var(--text-3)`) appears next to any *active* system row, since Phase 1/2 systems open in a new tab, not an internal route. This is deliberately honest — never hide that a link is external.
- Category headers: uppercase, `10.5px/700`, letter-spacing `.07em`, `var(--text-3)`, collapsible with a chevron that rotates `-90deg` when collapsed.
- Sidebar footer: user card (avatar `32×32` radius `8px` square — **not** a circle — initials in `var(--accent-text)`, name `13px/600`, role/subtitle `11.5px` `var(--text-3)`) + a collapse toggle button.
- Collapsed state (`72px` wide): labels, pills, and category headers hide; nav items center their icon.

## Topbar

- `66px` tall, sticky, `1px` bottom border, background `var(--bg)`.
- Greeting block: line 1 `14.5px/600` ("Good {morning/afternoon/evening}, **{first name}**" — the name is `var(--accent-text)`), line 2 `11.5px` `var(--text-3)` (today's date, localized).
- Search input: full width up to `420px`, left-aligned in the remaining space, `var(--surface)` bg, `1px` border, radius `8px`, left search icon, right `⌘K` kbd hint styled as a small bordered chip (IBM Plex Mono, `10px`).
- Icon buttons (theme toggle, notification bell, etc.): `36×36`, radius `8px`, transparent by default, `var(--surface-2)` bg + border on hover. The theme toggle sits immediately left of the notification bell — sun icon while dark (click to go light), moon icon while light.
- Avatar button: `36×36`, radius `8px` (**square, not circle**), `var(--surface-3)` bg, `1px` border-strong, initials in `var(--accent-text)`.
- Dropdowns (notification / avatar menu): `var(--surface-2)` bg, `1px` border-strong, radius `10px`, drop shadow `0 12px 32px rgba(0,0,0,.4)`, `6px` internal padding. Header row shows name (`13px/600`) + email (`11.5px`, `var(--text-3)`). Items are `13px`, `var(--text-2)`, hover → `var(--surface-3)` bg + `var(--text-1)`.
- Empty notification state: centered, `12.5px`, `var(--text-3)`, just says "No notifications yet" — no icon needed at this size.

## Page header

- `h1`: `22px/700`, letter-spacing `-.01em`.
- Subtitle `p`: `13px`, `var(--text-3)`, `4px` margin-top.

## Cards

- Base card: `var(--surface)` bg, `1px` `var(--border)`, radius `var(--radius)` (`10px`).
- KPI card: `18px` padding. Icon swatch `32×32`, radius `8px`, colored bg per metric (accent/blue/amber/muted). Value `26px/700`, letter-spacing `-.02em`, **IBM Plex Mono** for real numbers; `15px/600` `var(--text-3)` (not mono) for a text placeholder like "No data yet". Label line: `12px` `var(--text-3)`, formatted as `"{Label} · {sub-detail}"` with a middle dot.
- Two-column panel grid: `1.3fr / 1fr`, `14px` gap. Panel padding `18px 20px`. Panel header: `h2` `14.5px/700`, `p` `11.5px` `var(--text-3)`.

## System status rows (used in the dashboard panel)

- Flex row, `12px` gap, `10px 4px` padding, `1px` bottom border (no border on last row).
- Status dot `7×7`, full radius: **on** = `var(--green)` with a soft glow (`box-shadow: 0 0 0 3px var(--green-dim)`); **off** = `var(--text-3)`, no glow.
- System name `13px/600`, flex-1. Category label `11px`, `var(--text-3)`.
- Status tag pill: `10.5px/600`, padding `3px 8px`, radius `99px`; **on** = `var(--green-dim)` bg / `var(--green)` text; **off** = `rgba(255,255,255,.05)` bg / `var(--text-3)` text.

## Empty states

- Centered column, `44px 20px` padding, `var(--text-3)`.
- Icon `30×30`, `var(--text-3)`.
- Title `13.5px/600`, `var(--text-2)`.
- Description `12px`, max-width `260px`, `var(--text-3)`.

## Tables

- `th`: `11px/600`, uppercase, letter-spacing `.04em`, `var(--text-3)`, padding `0 14px 10px`, bottom border.
- `td`: `12px 14px` padding, bottom border, `var(--text-2)`; last row has no bottom border.
- `.strong` cell (primary identifier, e.g. a name): `var(--text-1)/600`.
- Email / numeric cells: IBM Plex Mono.
- Status badge: pill, `10.5px/600`, padding `3px 8px`, radius `99px` — color-coded per status the same way as the status tag above (green for active, muted gray for inactive/coming-soon).
- Checkbox (access-control grid): `17×17`, radius `5px`, `1.5px` `var(--border-strong)` border. Checked = `var(--accent)` fill + border, white checkmark icon inside (`#04211d` stroke, matches the brand-mark's dark-on-teal treatment).

## Placeholder / "coming soon" pages

- Centered card, `60px 30px` padding.
- Icon `34×34`, `var(--text-3)`.
- Heading `15px/600`.
- Body `12.5px`, `var(--text-3)`.

## Toasts (transient feedback)

- Fixed bottom-right, `22px` offset, stacked with `8px` gap.
- `var(--surface-2)` bg, `1px` border-strong, radius `10px`, padding `12px 16px`, shadow `0 12px 28px rgba(0,0,0,.45)`.
- Icon `15×15`, `var(--accent-text)`.
- Auto-dismiss after ~2.6s with a fade-out.

## Icons

The mockup uses a hand-drawn inline SVG sprite (stroke-based, `1.6px`
stroke width, rounded caps/joins, `18×18` default). In the Next.js app,
use **Tabler Icons** (`@tabler/icons-react`, already installed) as the
equivalent icon set — pick the closest-matching glyph per mockup symbol
and keep the same default size (`18px` / Tailwind `size-[18px]`, or
`16px`/`size-4` inside nav items to match the mockup's slightly smaller
in-context icon rendering) and stroke width. Never mix in a second icon
library.

## What "100% same" means in practice

The mockup is static HTML/CSS/vanilla-JS; the real app is Next.js +
Tailwind + shadcn (Base UI) + React Server Components. We are not
embedding the mockup's HTML/JS — we are reproducing its exact visual
output (every color, size, spacing, and interaction state listed above)
using the app's real component architecture, with real data instead of
the mockup's hardcoded arrays. Any shadcn default that conflicts with a
value in this file (e.g. shadcn's default rounded-full avatars vs. this
system's rounded-8px square avatars) is overridden to match this file,
not the other way around.
