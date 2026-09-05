@AGENTS.md

# LD Silk Mills ERP Shell

Central entry point (login, sidebar, dashboard, module registry) for LD Silk
Mills' internal tools. Each module keeps its own database/schema; this repo
is the "building," not the "rooms" — except Orders, which was later ported
in as native pages (see Phase 3a below), not just linked to.

## Where this stands (Sep 2026)

Six modules are built and verified against live data: **Orders**, **CRM**,
**Help Slip**, **Goods Return LR**, **AI Assistant** and **Checklist**. NBD,
SCOT and Petty Cash are still `coming_soon` placeholders in
`ld_erp_core.systems`, and `/reports` is the shell's own reports screen.

Four things are outstanding, and none of them is code:

1. **The AI Assistant needs an `ANTHROPIC_API_KEY`.** Everything is built; the
   endpoint answers with one specific sentence until the key exists. The owner
   has deferred buying one. Roughly ₹3–5 a question.
2. **The Checklist starts empty and the owner fills it**, in this order: Doers,
   then Holidays, then Tasks. Every one of those screens takes a paste from
   Excel or a CSV. Only the owner's own account has been granted the module;
   everybody else is a tick in Settings → Access.
3. **`naushi500@gmail.com`** is a second Order Entry ADMIN for a person who
   also holds `naushi.linkdprints@gmail.com`; and two "test admin" Help Slip
   profiles (`harshali08033@`, `harshalibhopale08033@`) own no concerns and
   cannot sign in. All three are the owner's call.
4. **Masters shows empty lists to an ERP admin who has no Order Entry
   account.** `/api/order-entry/lookups` answers 401 — correctly, it is an
   Order Entry resource — but the page renders its tabs and then silently has
   nothing in them. It should say so. Does not affect the owner, whose account
   is an Order Entry admin.

**The standalone Goods Return app stays live**, passwordless, on the owner's
explicit instruction (Sep 2026): *"keep old as it is"*. Do not propose
retiring it again unless they raise it.

── DEPARTMENTS ARE ONE LIST NOW (Sep 2026) ───────────────────────────────

`ld_help_slip.departments` had two rows whose `code` and `name` disagreed —
`IT_SYSTEMS`/"Analytics" and `PURCHASE`/"Sales" — and the code is printed on
the Departments settings screen. They were RENAMED IN PLACE (`ANALYTICS`,
`SALES`) rather than replaced, so every profile and concern kept pointing at
the row it always did; nothing was moved and nothing was deleted. The five
missing departments were added.

"Analytics" was added to `CRM_DEPT` in Masters, because it is a real
department here and dropping it would have orphaned three profiles and a
concern with nowhere obvious to send them. Both lists are now identical:
**Accounts, Analytics, Design, Dispatch, Operations, Sales, Transport.** If
one gains a department, give the other the same one.

## Stack
Next.js 15 (App Router, TS strict) · Drizzle ORM + `postgres.js` · Auth.js v5
· Tailwind v4 + shadcn/ui on Base UI (`@base-ui/react`) · Supabase Postgres
(no `@supabase/supabase-js` — plain Postgres connection, same as Order Entry).

## Database — one Supabase project, five schemas
Project **"LD Silk Mills"** (`ygxnbmfmrwookrilpbfx`), region `ap-south-1`.
No Neon involved anywhere (an earlier Neon project existed for one day in
Phase 1 and was deleted — do not recreate it).

| Schema | Owner | Notes |
|---|---|---|
| `ld_erp_core` | **This repo, exclusively** | `users`, `systems`, `system_access`, `audit_logs`. Nothing else reads/writes it. |
| `ld_order_entry` | **Shared** with the standalone Order Entry app | Same live tables, same rows — no sync, no copy. A row written by either app is instantly visible in the other. |
| `ld_help_slip` | **Shared** with the Help Slip app | RLS is the boundary — see its own section below. |
| `goods_return` | **Shared** with the standalone Goods Return app | Live. Add and update only; never restructure, never delete. `return_display_seq` must never be created, dropped, altered or reset. |
| `ld_checklist_system` | **This repo, exclusively** | `doers`, `tasks`, `occurrences`, `holidays`. Nothing else reads or writes it, so — unlike the three shared schemas — it IS managed with ordinary migrations from here. |

