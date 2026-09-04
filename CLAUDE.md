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
1. **Shell session**: Auth.js v5. Two providers, both real:
   **Google OAuth**, and **email + password** per user
   (`ld_erp_core.users.password_hash`, bcrypt cost 10 — the same cost Order
   Entry uses). The old shared-password `DEV_LOGIN_PASSWORD` provider is gone
   and that env var is read nowhere; delete it from any host it was copied to.

   **Password rule: six characters, and that is the whole rule.** Set by the
   owner (Sep 2026, lowered from ten). No complexity requirement, no rejected
   characters — spaces, punctuation, emoji and any alphabet are all valid, and
   nothing normalises them beyond a `.trim()` that every set-path applies
   identically. Do not reintroduce a stricter minimum or a "must contain a
   digit" rule; it was removed deliberately. The four constants are
   `MIN` in `(app)/settings/actions.ts` + `profile-form.tsx` and `PASSWORD_MIN`
   in `(app)/settings/users/actions.ts` + `user-edit-dialog.tsx` — the two
   server ones enforce, the two client ones only drive a disabled button.
   `ld_order_entry`'s own rule (`src/lib/order-entry/validation.ts`) was moved
   to 6 to match, so one ERP does not show two different rules; the standalone
   Order Entry app still says 8 on its own screens, which diverges but breaks
   nothing — login never checks length. **The one limit nobody can remove:
   bcrypt hashes at most 72 BYTES** and silently ignores the rest.
   The sign-in form itself has NO `minLength` — it proves knowledge of an
   existing password, and gating it there would lock out anyone holding one set
   under an older rule.

   **Every login failure is identical** — wrong password, unknown email, no
   password set, and deactivated account all return the same `null`, the same
   sentence, and the same TIMING (the bcrypt compare runs against a dummy hash
   when there is no stored one, so "no password" is not measurably faster).
   Do not add a distinguishing message; it turns the form into a directory.

   **`password_hash` leaves the server nowhere.** `src/lib/queries.ts` defines
   `publicUserColumns` and the hash is not in it; the only reader is the
   `password` provider in `src/auth.ts`. `getAllUsersOrdered` feeds
   `/admin/users`, which hands rows to a Client Component — `db.select()`
   there would serialise every hash into the page HTML.

   Split `src/auth.config.ts` (Edge-safe, no DB import — used only by
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

## Shell admin — `ld_erp_core.users.role`
`member` | `admin`, defaulting to `member`. This did not exist until Sep 2026
and its absence was a live privilege escalation: `/admin/users`,
`/admin/system-registry` and `/admin/access-control` sat behind nothing but
middleware's "are you signed in", and their three server actions had no check
at all — any employee could tick themselves into Order Entry.

- `src/lib/admin.ts` — `requireErpAdmin()` (throws, for ACTIONS),
  `getErpAdmin()` (returns the session or null, for PAGES), `getErpRole()`,
  `isErpAdmin()`. Use the throwing one in an action and the null-returning one
  in a Server Component: a throw there renders a raw 500 instead of a redirect,
  which is exactly what `/settings/users` did to a member until it was fixed.
- **Every mutating action under `/settings` calls `requireErpAdmin()` FIRST**,
  before reading its arguments. A server action is a POST endpoint; hiding the
  page does not hide it. Each admin TAB also guards itself and redirects — the
  settings layout cannot, because the profile tab beside them is for everybody.
- **`/admin/*` no longer exists.** Users / Access / Systems / Audit are tabs
  under `/settings`, because the four screens were real and working under
  `/admin` while `/settings` rendered "coming soon" — so the answer to "how do
  I add a user?" was a page saying the feature did not exist, one menu entry
  below the page that did it. Own-account actions live in
  `src/app/(app)/settings/actions.ts` and resolve the target from the SESSION,
  never an id parameter, so they structurally cannot touch anybody else.
- **Shell admin is not module admin.** Order Entry resolves its role from
  `ld_order_entry.users`, Help Slip from `ld_help_slip.profiles`. Neither
  consults this column, and a shell admin is not automatically allowed to
  delete an order.
- An admin cannot deactivate or demote themselves — with no active admin
  nobody can promote one back from inside the app.

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
- **Help Slip** (`/help-slip/*`, system_code `help-slip`): employee concerns
  — dashboard (forks by role), Raise a concern, My concerns, All concerns,
  concern detail, the coordinator workspace, Notifications. Ported from
  `github.com/harshalilinkd/LD-Help-Slip`; reads/writes the same live
  `ld_help_slip` schema. **English only** — the module was bilingual EN/HI when
  first ported, and that was removed wholesale in Sep 2026 because no other
  module in this ERP has Hindi. Do not reintroduce it: no `<Bi>`, no `.deva`
  or `.hi` classes, no `labelHi`/`titleHi`/`helperHi` props, no Devanagari
  font. `departments.name_hi` and `profiles.locale` still exist in the
  database (the standalone app is still live and reads them) — we simply
  never read them. `departments.name_hi` was cleared to NULL on the user's
  explicit instruction; the previous values are in
  `scratchpad/ld_help_slip-backup-before-english-only.json`.

## Help Slip — RLS is the security boundary, and we bypass it by default
**Read `src/db/help-slip/rls.ts` before writing any query against
`ld_help_slip`.** That module keeps its entire authorization model in Row
Level Security: which employee may see which concern, and which coordinator
may see a confidential (`hr_only`) one. Our pool connects as `postgres`,
which has `rolbypassrls` — a bare query returns everything, confidential rows
included, with no error and no warning.

- Every read and write goes through **`withCurrentUser`/`withHelpSlip`**,
  which opens a transaction, drops to the `authenticated` role and injects
  the caller's profile id as the JWT claim `auth.uid()` reads. The database
  then enforces exactly what it enforces for the standalone app.
- **One call per request**, wrapping all that request's queries.
  These transactions pin a connection and the pool is capped at 5; twelve
  concurrent calls wedged it. `withHelpSlipRoute` exists to make that shape
  the easy one.
- The single bypassing read is `unsafeLookupProfileByEmail` — named to be
  conspicuous. Do not add a second.
- Role is re-checked in `mutations.ts` **as well as** in RLS, because a
  zero-row UPDATE reports success and "saved" must never be said when
  nothing was.
- Writes go through the database's own functions (`raise_concern`,
  `resolve_concern`, `unresolve_concern`) — they are transactional and their
  triggers write the timeline, stamp `first_response_at` and fire
  notifications. Never re-implement those; you get two of each.
