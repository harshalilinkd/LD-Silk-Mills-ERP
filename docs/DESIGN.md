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

**The page must be visibly darker than a card.** It was `#f4f6f6` behind
`#ffffff` — 1.085 : 1, white on near-white — so nothing looked raised and the
app read as one flat sheet with lines drawn on it. That is the identical fault
that made dark mode "gaudy and unpleasant", and it was measured and fixed the
same way: the ground drops until a card is visibly a card. `#e9edee` gives
1.179 : 1, slightly more than dark's 1.127, with black text still at 17.8 : 1.

`--surface-2` and `--surface-3` had to come up with it. `--surface-2` is the
recessed tone for wells and hover INSIDE a card, so it has to sit BETWEEN the
card and the page; left at `#eef2f2` it would now be lighter than the page
behind it, and a recessed well would read as raised.

**When adding a light value, measure card-vs-page separation, not just text
contrast.** Every text token here clears AA on white (black 21.0, muted 9.5,
placeholder 5.0, accent 5.5, green 5.0, amber 5.0, red 4.8) — and all of that
was already true while the app looked flat, because legibility and depth are
different problems.

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
| `--bg` | `#e9edee` | Page background |
| `--surface` | `#ffffff` | Sidebar, topbar background |
| `--surface-2` | `#f2f5f5` | Hover state background |
| `--surface-3` | `#e7ecec` | Avatar background, dropdown item hover |
| `--border` | `rgba(15,23,23,.11)` | Default hairline border |
| `--border-strong` | `rgba(15,23,23,.18)` | Emphasized border (dropdowns, focus) |
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
- **Subtitle hides on mobile** (`hidden text-[13px] text-text-3 sm:block`): it
  restates what the screen already shows and costs a full line above the fold
  on a phone. Keep it on desktop, where the room is free.
- A page whose list has a **rare, secondary date-range filter** puts a
  calendar icon-button here, right-aligned via `flex items-start
  justify-between gap-3` on the header row — not a row of two date inputs in
  the toolbar below. See § List screens for the trigger + popover shape and
  why it's lifted this high.

## Dialogs — one shape, and it is already built

Written down after the Checklist shipped five hand-rolled dialogs that looked
like a different application: a different title weight, uppercase tracked
field captions, a plain footer, and its own buttons. None of that was a
decision — it was a component built without reading this file first.

**Always use the shell's `Dialog`.** `src/components/ui/dialog.tsx` (Base UI).
Do not build an overlay by hand. It already gives you the backdrop, the escape
key, the scroll lock, the focus handling and the close button top-right.

```tsx
<Dialog open={open} onOpenChange={(next) => { if (!next) close(); }}>
  <DialogContent className="max-h-[85dvh] overflow-auto sm:max-w-md">
    <DialogHeader>
      <DialogTitle>Edit user</DialogTitle>
    </DialogHeader>

    <div className="flex flex-col gap-4 py-2">
      <label className="flex flex-col gap-1.5">
        <span className="text-xs font-medium text-text-2">Name</span>
        <Input … />
      </label>
      {/* two short fields share a row */}
      <div className="grid grid-cols-2 gap-3">…</div>
    </div>

    <DialogFooter>
      <Button variant="outline" onClick={close}>Cancel</Button>
      <Button onClick={save} disabled={busy}>Save</Button>
    </DialogFooter>
  </DialogContent>
</Dialog>
```

**The rules that keep them looking like one another:**

- **Title**: `<DialogTitle>` and nothing else — 16px medium from the heading
  face. Never restyle it. A one-line explanation goes under it as a
  `text-[12.5px] text-text-3` paragraph inside the header.
- **Field captions**: **`text-[13px] font-medium text-text-2`**, sentence case,
  above the control, `gap-1.5`. This is `order-form.tsx`'s `Field` label, which
  Help Slip's type scale already cites by name as the ERP form label — so it
  is the value with the most claim to being the standard, and the audit below
  found four dialogs quietly using 12px or 12.5px instead. **Not** an uppercase
  tracked caption — that one belongs to filter panels (see § List screens),
  and having both on one screen is what made the Checklist read as borrowed.
- **Body**: `flex flex-col gap-4 py-2`. Two short fields share a row with
  `grid grid-cols-2 gap-3`; anything longer gets its own.