`src/db/index.ts` opens the one shared `postgres.js` connection (`sql`),
reused by `src/db/order-entry/index.ts` for the second schema — one pool,
two Drizzle instances. `drizzle.config.ts` has `schemaFilter: ["ld_erp_core"]`
— **this repo must never generate or apply a migration against
`ld_order_entry`**; that schema's migrations are owned by the Order Entry
repo. `src/db/order-entry/schema.ts` is query-only, hand-mirrored from
`github.com/mastersystem-linkd/LD-Order-Entry`'s `db/schema.ts`.

`DATABASE_URL` in `.env.local` must be the Supavisor **Transaction pooler**
(port 6543), never the session pooler (5432) or direct connection.

`drizzle.config.ts` lists BOTH owned schemas in `schemaFilter`
(`ld_erp_core`, `ld_checklist_system`) and both schema files in `schema`.
Adding a file to `schema` is what lets `db:generate` see its tables at all;
`schemaFilter` only decides which namespaces drizzle-kit may touch. The three
shared schemas are deliberately absent from both.

**`next build` clobbers a running `next dev`.** They share `.next`, so a
production build run while the dev server is up leaves that server serving
blank pages. Restart it (and delete `.next`) after any build.

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

## Settings live in ONE place (Sep 2026 consolidation)
The app had FOUR settings areas and three separate user screens. Measured
before the change: 14 staff records for one team, and exactly one person
present in all three lists. The shape now:

| Where | Holds |
|---|---|
| **Settings** (`/settings`) | Your profile (name, **phone**, password) · **People** (all three systems) · Access · **Access requests** · Systems · Audit |
| **Masters** (`/masters`) | All nine shared lists — party, fabric, agent, transport, haste, sales person, departments, complaint categories, delay reasons |
| **Order Entry rules** | Design Database · Time tracking · Role permissions · Trash |
| **CRM rules** (`/crm/settings`) | Two tabs: CRM follow-ups · Rating criteria — it had NO menu before, only a tab inside Order Entry |
| **Help Slip rules** | General, and nothing else — one screen, no tab strip |
| **Masters** also carries | Goods Return's four own tables (parties, brokers, qualities, transports) as a separate section — different tables, different API, see `(app)/masters/goods-return-lists.tsx` |

Rules that keep it that way:
- **One People screen.** `src/lib/people.ts` unions the three user tables on
  the lower-cased email. Do not add a per-module user screen back; the old
  addresses redirect here on purpose.
- **Removing somebody is TWO actions, and the distinction is the point.**
  *Switch off all access* (`removeAllAccess`) deactivates in all three systems
  and is the everyday one — the record stays, and everything they ever did
  keeps their name on it. *Delete permanently* (`deletePersonAction`) removes
  the row outright and is REFUSED unless `personFootprint()` comes back empty;
  it exists for duplicates and leftover test accounts, which the old
  never-delete rule left stranded in the list looking like staff. The footprint
  is re-checked server-side — the screen hiding the button proves nothing.
  `customer_orders.created_by` is counted there and is NOT a foreign key: it
  holds the EMAIL as text, so Postgres would delete the user and silently leave
  every order they raised pointing at nobody.
- **Base UI `<Select.Value>` renders the RAW VALUE unless `items` is passed to
  `<Select>`.** This is not cosmetic. The People dialog's three role dropdowns
  read `member`, `SALES` and `none` instead of "Member", "Sales" and "No
  access" — so the one option that removes access was labelled `none` and did
  not read as a choice, which is why removing a person looked impossible. Pass
  `items={{ value: label }}` on every Select, and note a switched-off account
  still carries its old role: read STATUS first, or the screen prints "Member"
  for somebody who was just removed and the change looks like it never saved.
