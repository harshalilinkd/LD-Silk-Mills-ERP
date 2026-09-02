@AGENTS.md

# LD Silk Mills ERP Shell

Central entry point (login, sidebar, dashboard, module registry) for LD Silk
Mills' internal tools. Each module keeps its own database/schema; this repo
is the "building," not the "rooms" — except Orders, which was later ported
in as native pages (see Phase 3a below), not just linked to.

## Stack
Next.js 15 (App Router, TS strict) · Drizzle ORM + `postgres.js` · Auth.js v5
· Tailwind v4 + shadcn/ui on Base UI (`@base-ui/react`) · Supabase Postgres
(no `@supabase/supabase-js` — plain Postgres connection, same as Order Entry).

## Database — one Supabase project, three schemas
Project **"LD Silk Mills"** (`ygxnbmfmrwookrilpbfx`), region `ap-south-1`.
No Neon involved anywhere (an earlier Neon project existed for one day in
Phase 1 and was deleted — do not recreate it).

| Schema | Owner | Notes |
|---|---|---|
| `ld_erp_core` | **This repo, exclusively** | `users`, `systems`, `system_access`, `audit_logs`. Nothing else reads/writes it. |
| `ld_order_entry` | **Shared** with the standalone Order Entry app | Same live tables, same rows — no sync, no copy. A row written by either app is instantly visible in the other. |
| `ld_help_slip` | Help Slip app only | Not touched by this repo at all. |

`src/db/index.ts` opens the one shared `postgres.js` connection (`sql`),
reused by `src/db/order-entry/index.ts` for the second schema — one pool,
two Drizzle instances. `drizzle.config.ts` has `schemaFilter: ["ld_erp_core"]`
— **this repo must never generate or apply a migration against
`ld_order_entry`**; that schema's migrations are owned by the Order Entry
repo. `src/db/order-entry/schema.ts` is query-only, hand-mirrored from
`github.com/mastersystem-linkd/LD-Order-Entry`'s `db/schema.ts`.

`DATABASE_URL` in `.env.local` must be the Supavisor **Transaction pooler**
(port 6543), never the session pooler (5432) or direct connection.

## Auth — two layers, on purpose
1. **Shell session**: Auth.js v5, Google OAuth (credentials still TODO — see
   `.env.local`) plus a **temporary** shared-password `Credentials` provider
   (`DEV_LOGIN_PASSWORD` env var) for local testing before Google is wired
   up. Split `src/auth.config.ts` (Edge-safe, no DB import — used only by
   `src/middleware.ts`) vs `src/auth.ts` (full config, DB-touching
   callbacks) — `postgres.js` needs real Node APIs the Edge runtime doesn't
   have, so nothing DB-touching may ever be imported by middleware.
2. **Per-module authorization**: a user must already have a shell session to
   reach `/order-entry/*` or `/crm/*` at all. On top of that, each module's
   layout (`src/app/(app)/order-entry/layout.tsx`,
   `src/app/(app)/crm/layout.tsx`) calls
   `resolveOrderEntryAuthz(email)` (`src/lib/order-entry/authz.ts`), which
   looks the email up directly in `ld_order_entry.users` and resolves
   role/capabilities from `role_permissions` — **the same accounts and
   permissions Order Entry's own app uses**. Not found/inactive → a "not
   provisioned" screen, not a crash. There is no second login form for
   Orders/CRM; Order Entry's own bcrypt Credentials provider and login page
   were never ported.

**Remove the `DEV_LOGIN_PASSWORD` provider before Phase 2** (auth
hardening) — it's marked TEMPORARY in `src/auth.ts` and `.env.local`.

## Two specs, and which wins where
- **`docs/SCREENS.md`** — the source app's build-to-print spec (every region,
  field, size, behaviour) for the six Order Entry screens + the five CRM
  screens. It governs **layout, fields, logic and behaviour** for those
  screens. They are meant to be an exact clone of the old app.