- **Footer**: `<DialogFooter>`. It is a tinted bar with a top border and it
  right-aligns at `sm:` — do not replace it with a plain flex row. Actions are
  the shell's `<Button>` at default size: `variant="outline"` to cancel,
  default to confirm. A destructive confirm keeps the same Button and takes a
  red background, rather than becoming a bespoke element.
- **Width**: `sm:max-w-md` for a form, `sm:max-w-sm` for a confirmation,
  `sm:max-w-2xl`/`3xl` for something with a table in it. Always pair a wide or
  tall dialog with `max-h-[85dvh] overflow-auto` — a dialog taller than the
  viewport hides its own Save button.

**Native `<input type="date">` inside a dialog is fine.** The order form has
done it in production for months. An earlier assumption that the focus trap
would fight the browser's calendar popup was never tested and is wrong; it
cost a whole parallel dialog implementation.

**A date field that means "from now" defaults to today**, not to the start of
a period. A task created in September that defaults to 1 April silently
generates five months of already-overdue rows.

### The four caption styles, and which is which

Counted across the whole app after the owner asked for uniformity. There were
**thirteen** variants of the small uppercase caption alone, eight of them
introduced by one module. There are four legitimate roles; anything else is
drift.

| Role | Class | Where |
|---|---|---|
| **Form field label** | `text-[13px] font-medium text-text-2` | above any input, in a dialog or a form card |
| **Section heading** inside a dialog or card | `text-[11px] font-semibold tracking-[0.06em] text-text-3 uppercase` | "Account", "Access", "By department" |
| **Filter panel caption** | `text-[11px] font-medium text-text-2` | inside a collapsed Filters panel only — see § List screens |
| **Table header** (`th`) | `text-[11px] font-bold tracking-[0.04em] uppercase` | `text-text-1` on a data table, `text-text-3` on a quieter one |

A small chart axis caption may drop to `text-[10px] font-semibold
tracking-[0.06em] text-text-3 uppercase`. `<Eyebrow>` is a different thing
again — a pill on the accent wash that marks a MODE ("Editing"), not a caption.

**Before adding a fifth, check this table.** Every one of the thirteen was
somebody reaching for a size that felt right in the moment.

## List screens — the filter & toolbar pattern

Established on Orders and carried onto every CRM list (Issues, Call log,
Customers) after the CRM screens shipped with an inline filter bar that ran
above the KPI tiles and never collapsed — three rows deep before the first
real row of data on a phone. This is the shape every future list screen
should start from.

**Order, top to bottom, always:**

1. KPI tiles.
2. One toolbar row: the primary control(s) — usually search, sometimes also
   sort — plus a **Filters** toggle button and Refresh.
3. The Filters panel, collapsed by default, directly below the toolbar.
4. The list/table.

**What counts as "primary" and stays in the toolbar, never behind Filters:**
search (it's how you find one row) and sort (it reorders the same set rather
than narrowing it). Everything that narrows the set — status, category,
severity, owner, rating, "show only X" — collapses behind Filters.

**The Filters button:**

```tsx
<Button variant="outline" onClick={() => setShowFilters(s => !s)} aria-pressed={showFilters}>
  <IconFilter className="size-4" /> Filters
  {hasActiveFilters ? <span className="ml-1 size-1.5 rounded-full bg-primary" /> : null}
</Button>
```

The dot is the only "something is filtered" signal — don't also change the
button's own color or label; a wall of active-state buttons is louder than
one dot.

**The panel**, shown only when `showFilters` is true:

```tsx
<div className="flex flex-col gap-3 rounded-field border border-border bg-surface-2 p-3">
  <div className="grid grid-cols-2 gap-x-3 gap-y-2.5 sm:grid-cols-4">
    <label className="flex flex-col gap-1 text-[11px] font-medium text-text-2">
      Status
      <select className="h-9 w-full rounded-field border border-border bg-surface px-2.5 text-[12.5px] text-text-1 …">
    </label>
    {/* one label per filter field */}
  </div>
  {hasActiveFilters ? (
    <div className="flex justify-end">
      <Button variant="ghost" size="sm" onClick={clearAll}>Clear filters</Button>
    </div>
  ) : null}
</div>
```

Every field gets its own `<label>` with an `[11px]` caption above the
control — this is a panel someone opened on purpose to look at, unlike the
one-line toolbar, so the extra vertical cost of a label per field is worth
the field being self-explanatory.

