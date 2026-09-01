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

## Color tokens

All colors are exact hex/rgba from the mockup — not approximations.
This is a **single fixed dark theme**, not a light/dark toggle.

| Token | Value | Use |
|---|---|---|
| `--bg` | `#090c0e` | Page background |
| `--surface` | `#0f1417` | Sidebar, topbar background |
| `--surface-2` | `#141a1e` | Hover state background |
| `--surface-3` | `#191f24` | Avatar background, dropdown item hover |
| `--border` | `rgba(255,255,255,.07)` | Default hairline border |
| `--border-strong` | `rgba(255,255,255,.13)` | Emphasized border (dropdowns, focus) |
| `--text-1` | `#eef1f2` | Primary text |
| `--text-2` | `#98a3a8` | Secondary text |
| `--text-3` | `#5e6a70` | Muted / tertiary text, placeholders |
| `--accent` | `#2dd4bf` | Primary accent (teal) |
| `--accent-dim` | `rgba(45,212,191,.14)` | Accent background fill (active nav, active KPI icon bg) |
| `--accent-text` | `#5eead4` | Accent text on dim backgrounds |
| `--green` | `#4ade80` | Success / "active" status |
| `--green-dim` | `rgba(74,222,128,.13)` | Success background fill |
| `--amber` | `#fbbf24` | Warning / "coming soon" |
| `--amber-dim` | `rgba(251,191,36,.13)` | Warning background fill |
| `--red` | `#f87171` | Destructive / notification dot |
| `--red-dim` | `rgba(248,113,113,.13)` | Destructive background fill |
| `--blue` | `#60a5fa` | Informational accent (e.g. "Total users" KPI) |
| `--blue-dim` | `rgba(96,165,250,.13)` | Informational background fill |
| `--purple` | `#c084fc` | Reserved accent (unused so far) |
| `--purple-dim` | `rgba(192,132,252,.13)` | Reserved accent background |

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
- Icon buttons (notification bell, etc.): `36×36`, radius `8px`, transparent by default, `var(--surface-2)` bg + border on hover.
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