- **"Access" in Order Entry is now "Role permissions"** — it is a role x
  capability grid, not a list of people. The old name is why it read as a
  duplicate user screen.
- **Every moved address redirects**, it is not deleted. A 404 on a settings
  screen reads as "the feature was removed".
- **All four settings areas use the same pill strip** (`bg-surface-2`, lifted
  active tab, 16px icons, real routes rather than `useState`). CRM rules was
  the odd one out — one long scrolling page with no strip, so Rating criteria
  sat below the fold — and it now has its own two tabs.
- Module menus are called **rules**, not Settings, so only one thing in the
  sidebar is called Settings. A "rule" is how the MODULE behaves. A person's
  own details and a queue of joiners are not rules and do not belong in one —
  that is why Help Slip's "Your details" and "Access requests" tabs moved out.
- **The phone number lives in `ld_erp_core.users.phone`** (added Sep 2026;
  backfilled from `ld_help_slip.profiles.phone`). Editing it in
  `/settings` MIRRORS it into `ld_help_slip.profiles` so Help Slip's WhatsApp
  updates keep arriving — through `withHelpSlip` under the person's OWN
  profile id, so it is a normal self-edit under `profiles_update_self`, not a
  third RLS bypass. Do not add a second phone field anywhere.
- **A redirect must land on a real page, not another redirect.** Chains are
  how "Order Entry rules" ended up on Masters. `/help-slip/settings` renders
  General itself rather than bouncing to `/help-slip/settings/general` —
  the sidebar points at it, and the entry point must not be a hop.

## Sidebar
**One navigation tree, drawer on mobile.** The sidebar was `hidden md:flex`
with NOTHING replacing it below 768px — a phone reached the dashboard and then
had no way to open Orders, CRM, Help Slip or Settings at all. It is now
rendered ONCE and passed as `children` into `<MobileNavPanel>`
(`src/components/shell/mobile-nav.tsx`), which positions it: off-canvas and
fixed below `md`, an ordinary flex child above. Do not add a second mobile
menu — two trees drift, and a system added to one goes missing from the other.
Passing it as children is also what keeps `<Sidebar>` a server component
(children arrive pre-rendered, so nothing uncrossable goes over the boundary).
The drawer closes on route change, on Escape, on the scrim, and locks body
scroll while open; `md:translate-x-0` is forced so drawer state can never leak
into the desktop layout when the window is widened.

Dynamic, driven entirely by `ld_erp_core.systems` + `system_access` — never
hardcoded. A system with `status != active` renders greyed/unclickable
regardless of any other setting.

**Switching a system ON makes it DISAPPEAR until somebody is granted it**, and
that trap is worth knowing before you hit it. `coming_soon` is shown to
EVERYONE as a greyed preview; `active` is shown only to people with an explicit
`system_access.can_view = true` row. So an admin who marks a system live and
grants nobody watches it vanish from their own sidebar and concludes the switch
failed (this happened with `crr`). The rule is right — a live system is a real
destination and should be granted deliberately — so the fix was to make the gap
visible: `/settings/systems` now prints the viewer count beside Active and an
amber "Nobody can see it — grant access" when it is zero.