**A date range is a header icon, not a toolbar row.** Two `<input
type="date">` plus a separator plus a Clear button is wide enough to force
everything else onto a second line on a phone, for a filter that's used far
less often than search or status. Lift the `from`/`to` state to the page
component and render the trigger in the page header (see § Page header):

```tsx
<Popover>
  <PopoverTrigger className={cn(
    "relative grid size-9 shrink-0 place-items-center rounded-field border border-border bg-surface text-text-2 hover:border-border-strong hover:text-text-1",
    hasDateFilter && "border-primary/50 text-primary",
  )}>
    <IconCalendar className="size-4" />
    {hasDateFilter ? <span className="absolute top-1 right-1 size-1.5 rounded-full bg-primary" /> : null}
  </PopoverTrigger>
  <PopoverContent align="end" className="w-auto">
    {/* From/To inputs + Clear, same as any other panel */}
  </PopoverContent>
</Popover>
```

The board component takes `from`/`to` as plain props — it only reads them
into the query string, it never renders date inputs itself.

**Mobile stacking — search never gets squeezed.** A toolbar row with search
plus a sort `<select>` plus Filters plus Refresh does not fit one line on a
phone; letting it `flex-wrap` mid-word looks broken. Instead, give search its
own full-width row and fold the rest into a second row that **merges back
into one line at `sm:`** using `display: contents`, so there is one class
change instead of two parallel layouts:

```tsx
<div className="flex flex-col gap-2 sm:flex-row sm:items-center">
  <div className="relative w-full sm:min-w-[180px] sm:flex-1">{/* search */}</div>
  <div className="flex items-center gap-2 sm:contents">
    <select className="… flex-1 sm:w-auto sm:flex-none" />
    <Button variant="outline">Filters</Button>
    <button>{/* refresh */}</button>
  </div>
</div>
```

**A secondary breakdown/rail panel is desktop-only.** The Issues board's
"group by department / category" side panel earns its keep next to a wide
table (`hidden h-fit … lg:block` in a `lg:grid-cols-[232px_1fr]` grid) but on
a phone it's a whole extra card — border, padding, a segmented control — for
what the Filters panel's Owner/Category fields already cover. Hide it below
`lg` rather than trying to compress it; it is a convenience, not a filter you
lose access to.

**An explanatory banner that repeats what the empty state already says is
desktop-only too** (`hidden … sm:block`): "no follow-up completed yet, so
these columns are blank" is worth a card on a wide screen and is dead weight
above a toolbar on a phone, where the blank columns are one thumb-scroll
away.

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

## App icon (browser tab, bookmark, phone home screen)

`src/app/icon.svg` — a **spool of silk thread**: a dark spool on the brand
teal, in a `rx="7.5"` rounded square. Next.js picks it up from that filename,
no `metadata.icons` entry needed. `src/app/apple-icon.png` is the same mark at
180×180 for iOS. The stock Next.js `favicon.ico` was **deleted**; leaving it
there is why the tab showed a generic mark for weeks.

Two rules came out of getting this wrong three times, and they apply to any
future mark:

- **A tab icon is 16px, so it gets a SILHOUETTE, not a pattern.** A 3×3 weave
  was tried first and failed twice: in one colour the threads merge where they
  cross and it reads as a window; in two colours the interlace is visible at
  64px and gone by 16, where each thread is two pixels and the mark collapses
  into a letter "I". A spool works because wide-flange / narrow-waist /
  wide-flange is an outline nothing else in a tab strip shares.
- **Bright ground, dark mark — never the reverse.** The browser tab strip is
  near-black in this app's usual setting, so a dark-grounded icon disappears
  into it. Teal (`#14b8a6`) holds on a dark strip and a light one.

Detail inside the mark is cut as GROUND-COLOURED GAPS rather than drawn as
lines: a 1px line vanishes at 16px, a gap the ground shows through does not.

Judge any replacement at real size before shipping it — render it at 16 / 20 /
32 / 64 and magnify with **nearest-neighbour**, so you are looking at the
actual pixels rather than a smoothed guess. Every failure above looked fine at
128px.

The **sidebar** keeps its "LD" monogram tile. That is deliberate: at 28px, with
the words "LD Silk Mills ERP" beside it, letters are legible and identify the
company; in a tab strip they are two grey smudges.

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