- **Never bind a JS array** into `db.execute` (`${arr}::text[]` arrives as
  its `toString` and Postgres rejects it). Pass JSON and expand with
  `jsonb_array_elements_text`.
- **Photo attachments ARE ported** (Sep 2026 — this was the last functional
  gap). `src/lib/help-slip/attachments.ts` + `POST|GET
  /api/help-slip/concerns/[id]/attachments` + `GET|DELETE
  /api/help-slip/attachments/[id]` + `<AttachmentsPanel>` on the concern page.
  Nothing was provisioned by this repo — `concern_attachments` and the private
  `concern-attachments` bucket already existed with RLS and live rows, and the
  storage path stays `{concern_id}/{uuid}.{ext}` because the bucket policies
  parse the concern id out of the first path segment. Change that shape and
  the standalone app can no longer read our files (and vice versa — verified
  both ways).
  - **Storage RLS does not protect us and cannot.** Those bucket policies read
    `auth.uid()`; the `set_config` trick in `src/db/help-slip/rls.ts` is a
    POSTGRES session setting and the Storage API never sees that transaction.
    So every storage call uses `SUPABASE_SERVICE_ROLE_KEY` and bypasses them.
    That is safe **only because the database is asked first, under RLS, on
    every path** — upload checks, download selects (zero rows → 404), delete
    lets the policy decide and only then removes the object. Never call into
    storage from anywhere that has not been through `withHelpSlip`.
  - Files are **proxied, never signed-URL'd**. A signed URL is a bearer token
    in a query string that keeps working for anyone holding it, and these
    photos can hang off `hr_only` concerns.
  - Needs `SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY` in the environment.
    The upload route is the ONE place that opens two RLS transactions in a
    request (check → upload → record); they are sequential, not concurrent,
    and the reason is written in the route.