**`open_mode` must match where the system actually lives.** `internal` means a
page inside THIS app and needs a `route`; `external` opens `application_url` in
a new tab. With `internal` and no route the sidebar guesses `/<system_code>`,
which 404s for anything hosted elsewhere — `crr` was configured that way and
would have been a dead link even once it was visible. The registry now flags
both empty cases. `src/lib/system-submenus.ts` is a small
hand-maintained map (not DB-driven) of which systems have a built sidebar
submenu; currently only `order-entry` does (Dashboard / New order / Orders
/ Order status / Operations / Settings, collapsible, auto-expands when
you're inside that section). Toggling a system's `status`/`route`/
`open_mode` in `/admin/system-registry` takes effect live, no redeploy.

## What's actually built vs. placeholder
- **Shell**: login, dynamic sidebar (drawer on mobile), topbar, dashboard,
  Masters (`/masters`), and the six Settings tabs — Your profile · Users ·
  Access · Access requests · Systems · Audit log. All real and functional.
  The four `/admin/*` addresses these grew out of NO LONGER EXIST; see the
  Settings section above.
- **Orders** (`/order-entry/*`, sidebar label "Orders" — system_code stays
  `order-entry`): Dashboard, Orders list/detail/create/edit, Order Status
  board — real, reads/writes live `ld_order_entry` data. Ported from Order
  Entry's own repo; see `src/lib/order-entry/*` and
  `src/app/api/order-entry/*`.
- **Checklist** (`/checklist/*`, system_code `checklist`): all six screens
  real — Dashboard, Master Checklist, Scorecards, Tasks, Doers, Holidays —
  over our own empty `ld_checklist_system` schema. See its section below.
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
  was rebuilt as a small hand-rolled inline SVG, `RatingTrendLine`).
  **CRM rules** (`/crm/settings`) IS built, as two tabs on the same strip
  every other settings area uses: CRM follow-ups (`crm_settings` — transit
  days, call-within, attempts, escalation, the auto-create switch) and Rating
  criteria (`crm_rating_criteria` CRUD, at `/crm/settings/rating-criteria`).
  Two tabs rather than one page because they are two tables doing two jobs,
  and stacked they put Rating criteria below the fold. The ADMIN gate lives in
  `(app)/crm/settings/layout.tsx` so it covers both.
- **Operations tracking** (`/order-entry/tracking`): the index plus the
  per-order 7-stage board (`/tracking/[id]`), backed by
  `POST /api/order-entry/tracking/stage` and
  `GET /api/order-entry/orders/[id]/tracking`. Stage gating (order entry →
  stock checking → the five post-stock stages, which unlock only on
  `in_stock`) is enforced server-side by `applyStageProgress` in
  `src/lib/order-entry/workflow.ts` and mirrored in the board's UI. Untick
  and stock-downgrade never cascade-undo later work — both warn and leave
  it done.
- **Order Entry rules** (`/order-entry/settings/*`): Design Database · Time
  tracking · Role permissions · Trash — four tabs, down from seven, ADMIN-only,
  backed by routes under `src/app/api/order-entry/` (lookups `[id]`/`bulk`,
  `design-database/*`, `stages/*`, `users/*`, `access`, `trash`,
  `orders/[id]/lines/[lineId]`). Dropdown Master moved to `/masters`, Users to
  `/settings/users` and the CRM tab to `/crm/settings`; all three addresses
  still resolve as redirects. "Access" is now labelled **Role permissions** —
  it is a role x capability grid, not a list of people, and the old name is
  exactly why it read as a duplicate user screen. Note `design-database/`
  (admin CRUD) is a different endpoint from `designs/` (order-form
  autocomplete) — don't conflate them. User passwords use `bcryptjs` at cost
  10, matching the Order Entry app they're shared with.
- **Help Slip rules** (`/help-slip/settings`): the General panel and nothing
  else, so there is no tab strip. Your details moved to `/settings` and Access
  requests to `/settings/access-requests`; Users and Departments had already
  gone to `/settings/users` and `/masters`. All four redirect.
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
- **Goods Return LR** (`/goods-return/*`, system_code `goods-return-lr`):
  returns going back to parties and what arrives at Bhiwandi — Dashboard, All
  returns, detail, Receiving, New/Edit, Reports. Ported from
  `github.com/mendoza0123/goods-return-system`, which is the SAME stack (Next
  App Router + Drizzle + Auth.js), so the logic files moved across nearly
  unchanged. Reads/writes the live `goods_return` schema. **Read
  `src/db/goods-return/schema.ts` before touching anything here** — it records
  the row counts, the backup location, and why `return_display_seq` is the most
  dangerous object in the module.
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
  conspicuous. There is now exactly ONE other exception, `src/lib/people.ts`,
  and it is deliberate: an ERP admin managing staff acts ON the system, not
  inside it, and may have no Help Slip profile at all — so there is no
  `auth.uid()` to run as and `withHelpSlip` has nothing to stand on. Every
  function in that file is called only from a server action that has already
  run `requireErpAdmin()`. Do not add a third, and do not make anything in
  `people.ts` reachable from a normal request path.
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