- **`docs/DESIGN.md`** — governs the **palette and type** everywhere, and
  everything about the shell itself (login, sidebar, topbar, admin pages),
  which SCREENS.md does not cover.

Where they conflict on a shared primitive (e.g. SCREENS.md's `Input` at
h-[46px] vs the shell's h-8), keep the shell's version global and scope the
spec's version to the module — don't restyle screens the spec never covers.
Translate SCREENS.md's colour names to ours: `ink→text-1`, `ink-soft→text-2`,
`ink-muted→text-3`, `line→border`, `inset→chip`, `accent→primary`,
`accent-soft→accent`, `success/warning/danger→status-green/amber/red`.

**Use `.num`, never `font-mono`, on figures/money/dates** — it's tabular
figures in Manrope. SCREENS.md §0.3 rejects mono there (it reads as code on
screens that are mostly money), and Manrope's default digits are proportional,
so rupee columns stagger without it.

## Design system
`docs/DESIGN.md` is the single source of truth for every color/spacing/
typography value, sourced from the approved mockup
(`ld-silk-mills-erp-mockup.html`, not in this repo). When porting a
module's UI (like Orders), you restyle against this file — you do not
reuse the source app's own Tailwind classes, even though both apps happen
to use the same Base UI primitives.

**Two themes, dark default**: `src/app/globals.css` defines light tokens
on bare `:root` and dark overrides under `.dark` (added to `<html>` when
active). `src/components/shell/theme-toggle.tsx` flips it and persists to
`localStorage` (`ld-erp-theme`); a blocking inline script in
`src/app/layout.tsx` applies the saved choice before first paint. Never
hardcode a color — every raw `bg-white/N`/hex in a component is a color
that silently breaks in the other theme (this bit us once: `bg-white/5`
"neutral chip" idioms scattered across Orders/CRM pages were invisible
against a white light-mode background until replaced with the new
`bg-chip`/`bg-chip-strong` tokens). See `docs/DESIGN.md`'s Color tokens
section for the full light/dark table and the reasoning per token.

## Sidebar
Dynamic, driven entirely by `ld_erp_core.systems` + `system_access` — never
hardcoded. A system with `status != active` renders greyed/unclickable
regardless of any other setting. `src/lib/system-submenus.ts` is a small
hand-maintained map (not DB-driven) of which systems have a built sidebar
submenu; currently only `order-entry` does (Dashboard / New order / Orders
/ Order status / Operations / Settings, collapsible, auto-expands when
you're inside that section). Toggling a system's `status`/`route`/
`open_mode` in `/admin/system-registry` takes effect live, no redeploy.

## What's actually built vs. placeholder
- **Shell**: login, dynamic sidebar, topbar, dashboard, all 4 admin pages
  (`/admin/users`, `/admin/system-registry`, `/admin/access-control`,
  `/admin/audit-logs`) — real, functional.
- **Orders** (`/order-entry/*`, sidebar label "Orders" — system_code stays
  `order-entry`): Dashboard, Orders list/detail/create/edit, Order Status
  board — real, reads/writes live `ld_order_entry` data. Ported from Order
  Entry's own repo; see `src/lib/order-entry/*` and
  `src/app/api/order-entry/*`.
- **CRM** (`/crm/*`, own top-level sidebar entry, system_code `crm`):
  Follow-up queue (`/crm`), follow-up detail (`/crm/[id]` — a NEW dedicated
  route; the source app renders this as a draggable floating panel, this
  shell renders it as an ordinary page instead), Issues board
  (`/crm/issues`), Call log (`/crm/calls`), Customers (`/crm/customers`),
  CRM analytics (`/crm/analytics`) — real, reads/writes the same live
  `ld_order_entry` CRM tables (`crm_followups`,
  `crm_followup_attempts`, `crm_issues`, `crm_rating_criteria`,
  `crm_followup_ratings`, `crm_settings`) the standalone app uses. Ported
  from Order Entry's own repo; see `src/lib/order-entry/crm.ts` (pure
  vocabularies/derivations, dependency-free) + `crm-query.ts` (all reads,
  including the auto-reconcile that creates follow-up rows — there is no
  manual "create" anywhere) + `src/app/api/crm/*` +
  `src/components/order-entry/crm/*` (shared `Pill`/`StatusPill`/
  `SeverityPill`/`PriorityBar`, and CSS/SVG-only chart primitives — no
  `recharts` dependency; the source app's Recharts-based rating-trend chart
  was rebuilt as a small hand-rolled inline SVG, `RatingTrendLine`). The
  CRM admin config screen (rating-criteria CRUD, `crm_settings` editor) is
  NOT built — that's deferred to the Settings hub below; the API routes for
  it exist (`/api/crm/rating-criteria`, `/api/crm/settings`) but have no UI
  yet.
- **Operations tracking** (`/order-entry/tracking`): the index plus the
  per-order 7-stage board (`/tracking/[id]`), backed by
  `POST /api/order-entry/tracking/stage` and
  `GET /api/order-entry/orders/[id]/tracking`. Stage gating (order entry →
  stock checking → the five post-stock stages, which unlock only on
  `in_stock`) is enforced server-side by `applyStageProgress` in
  `src/lib/order-entry/workflow.ts` and mirrored in the board's UI. Untick
  and stock-downgrade never cascade-undo later work — both warn and leave
  it done.
- **Settings** (`/order-entry/settings/*`): Dropdown Master, Design
  Database, Time tracking, Users, Access, Trash — all real, ADMIN-only,
  backed by routes under `src/app/api/order-entry/` (lookups `[id]`/`bulk`,
  `design-database/*`, `stages/*`, `users/*`, `access`, `trash`,
  `orders/[id]/lines/[lineId]`). Note `design-database/` (admin CRUD) is a
  different endpoint from `designs/` (order-form autocomplete) — don't
  conflate them. User passwords use `bcryptjs` at cost 10, matching the
  Order Entry app they're shared with.
- **Everything in `docs/SCREENS.md` is now built**, including the CRM
  settings tab, the Tracking view (§4B — the default view of Orders, behind
  a `ViewSwitch`), and the five-stage draggable call panel (§7.2).

## Outbound integration — the order feed (`/api/export/orders`)
Two external systems pull orders from us. **We are the source; we never call
them.** `docs/SCOT-INTEGRATION.md` is the handover note given to the SCOT team
and is the contract of record.

| Env key | Consumer | Gets `rate`/`line_total`? |
|---|---|---|
| `EXPORT_API_KEY` | **Embroidery System** — called **"Knot"** in conversation | **No** |
| `EXPORT_API_KEY_SCOT` | **SCOT** (sales-coordinator dashboard) | **Yes** |

- Auth is a static `x-api-key`, compared in **constant time with no early
  exit**. The route sits **outside** the session middleware (`src/middleware.ts`
  excludes `/api/export`) — leave it there, or consumers get a 307 to `/login`
  and HTML where they expect JSON.
- Pricing is gated **per consumer**, not globally. SCOT asked for revenue;
  Embroidery never did. Don't widen it.
- `party_name` goes out **verbatim** — never trim, case-fold or "clean" it.
  SCOT resolves it against its own alias table, so a tidied name arrives as a
  brand-new unknown customer.
- Cancelled and soft-deleted lines are **emitted flagged, never hidden**, so
  consumers can remove them their side. The cancel/delete routes bump the
  order's `updated_at` so the next incremental pull re-emits it.
- `updated_since` is **inclusive** and ordering is `(updated_at, id)` —
  consumers dedupe on the stable ids.
- **Production must use the SAME key values as the standalone app**, so
  consumers change only the hostname at cutover. `.env.local` here holds
  throwaway dev keys, not the real ones.
- Both apps serve this feed off the same `ld_order_entry` data today, so
  nothing breaks until the old deployment is retired.
- Not ported: `lib/crr-match.ts` and the one-off CRR linking scripts. The
  `crr_customer_id` values already in the database are what the feed emits.

## Module conventions (post-SCREENS.md rebuild)
- The module's list screens are **client components on TanStack Query** with
  live debounced search and `placeholderData: (prev) => prev`. The shell's
  own pages stay server components — don't "harmonise" the two.
- Shared primitives live in `src/components/ui/` (`HScroll`, `Pager`,
  `StatCard`, `StatusBadge`, `Segmented`, `Reveal`, `Money`, `data-table`)
  and `src/components/order-entry/shared/` (`ViewSwitch`, `OrderFilters`,
  `useTrackView`, `useDebouncedValue`, `useColumnPrefs`, `csv`). Reuse them;
  §0.4 exists because these were hand-rolled inconsistently before.
- **`STAGE_DOT` has exactly one home**: `order-status/status-style.ts`. A
  second local copy drifted once and the same stage read purple on one screen
  and blue on two others.
- **There is no toast library here.** The source app used sonner; every
  message in this module is an inline banner instead. Don't add one without
  asking — several screens' error handling assumes the banner.
- `GET /api/order-entry/lookups` returns **`string[]`**, not row objects,
  unless you pass `?all=1`. Typing it wrong yields `[undefined]` and crashes
  on mount.
- **Help Slip**: still a plain external link (opens its own app in a new
  tab) — no integration work done.

## Known gotchas (hit these once already — don't re-discover them)
- **Base UI `Menu.Item` fires `onClick`, not `onSelect`.** This is a Base
  UI app, not Radix — `onSelect` on a `DropdownMenuItem` is silently a
  no-op (TypeScript won't catch it either, since `...props` is untyped
  passthrough). The topbar/sidebar "Log out" button shipped broken this
  way for a while: it visually existed and the menu closed on click, but
  `signOutAction()` never ran, because it was wired to `onSelect`. Always
  use `onClick` for menu item actions, and manually click through any new
  menu item once in a real browser — this class of bug produces zero
  TypeScript errors and zero console errors.
- **Base UI `Menu.GroupLabel` (`DropdownMenuLabel`) must be inside a
  `Menu.Group` (`DropdownMenuGroup`)** or it throws
  `MenuGroupContext is missing` at render time — crashes the whole
  dropdown, not just the label. Wrap it: `<DropdownMenuGroup><DropdownMenuLabel>...`.
- **Base UI `Button` + `render={<Link/>}`** needs `nativeButton={false}` or
  it logs an accessibility warning every render.
- **Never pass an icon *component* as a prop from a Server Component to a
  Client Component** (e.g. `<NavLink icon={IconFoo} />` from a server
  file) — React Server Components can't serialize component references
  across that boundary. Pass a rendered element instead: `icon={<IconFoo />}`.
- **Multiple `next dev` instances on the same `.next` build** fight over
  the server-actions encryption key and throw a Web Crypto `OperationError`
  on any inline server action. Only ever run one dev server; if a stray one
  is still listening on an old port, kill it before starting a new one.
- **Stale `.next` cache after deleting a source file** throws
  `Cannot find module for page: ...` on the next build — `rm -rf .next`
  fixes it.
- **`ld_order_entry` and `ld_help_slip` both have RLS-related Supabase
  advisories** (RLS disabled on all 15 Order Entry tables; a few
  SECURITY DEFINER warnings on Help Slip) — pre-existing, not introduced by
  this repo, out of scope to fix here without an explicit decision.

## Commands
```
npm run dev / build / lint
npm run db:generate   # schema.ts -> new migration (ld_erp_core only)
npm run db:migrate    # apply pending migrations (ld_erp_core only)
npm run db:seed       # re-seed systems/users (idempotent upsert)
```

## Repo
`github.com/harshalilinkd/LD-Silk-Mills-ERP`, branch `main`. Order Entry's
own repo/deployment (`github.com/mastersystem-linkd/LD-Order-Entry`) and
Help Slip's are separate, untouched, and stay live permanently as fallback
— this repo never modifies them.