- Not ported: realtime (we refetch instead), and Help Slip's own
  login/password/Google-linking — the ERP owns sign-in, Help Slip owns role.
  `profiles.id` is a FK to `auth.users`, so this app can edit a person but
  cannot create one.

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
- **Never run `npm run build` while `npm run dev` is running.** They share the
  one `.next` directory, so the production build replaces the chunks the dev
  server has open and the very next request dies with
  `Cannot find module './1331.js'` (or similar) from `webpack-runtime.js` —
  pointing at whatever route was unlucky, which makes it look like a code bug
  in that route. It is not. Reverting `package.json`/`package-lock.json` under
  a running dev server does the same thing via the vendor chunks. Either stop
  the dev server first, or accept that you must clear and restart afterwards.
- **The restart order matters** and getting it wrong corrupts `.next` again:
  kill the process → *wait for port 3000 to actually be free* → `rm -rf .next`
  → start. Clearing the cache while the old process is still exiting races it,
  and the symptom is a half-styled page or
  `Invariant: missing bootstrap script`. On Windows a `.next` delete can also
  fail with "Directory not empty" purely because of a file lock — verify the
  delete succeeded rather than assuming.
- **`ld_order_entry` and `ld_help_slip` both have RLS-related Supabase
  advisories** (RLS disabled on all 15 Order Entry tables; a few
  SECURITY DEFINER warnings on Help Slip) — pre-existing, not introduced by
  this repo, out of scope to fix here without an explicit decision.

## The dev server runs on port 3001, and that is deliberate
`npm run dev` is pinned with `-p 3001`. Two reasons, and the second is the one
that bites:

1. **Port 3000 belongs to the standalone LD Order Entry app**, which is often
   running on this machine. Unpinned, `next dev` silently walks to the next
   free port, so this app landed on 3000 some days and 3001 on others.
2. **Google OAuth breaks the moment the port moves.** Auth.js derives the
   redirect URI from the request host, so the callback becomes
   `http://localhost:<whatever>/api/auth/callback/google`, and Google rejects
   any URI not registered exactly — `Error 400: redirect_uri_mismatch`. A
   drifting port means an unpredictably broken sign-in.

**Authorised redirect URIs that must exist in Google Cloud Console** (APIs &
Services → Credentials → the OAuth 2.0 Client, client id `953470917441-…`):
```
http://localhost:3001/api/auth/callback/google
https://ld-silk-mills-erp.vercel.app/api/auth/callback/google
```
Production was already registered and works. If you change the dev port, add
the matching URI first — nothing in this repo can register it for you.

Diagnosing it: Google's error page carries a base64 `authError` query
parameter, and decoding it names the exact URI Google was handed. That is
faster and more reliable than guessing. Note that reaching
`accounts.google.com` is NOT proof sign-in works — the error page lives there
too, so a check must also assert the path is not `/signin/oauth/error`.

## Commands
```
npm run dev / build / lint      # dev serves on http://localhost:3001
npm run db:generate   # schema.ts -> new migration (ld_erp_core only)
npm run db:migrate    # apply pending migrations (ld_erp_core only)
npm run db:seed       # re-seed systems/users (idempotent upsert)
```

## Repo
`github.com/harshalilinkd/LD-Silk-Mills-ERP`, branch `main`. Order Entry's
own repo/deployment (`github.com/mastersystem-linkd/LD-Order-Entry`) and
Help Slip's are separate, untouched, and stay live permanently as fallback
— this repo never modifies them.