## Goods Return — the office is a MODE, and system_access is the door

Two questions, and only the first is a permission:

1. **May this person open the module?** `canOpenGoodsReturn()` reads
   `ld_erp_core.system_access` — the tick box in Settings → Access — on the
   SERVER. It had to be built: that table only ever fed the SIDEBAR
   (`getVisibleSystemsForUser`, called in one place, the app layout). Every
   other module gets away with that by re-checking against its own account
   table; this one has none, so hiding the menu entry would have been the only
   thing between any signed-in employee and marking stock received.
2. **Which office are they working as?** A cookie (`ld-gr-office`), chosen on
   entry and switchable at will. **NOT a security boundary** — the owner's
   explicit decision, mirroring the standalone app whose two cards sit on a
   passwordless page. `canCreateReturns()` and friends shape which screens and
   buttons somebody is shown; they decide nothing about trust. Never write a
   check that assumes a Bhiwandi session could not have been Head Office a
   moment ago.

Other things this module paid for:

- **`return_display_seq` is never modelled in Drizzle**, only called as a raw
  `nextval()`. Modelling it would put `CREATE SEQUENCE … START WITH 1` into any
  diff, and a mis-aimed push then hands the next return an id that already
  exists. Verified across two tests: 356 -> 357 -> 358, never rewinding.
- **An edit must not touch the LD number, the status or any Bhiwandi column.**
  Otherwise the double-receipt guard is walkable — you just use Edit instead.
  Proven against a received return carrying 777/888.
- **Receiving guards on `status = 'posted'` in the WHERE**, so a second receipt
  updates zero rows rather than replacing the charges the first person entered.
- **`received_by`/`created_by` stay NULL.** They are integer FKs into
  `goods_return.users` (three rows, two shared passwordless office logins) in a
  schema this repo may not migrate. Attribution goes to
  `ld_erp_core.audit_logs` instead.
- **Its four master lists are its own TABLES**, not `lookup_values` rows — 341
  returns point at them by integer id, so they were never merged. Every name
  with no ERP equivalent was ADDED to `lookup_values` instead (1,014 rows, one
  way, once, 4 Sep 2026; ids in the backup folder). They appear as their own
  section on `/masters`. Adding is offered; renaming and deleting are not.
- **Attachments use a PRIVATE bucket** (`goods-return-attachments`) and are
  proxied through `/api/goods-return/attachments/[id]`, re-authorised on every
  view. The standalone app uses a PUBLIC bucket and stores `getPublicUrl()`;
  that was not carried over because these files are bills carrying party names
  and amounts, and zero files had ever been uploaded so there was nothing to
  migrate. `isStoragePath()` tells our paths from a legacy public URL, and both
  render.
- **A client component must import office helpers from
  `src/lib/goods-return/offices.ts`, never from `authz.ts`.** The latter is
  `server-only` and reads `next/headers`; importing it from the browser bundle
  fails the build AND takes unrelated pages down with it. `tsc` passes on that
  import — the constraint is the bundler's and only appears on request.

## AI Assistant — read-only, scoped, and needs a key

`/ai-assistant`. Claude answers questions about the business and walks people
through screens. Three files: `src/lib/ai/knowledge.ts` (what it knows without
asking the database), `src/lib/ai/tools.ts` (what it can look up), and
`src/app/api/ai-assistant/chat/route.ts` (the streaming endpoint).

- **Needs `ANTHROPIC_API_KEY`** in the environment. Without it the endpoint
  returns a SENTENCE saying so, not a 500 — it is the one failure an owner can
  fix themselves. Add it to `.env.local` and to Vercel.
- **Model `claude-opus-5`**, adaptive thinking, streaming. Roughly a rupee or
  two per question. `max_iterations` caps the tool loop; without it a confused
  model can search the same thing until the request times out, billing each lap.
- **EVERY TOOL IS READ-ONLY.** It never creates, edits or receives anything.
  That is the design, not a first-version shortcut: a model that can act can
  act on a misunderstanding, and every write in this ERP already has a screen
  with a guard and a person who chose to press it. If write actions are ever
  added they belong behind an explicit confirm showing the exact record.
- **Every tool checks `system_access` for the CALLER** before touching a
  module. The assistant must never become the one place where a permission
  leaks — the sidebar hides a system, the module guards refuse it, and so does
  this. Help Slip reads must additionally go through `withHelpSlip` under the
  caller's own profile so RLS keeps confidential concerns invisible; the model
  is never trusted to filter them.
- **`knowledge.ts` is written for the person at the screen, not for whoever
  edits the code.** Do not paste CLAUDE.md into it — this file is full of pool
  sizes and migration warnings, and a model given it answers in those terms. It
  is the assistant's only source for anything a tool does not return, so a
  stale line becomes a confident wrong instruction: update it in the same
  commit as any screen change.
- It is sent as a CACHED system prompt, so its length costs full price once and
  about a tenth of that per later turn. Keep it first and keep it stable —
  anything volatile appended to it invalidates the cache every request.
- **The tool SQL was verified against the live tables, and the first draft was
  wrong.** `customer_orders` has no `status` and no `deleted_at` (lines carry
  `is_cancelled`/`is_deleted`, progress lives in `line_stage_progress`), the
  column is `agent` not `agent_name`, and `crm_followups` uses `due_at` not
  `due_date`. Check a column exists before a tool ships; a broken tool fails at
  question time, in front of somebody.

## Checklist — dated duties, and the two things that must never be overwritten

`/checklist/*`, system_code `checklist`, schema **`ld_checklist_system`** —
ours alone and therefore migrated from this repo, unlike every other ported
module. Rebuilt from `github.com/harshalilinkd/Checklist_System`, which runs
live at the owner's other company. **No data came from there and none ever
should**; that database is not ours to read.

Six screens: Dashboard · Master Checklist · Scorecards · Tasks · Doers ·
Holidays, plus a CSV export at `/checklist/scorecards/export`.

**A doer is its own row, NOT an `ld_erp_core.users` id.** The first draft got
this wrong on the reasoning that this ERP keeps one People list. Most people
with a duty on a checklist have no cause to hold an ERP login, and forcing one
would mean creating dozens of passwords into a system holding order values.
`doers.user_id` links to an ERP account only when that person happens to have
one, and is resolved by EMAIL on sign-in — so somebody bulk-imported months
before they get a login finds their own work the first time they open it.

**Only `Scheduled` and `Done` are stored.** Today / Delayed / Upcoming Focus
are derived from the planned date at read time, in SQL, in
`master-query.ts`'s `statusCondition()`. Never store them: they would need a
nightly sweep to stay truthful, and a night it did not run is a morning the
whole checklist lies. Upcoming Focus deliberately EXCLUDES daily tasks —
a daily duty is due within a week every day of the year.

**Everything that writes occurrences goes through `lib/checklist/occurrences.ts`.**
Generation is an upsert on `{taskId}_{plannedDate}` that does nothing on
conflict, so re-running it can never overwrite a tick. Where rows genuinely
must go, `status <> 'Done'` is a condition IN THE STATEMENT, never a filter
applied after a read. Two things are sacred: **a completed row, and its
actual date.**

**Dates are dates.** `lib/checklist/dates.ts` does all calendar arithmetic in
UTC and never lets a `Date` escape a function — the original's `parseISO` gives
LOCAL midnight, which shifts every weekday calculation by one anywhere east of
UTC. `todayIso()` is Asia/Kolkata on purpose: between 18:30 and midnight UTC it
is already tomorrow in Bhiwandi. The financial year (1 Apr – 31 Mar) is
COMPUTED from today, not pinned in an env var like theirs, so it rolls over on
its own.

**The financial year rolls over on its own.** `ensureCurrentYearScheduled()`
runs from the Checklist layout inside `after()`, so it costs one cheap
`LIMIT 1` on the request path and does the generating once the response has
already been sent. A cron job was the obvious alternative and was rejected: it
needs a `CRON_SECRET`, a public endpoint and a plan that allows the schedule —
three things that can rot silently until the one day a year they matter. The
"Rebuild schedule" button stays as the manual way in.

**A holiday is a day off, not a day moved.** A duty landing on Diwali is
dropped for that cycle rather than shunted to the next day. Adding a holiday
clears only what is not Done and only from today onwards; removing one calls
`regenerateAll()`.

**Access.** `system_access` gates the module in the layout. `doers.is_admin`
is checklist admin; a shell admin is ALSO a checklist admin, which is the one
exception to the shell-admin-is-not-module-admin rule in this file — it is a
bootstrap problem, since the doers table starts empty and nobody could
otherwise create the first row. It does not work in reverse. Four of the six
screens redirect a non-admin. A member's scorecard id comes from their session
and is never read from the URL — **and the CSV route re-checks that from
scratch, because a route handler runs without the layout above it.**

**Figures print their denominator.** On-time % is of what was DONE; completion
is of what has COME ROUND (the original divides by everything ever scheduled,
which makes the number climb through a month for no reason). A figure that
cannot be computed shows a dash, never 0%.

**Bulk import**: `lib/checklist/import-parsers.ts` is shared by the browser
preview and the server action, so the two cannot disagree. Excel copies as
TAB-separated, not comma — the delimiter is detected. Dates are read
DAY-FIRST. The server always re-parses the raw text; the preview is a
courtesy, never a check.

## Known gotchas (hit these once already — don't re-discover them)
- **A Server Component's `new Date()` is the SERVER's clock, which on Vercel
  is UTC.** The topbar greeting and date were computed that way, so 5pm in
  Bhiwandi still said "Good morning" and between midnight and 05:30 the date
  was YESTERDAY's. Anything the owner reads as a time or a date must carry
  `timeZone: "Asia/Kolkata"` — see `components/shell/topbar.tsx` and
  `lib/checklist/dates.ts`.
- **A hydration warning in a Playwright run is usually the SCRIPT, not the
  app.** Filling a form before React has attached to the inputs reproduces
  "attributes of the server rendered HTML didn't match the client properties"
  3 times out of 3; waiting for `load` first gives 0 out of 3. Half a day went
  into chasing it as a product bug. Wait for hydration before typing.
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

## Run the functions in the same region as the database
`vercel.json` pins `regions: ["bom1"]` (Mumbai). The Supabase project is
`ap-south-1`, and with no pin Vercel defaults to `iad1` (Washington DC) — so
every query paid a trans-continental round trip, several times per request,
while the same query measured 3ms from a machine near the database. Nothing in
the code can compensate for that; it is a one-line config and it must match
wherever the database lives. If the Supabase region ever moves, move this too.

## Order status: read the header of `order-status-query.ts` before touching it
That endpoint was the app's only slow one (714ms; everything else was under
200ms) because it fetched EVERY line and EVERY stage row — 40,000 rows — to
render twenty groups, then filtered and paginated in JavaScript. It now runs
one aggregate that returns a row per order, pages over that, and fetches full
detail only for the page. 714ms -> 195ms.

Its `MAX_LINES = 5000` cap was also silently losing data: twelve orders never
appeared at all, and orders 407 and 593 were rendering a status rolled up from
a truncated line list. Do not reintroduce a wholesale fetch with a cap.

The SQL reproduces `computeStages` and the two were diffed over every order
before shipping. If you change either, re-run that diff — the `cross join`
onto `workflow_stages` is load-bearing (a stage with no progress row must
count as not-done, which a plain join would hide).

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
