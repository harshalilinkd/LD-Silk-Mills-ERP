@AGENTS.md

# LD Silk Mills ERP Shell

Central entry point (login, sidebar, dashboard, module registry) for LD Silk
Mills' internal tools. Each module keeps its own database/schema; this repo
is the "building," not the "rooms" — except Orders, which was later ported
in as native pages (see Phase 3a below), not just linked to.

## Where this stands (Sep 2026)

Seven modules are built and verified against live data: **Orders**, **CRM**,
**Help Slip**, **Goods Return LR**, **AI Assistant**, **Checklist** and
**Petty Cash**. Two more are EXTERNAL links rather than screens in this app —
**CRR** (`crr.linkdprints.com`) and **SCOT** (`ldscot.linkdprints.com`,
Sep 2026). Only **NBD** is still a `coming_soon` placeholder in
`ld_erp_core.systems`, and `/reports` is the shell's own reports screen.

**An external system needs no code.** `system-nav-item.tsx` already renders any
row whose `open_mode` is `external` as an `<a target="_blank">` with the
external-link arrow. Set `status='active'`, `open_mode='external'`,
`application_url`, and clear `route` — a route on an external system makes the
sidebar offer an address that does not exist. Then check `system_access`: a
system nobody has been granted is a system nobody sees, which is exactly the
"I marked it active and it still is not in the menu" the owner hit with CRR.

Three things are outstanding, and none of them is code:

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

**Petty Cash roles are unset.** Six people held `system_access` for it before
it went live, so all six can READ the ledger and only the ERP admin can record
anything. Setting each of them in Lists and access → Who may use it is the
owner's call, not a bug.

**The `attachments` storage bucket is PUBLIC, and must stay that way.** It is
EMPTY — zero objects, nothing in this repo references it — but it is the bucket
the still-live standalone Goods Return app writes to
(`lib/storage.ts`: `ATTACHMENTS_BUCKET = "attachments"`, read back with
`getPublicUrl()`). Making it private would break that app's uploads the first
time somebody used them. Nothing is exposed today because nothing is in it; it
can be deleted the day that site is retired, and not before. Our own three
buckets (`concern-attachments`, `goods-return-attachments`,
`petty-cash-attachments`) are private and proxied.

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
| `ld_petty_cash` | **This repo, exclusively** | `members`, `employees`, `categories`, `transactions`. Built from scratch Sep 2026; migrated from here, same as the Checklist. Nothing was imported from the Google Apps Script app it replaces. |

`src/db/index.ts` opens the one shared `postgres.js` connection (`sql`),
reused by `src/db/order-entry/index.ts` for the second schema — one pool,
two Drizzle instances. `drizzle.config.ts` has `schemaFilter: ["ld_erp_core"]`
— **this repo must never generate or apply a migration against
`ld_order_entry`**; that schema's migrations are owned by the Order Entry
repo. `src/db/order-entry/schema.ts` is query-only, hand-mirrored from
`github.com/mastersystem-linkd/LD-Order-Entry`'s `db/schema.ts`.

`DATABASE_URL` in `.env.local` must be the Supavisor **Transaction pooler**
(port 6543), never the session pooler (5432) or direct connection.

`drizzle.config.ts` lists ALL THREE owned schemas in `schemaFilter`
(`ld_erp_core`, `ld_checklist_system`, `ld_petty_cash`) and all three schema
files in `schema`. Adding a file to `schema` is what lets `db:generate` see its
tables at all; `schemaFilter` only decides which namespaces drizzle-kit may
touch. The three shared schemas are deliberately absent from both.

**`next build` clobbers a running `next dev`.** They share `.next`. A
production build — or a `rm -rf .next` — while the dev server is up leaves it
serving pages with **no stylesheet at all**: raw HTML, blue underlined links,
default fonts. The tell is `/_next/static/css/app/layout.css` answering 404
and `/icon.svg` answering 500 while `/login` still answers 200.

**The order matters, and getting it wrong is what caused it twice:**

```
1. stop the dev server            (it must be DOWN before .next is touched)
2. confirm nothing is on 3001
3. rm -rf .next
4. npm run dev
5. verify: /login 200 AND its .css 200 AND /icon.svg 200
```

Deleting `.next` while the server is running, or starting the server in the
same command that deletes it, both race and leave the same wreckage. Check the
CSS, not just the page — a 200 on `/login` proves nothing.

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
- **Petty Cash** (`/petty-cash/*`, system_code `petty-cash`): all four screens
  real — Ledger, Monthly summary, Dashboard, Lists and access — over our own
  `ld_petty_cash` schema, built from scratch rather than ported. See its
  section below.
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
- **The order form's Order details pairs up on a phone.** Ten stacked fields
  was most of a screen of scrolling before the first fabric block, so the SHORT
  ones share a row — date + order no, sales person + agent, challan + lot —
  while the ones carrying a NAME (party, haste, transport) keep the full width,
  because a company name truncated to 160px is the field you cannot check
  before saving. `sm` and `lg` are untouched: the two- and three-column desktop
  flow SCREENS.md specifies is exactly as it was.
  **The date pair forms at 360px, not at zero.** A native `type="date"` input
  carries a fixed-width calendar button, so in a 125px cell it renders
  `09-09-202` — the YEAR clipped off the one field where a wrong year is a
  wrong order. Below 360px those two stack (`col-span-2 min-[360px]:col-span-1`);
  390px, which is what people actually hold, still gets the pair.
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
**THE COORDINATOR DASHBOARD SAID ONE THING FIVE TIMES** (Sep 2026, owner:
*"more in depth but easy to understand charts, no repetitive data"*). With one
visible concern it drew a "Resolved 1" tile, a "1 resolved" chip, a 100% SLA
figure, a one-spike chart AND a department bar of length one — five panels,
one fact. What it never showed was anything a coordinator could not already
see on the strip.

- **Three figures, three questions.** Time to FIRST REPLY is the measure this
  module is about — somebody raising a concern wants to know it was READ, and
  how long the fix then took is a different promise; averaging them into
  "responsiveness" hides whichever is worse. Time to resolve and within-SLA sit
  beside it, and the resolved count stays as the denominator those two need.
- **"The fix the person proposed was used in N of M."** CLAUDE.md calls the
  proposed solutions the point of the slip and nothing measured whether they
  get used. It is a footnote, not a panel, because it is one number.
- **ONE DEPARTMENT IS NOT A BREAKDOWN.** A full-width bar labelled "Analytics
  1 total" is a sentence drawn as a chart. Below two departments it prints the
  sentence; the chart earns its place from the second onwards — the same rule
  the workbook dashboards follow.
- **The open-ageing panel draws only when it has something to say**: two or
  more non-empty buckets get the chart, exactly one gets a sentence, none draws
  nothing. Four bars with three at zero reads as three facts and is one.
- **Depth here is capped by DATA, not by design.** The module holds three
  concerns — one resolved, two withdrawn — so the panels above are built to
  fill themselves out as concerns arrive rather than to look full today. Adding
  workload, priority-mix and source charts now would have produced five more
  one-bar panels, which is what the owner asked to remove.

**A WITHDRAWN CONCERN IS ALREADY INVISIBLE, AND THAT IS RLS DOING IT.** Worth
recording because it looks exactly like a counting bug: `v_concerns` reports a
withdrawn concern as `status = 'new'` with `is_overdue = true`, and NOTHING in
`queries.ts` filters `withdrawn_at`. It is not a bug — the select policy starts
`withdrawn_at IS NULL`, so those rows never reach any query. **A probe that
sees them has bypassed RLS**: a bare `sql` connects as `postgres`, which has
`rolbypassrls`. Verified under `withHelpSlip` for both a coordinator and the
employee who raised them — each sees one concern and a strip reading
`new 0, overdue 0`. Do not add a `withdrawn_at is null` filter to these
queries; it is dead code duplicating the policy, and writing it implies the
policy cannot be trusted.

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

## Petty Cash — the cash box, and why nothing here is ever destroyed

`/petty-cash/*`, system_code `petty-cash`, schema **`ld_petty_cash`** — ours
alone and therefore migrated from this repo, like the Checklist and unlike the
three shared schemas. Built from scratch Sep 2026 against the company's Google
Apps Script app as the FUNCTIONAL reference only. **No spreadsheet is read, no
Apps Script runs, and not one row was imported.** The old app is untouched and
still live; importing its 1,589 rows is a separate job nobody has asked for.

Four screens: **Ledger** (`/petty-cash`) · **Monthly summary** (`/summary`) ·
**Dashboard** (`/analysis` — the route kept its original folder name; only the
label and the screen changed) · **Lists and access** (`/masters`).

**Two questions, and BOTH are security boundaries.** This is where the module
differs from Goods Return, whose office is only a mode.

1. *May they open it?* — `ld_erp_core.system_access`, the tick in Settings →
   Access, read on the server in the layout.
2. *What may they do?* — `ld_petty_cash.members.role`: `VIEWER` reads,
   `OPERATOR` records and corrects, `ADMIN` also deletes and runs
   `/masters`. Seeing what the box holds and taking money out of it are not
   the same permission.

**An ERP admin is a Petty Cash admin only as a bootstrap.** `members` starts
empty, so without it nobody could grant the first role. It is one-directional
and it is VISIBLE — `viaShellAdmin` is true when somebody holds their powers
only that way, and `/masters` prints "ERP administrator" beside them rather
than letting them believe it was deliberate. An explicit member row always
wins, so an ERP admin can be deliberately limited to VIEWER here.

**Every figure in the module comes from `lib/petty-cash/queries.ts`.** `LIVE`
(not deleted) is written once, `CREDIT_SUM`/`DEBIT_SUM` once, and balance is
always `credits − debits` computed in SQL. The fastest way to lose a company's
trust is for two screens to disagree by ₹200 because one forgot to exclude
deleted rows. Every total is a `SUM` Postgres performs; the ledger is paged.
Queries are awaited IN TURN — the pool is five wide and pipelined statements
stall under the transaction pooler.

**Nothing is ever destroyed.**
- A transaction is SOFT deleted (`deleted_at`/`deleted_by`, plus the reason
  typed into the confirmation) and its receipt is kept with it. The dialog says
  so in as many words, because a soft delete that pretends to be a hard one is
  a promise the screen cannot keep. ADMIN only.
- A payee or a category is switched OFF, never removed. Off means "stop
  offering this on the form"; every entry already filed under it is untouched
  and every total still includes it. The usage counts on `/masters` are what
  make that a decision rather than a guess — a name used 340 times is the
  canteen, a name used once is a typo.

**`to_name` and `category_name` are SNAPSHOTS and must stay that way.** They
are written at the moment of entry and no rename ever rewrites them. A voucher
printed in April said "Ramesh (canteen)"; correcting the spelling in September
must not make the April voucher claim otherwise. The monthly summary therefore
groups by the LIVE category for the group breakdown (so a re-grouped category
reports where it now belongs) and by the SNAPSHOT for the category rows (so an
old entry still prints what it said). Both are exhaustive partitions of the
same rows, so they add up — the old app's keyword matching could put one
category in two groups and did not.

**The reference number is built inside the INSERT** from
`ld_petty_cash.transaction_uid_seq` with the year taken from
`now() at time zone 'Asia/Kolkata'`. Two people saving in the same second
cannot receive the same `PC-2026-000001`. Do not compute it in JavaScript and
do not "fix" a gap — a gap means a transaction was rolled back, which is
exactly what it should mean.

**The ledger has one column per field on the entry form** — Date, Reference,
Type, From, To, What for, Category, Proof, Receipt, Amount — on the owner's
instruction. Two of those were merged before and both merges lost something:
From and To shared a "Parties" cell, and Proof shared a cell with the
attachment, so a row with a photo behind it printed "No proof" beside a
paperclip. `proof_type` is what KIND of slip was kept; the receipt is a
separate fact. The table scrolls sideways inside its own card.

**The ledger shows TWO balances and they answer different questions.** "Current
balance" is the whole box and never moves when a filter changes; a second strip
appears only when a filter is on, saying what that selection adds up to.
Showing one filtered figure under the words "Current Balance" is how somebody
concludes the cash has gone missing.

**Dates are dates.** `transaction_date` is a `date` — the day somebody wrote
down, not `created_at`. The Analysis calendar groups on it, which is why an
entry typed at 1am appears on the day it happened. Everything shared with the
Checklist lives in `src/lib/dates.ts` (UTC arithmetic, `todayIso()` in
Asia/Kolkata).

**Receipts go BROWSER → STORAGE, never through a function.** The first version
sent the file inside the Server Action's FormData and the first real receipt
died on `Body exceeded 1 MB limit`. Raising Next's cap is the obvious fix and
the wrong one: **Vercel refuses any request body over 4.5 MB** before our code
runs, so the 10 MB this module offers could never have worked that way. The
server now issues a one-use SIGNED UPLOAD URL, the browser PUTs the bytes
straight to Supabase Storage, and the form submits only the path — carrying an
HMAC over it, which `verifySignedPath` re-checks so a client cannot point its
entry at a path we never issued. `next.config.ts` caps Server Action bodies at
4 MB to match the platform, and **Goods Return and Help Slip were lowered from
10 MB and 8 MB to 4 MB** because they still upload through the server; the
signed-URL pattern in `lib/petty-cash/attachments.ts` is where they go if that
ever bites.

**Receipts use a PRIVATE bucket** (`petty-cash-attachments`) and are proxied
through `/api/petty-cash/entries/[id]/attachment`, re-authorised on every view.
Never signed URLs: a signed URL is a bearer token in a query string that keeps
working for anyone holding it, and these are bills carrying names and amounts.
Both that route and `/api/petty-cash/entries/[id]` re-check
`resolvePettyCashViewer()` from scratch — **a route handler runs without the
layout above it**, the same rule the Checklist's CSV export follows. Storage
calls use `SUPABASE_SERVICE_ROLE_KEY` and are confined to
`lib/petty-cash/attachments.ts`.

**Every write goes through `lib/petty-cash/mutations.ts`, inside one
transaction with its audit row.** A payment recorded with no audit trail —
because the second insert failed — is worse than no payment recorded at all:
the money has moved and nothing says who moved it. That is also why those
functions are not in the `"use server"` file: a server action cannot easily
share one transaction across helpers. The actions in
`(app)/petty-cash/actions.ts` are thin: **authorise → validate → write →
audit → revalidate**, with the guard FIRST and before any argument is read.
Audit rows go to `ld_erp_core.audit_logs` under `system_code = 'petty-cash'`
with hyphenated action names (`petty-cash.created`, `.updated`, `.deleted`,
`.payee_renamed`, `.category_switched_off`, `.role_set`, …).

**The Dashboard (`/analysis`) is more than the calendar it started as.** It
was one calendar and nothing else; it now leads with a CA-style figure strip
(net for the period, top category and its share, average payment size, spend
vs last month), a six-month cash-flow chart, a category donut, a spend-by-
group bar chart and a top-payees panel — THEN the calendar, demoted to a "Day
by day" section rather than removed, because it is still the only shape that
answers "which day did that go out on" and there was no reason to trade a
working feature for a new one. **Two clocks, deliberately**: the cash-flow
chart is always the real last six months ending today (`getMonthlyTrend`,
`src/lib/petty-cash/queries.ts` — ONE `GROUP BY to_char(transaction_date,
'YYYY-MM-01')`, months with no activity filled in as zero so the X axis stays
continuous), while the figure strip, the two breakdown charts and the calendar
all describe whichever month the RAIL is set to. Navigating to March does
not also rewrite the trend chart into being about March.

The two charts (`src/app/(app)/petty-cash/charts.tsx`) are Recharts, the same
approach as `components/order-entry/dashboard/charts.tsx`: every colour handed
to a chart is a `var(--token)` string, so the SVG repaints on a theme flip with
no JS colour plumbing and no re-render. A negative axis tick carries U+2212
(minus sign), not a hyphen — the same rule as every other figure in the
module.

**A NEGATIVE `margin.left` ON A RECHARTS PLOT CLIPS ITS OWN AXIS LABELS.** The
cash-flow chart carried `margin={{ left: -14 }}` to pull the plot in tight
against a 44px `YAxis`, and the top tick of a ₹10,000 month printed
**"0.0k"** — the leading digit cut off — above a baseline also reading "0".
An axis that disagrees with itself is worse than a wider gutter, and nothing
warns: the label is simply painted outside the clip. The margin is 0 and the
axis is 52px, which is the width of the widest string `compact()` can produce
(`−10.0Cr`), because the axis must not resize with the data.

**RED IS FOR EXCEPTIONS ON THE SCREENS TOO, not only in the workbook.** The Top
payees bars were `bg-status-red/70` — so the biggest payee, usually the
canteen, was drawn in the colour this ERP uses for "late, critical, act on
this", while the donut two cards above drew the same money in teal. One figure
looked like two. They are `bg-primary/70` now. The rule is the one the reports
follow: green completed, teal normal, amber pending, red critical, and a
ranking is not a warning.

**The calendar itself is a grid above `sm` and a LIST below it**: a
seven-column grid with rupee figures in it is a desktop layout; at 390px each
cell is 45px and "+ ₹10,000" wraps onto three lines. The list shows only the
days that had activity and opens the same filtered ledger when tapped.

**IT IS BUILT TO THE OLD SYSTEM'S SHAPE, IN THIS SYSTEM'S COLOURS** (Sep 2026,
on the owner's instruction after showing the Apps Script screen it replaces).
Year and twelve months down the left, the month and what you are looking at
across the top, that period's total on the right of the same line, and the grid
under it running **Sunday to Saturday**. What did NOT come across is the
palette: credit is the green this ERP uses for money in everywhere, debit the
red it uses for money out, and today keeps the primary ring rather than a
filled disc.

- **The rail replaced three controls with one list.** A month dropdown, a year
  dropdown and a pair of step arrows became a rail you can see all of, so
  August is one click from September instead of a select you have to open. The
  year sits above it with its own arrows. **All twelve months are always
  listed**, including empty ones and ones still to come — an empty February is
  an answer, and a rail that changes length as entries arrive is one nobody can
  build a habit on.
- **On a phone the same rail lies on its side** as a scrolling strip of short
  names, because a twelve-row column would push the calendar off the screen.
  The chosen month is scrolled INTO VIEW on mount — the strip starts at January
  and September was off the right edge, which is the one thing the rail exists
  to tell you. It scrolls the container directly rather than calling
  `scrollIntoView`, which on the desktop rail would scroll the whole page to
  reach a month already visible.
- **The buttons are Credit / Debit / Net**, not "Money in / Money out / Both".
  The entry form still says Money in and Money out, because somebody recording
  a payment is not thinking in ledger terms; an analysis screen whose figures
  are already headed CREDIT and DEBIT should not call the same thing something
  else two inches below. The heading follows the button — "September — Credit
  Analysis" — so one word means one thing on the screen.
- **`getActiveYears` is gone from this page.** It existed only to fill the year
  dropdown, and the rail steps a year at a time from wherever you are. Five
  queries now, not six, on the heaviest page in the module.
- **ONE CONTINUOUS GRID, NOT THIRTY FLOATING TILES.** The days were separate
  rounded cards with a gap between them and a visible border only on the days
  that had money, so an empty week read as blank paper and the eye had nothing
  to follow across a row. A calendar is a TABLE: every date gets the same
  bordered cell whether anything happened in it or not, and the days either
  side of the month keep their cell, shaded, because a hole in a grid is a
  broken table.
  **The lines are a 1px `gap-px` over a `bg-border` panel, never a border on
  each cell.** Per-cell borders double up where two cells meet — 2px inside,
  1px at the edges — and fixing that needs `nth-child` rules that break the
  moment a month starts on a different weekday. A gap cannot double. Today is
  an INSET ring (`shadow-[inset_0_0_0_2px_var(--primary)]`) rather than a
  `ring`, which would glow over the two cells beside it. Day numbers sit top
  RIGHT, the way a wall calendar numbers them, which also leaves the left edge
  clear for the figures.

**`/masters` is ADMIN only and refuses rather than hides** — a non-admin is
sent back to the ledger, the same shape as CRM rules and four of the six
Checklist screens.

**The Categories tab is ONE list, not one card per group.** It used to render
a separate `TableCard` — full column header included — for every group, which
at eight groups was eight near-identical headers for what was often a single
row each. It is now one table with the group as a slim divider row inside it;
grouping still shows (it is what the monthly summary rolls up to) without
paying for it in scroll length.

**The Payees / Categories / Who-may-use-it switcher on `/masters` is `Tabs`,
not `Segmented`.** `Segmented` (`components/ui/segmented.tsx`) is a radiogroup
for a single either/or QUESTION ("did it reach on time?") and reads as an
unlabelled row of buttons when used to switch between whole sections of a
screen instead. `Tabs` (`components/ui/module-parts.tsx`) is the fix: the same
pill-strip look `SettingsTabs` and `HelpSlipSettingsTabs` already use for real
routes (`bg-surface-2` strip, active tab lifted on `bg-surface` with a
shadow), just driven by a controlled `value`/`onChange` instead of
`Link`/`usePathname` since these are sections of one screen, not separate
pages. Reach for `Tabs` the next time a screen needs a section switcher — not
`Segmented`.

**It starts empty and the owner fills it.** Eight categories were seeded
(Petty Cash, Deposit, Cash Salary, Salary, Advance Salary, Transport, Hamal,
Other); there are no payees, no transactions and no member roles. Six people
already hold `system_access` for it, so all six can READ the ledger the moment
it goes live and only the ERP admin can record anything — worth a look before
the first real entry.

## The home page is an operational brain, not a description of the shell

`/` (`src/app/(app)/page.tsx` + `src/lib/dashboard-brain.ts`). It used to be
four tiles about the SHELL — systems configured, user rows, "modules queued" —
over a panel reading *"no activity yet, once Phase 2 wires up
authentication"*, printed over an audit table that had had rows in it for
weeks. Nothing on it was a thing anybody could act on, on the one screen
everybody opens first.

It now reads in the order somebody asks: **what needs me** (six figures, then
the exceptions with a link straight to the screen that clears them) → **what
has been happening** (real audit rows) → **is everything up** (the old system
registry, kept, because that genuinely is the view of the system).

- **EVERY FIGURE IS GATED BY `system_access`.** The caller passes the codes it
  already resolved for the sidebar and a probe whose code is missing NEVER
  RUNS. A home page printing "₹7.73 cr still to deliver" to somebody with no
  Orders access would be the one place in this ERP where that leaks, and it is
  the most commercially sensitive number we hold. Proven, not assumed: a
  four-module account renders three tiles and no Petty Cash or Checklist
  figure; an account with none renders no tiles at all.
- **Help Slip's figure goes through `withHelpSlip`** under the viewer's own
  profile, so RLS decides what they may count exactly as it decides what they
  may read — a bare count runs as `postgres`, which bypasses RLS and would put
  a confidential HR concern into somebody's total. No profile, no tile.
- **It must never run a REPORT.** Every probe is one aggregate against an
  index, 4–15ms, awaited IN TURN (five-wide pool, transaction pooler). The
  whole page renders in ~0.24s. Production status alone is 6,000 rows.
- **It does not invent definitions.** "Live line" means what
  `order-entry/shared.ts` means by it — not deleted and not cancelled. A home
  page saying 274 open orders over a Reports page saying 270 is the
  two-screens-disagree failure this module keeps writing rules to avoid, so the
  figures are deliberately COUNTS and a balance, never a derived rate.
- **Mobile is TWO tiles a row.** At 390px the old cards were one per row with
  18px padding and a 26px figure, so four of them filled a phone before a word
  of content. `grid-cols-2` from the smallest width, padding and figure stepped
  down to match: six tiles cost three short rows, and the panels start above
  the fold.
- **A built sentence has to agree with its own count.** It shipped reading
  *"1 petty cash entries have no proof recorded"*. `plural()` handles the noun;
  `be()`/`have()` in `dashboard-brain.ts` handle the verb.

**`.scratch/mint-session.ts` must set `token.userId`, not just `id`.** The real
session callback (`auth.config.ts`) maps `token.userId → session.user.id`, so a
token carrying only `id` produces a session that LOOKS signed in and has no
user id — every permission-gated figure then resolves to "you have no modules"
and the page looks broken when it is the harness that is.

## Reports — one engine, ten definitions built

`/reports`, and it is the shell's own screen rather than a module: it is where
every module's reports come out of. Built Sep 2026 after a full profile of all
46 tables; the analysis behind it — what each module holds, the 37 reports the
data can honestly produce, and three findings that change what those reports
should say — was published to the owner as an artifact and is the spec.

**SIX Order Entry reports, not nine, and the cut was the owner's** (Sep 2026):
*"keep only 6 reports which are important and 100% right, remove reports
showing same repetitive information."* Three of the nine were the same sheet
twice, so their useful columns were folded into the survivors rather than
thrown away:

| Gone | Where it went |
|---|---|
| Order status summary | **Order register** — it was already one row per order with the same party/agent/transport/metres/value. It gained `Reached`, `Furthest line`, `Complete`, `Days open`, `Age`, `Lines finished`, `Lines through`, `Days since move`, `Last ticked`, an ageing panel and three KPIs. |
| Work in progress | **Production status** — it was production status filtered to the unfinished lines. That report gained `Still open`, `Waiting on`, `Days open`, `Age`, `Days since move`, `Transport`, `Haste`, a bottleneck panel and an ageing panel. Filtering `Still open = Yes` reproduces the old report exactly. |
| Rate analysis | Deleted outright at the owner's instruction. Quality & design analysis still carries each cloth's lowest, middle and highest rate, which was the part of it that was never in doubt. |

The six that remain answer six different questions — **by order, by line, by
process, by customer, by agent, by product** — and nothing in one repeats
anything in another.

**One word must mean one thing on one sheet.** Two figures had drifted and both
were caught by running every report against SQL written separately:

- **"Finished" is the LAST STAGE being ticked, not all seven being ticked.**
  33 live lines have Dispatch ticked with an earlier stage never ticked, so the
  count-of-ticks reading called them open while the funnel called them
  finished — the same production-status dashboard printed both 3,678 and 3,711
  as the number of lines still open. A dispatched line has left the mill; the
  missed tick behind it is a data gap, and `Stages done` beside the flag is
  where that shows. `Waiting on` is therefore the FIRST un-ticked stage, not
  the one after the last tick.
- **Two "Lines" columns on the register** — `line_count` (all lines) sat beside
  the merged-in `live_lines` (cancelled excluded). One column now, cancelled
  excluded, matching Metres and Value beside it; the cancelled ones keep their
  own column.
- The order register counts every customer who placed an order (204); line
  detail counts those with a line still standing (202). Both are right, so the
  line-detail insight now says so in a clause rather than leaving two reports
  quietly printing different numbers.

**Verification is a script, not a screenshot** (`.scratch/verify.ts` while it
lasts). It runs each report twice and requires the rows to be byte-identical —
non-deterministic ordering inside an order was a real defect — then checks 14
figures against independently-written SQL and 10 figures the reports share with
each other. It must come back with zero failures before any of this ships;
these files go to the MD.

**HOW MANY REPORTS A MODULE GETS IS DECIDED BY ITS DATA.** The owner's rule
after seeing the first six (Sep 2026): *"other modules don't have much data so
we don't need 6 reports there — create reports as per modules, like for
checklist 1 report is sufficient."* It is not only about row counts: a module
with one table worth reporting on has one honest grain, and splitting it into
six produces six views of the same sheet — exactly what had to be cut out of
Orders.

| Module | Reports | Why that many |
|---|---|---|
| **Orders** | 6 | Six genuinely different grains over 5,758 live lines. |
| **Goods Return** | 3 | 341 returns / 391 items. By return, by cloth line, by party. Receiving is a COLUMN on the register (filter `Received = No` for the chase list), and the four return reasons are a panel on its dashboard, not a sheet of four rows. |
| **CRM** | 1 | Six tables, one with rows: 74 follow-ups. Attempts, issues and ratings are all empty, so a call-log report would be a nice header over nothing. |
| **Petty Cash** | 1 | The ledger. A monthly-summary report would be a roll-up of it, and the module's own Monthly summary screen already does that live. |
| **Checklist** | 1 | One fact table, `occurrences`. Scorecards and completion are roll-ups of it. |
| **Help Slip** | 1 | The concern register — see the RLS note below. |

**The Help Slip report is the one that could leak, and it is the only report
that does not use `pg.unsafe`.** It runs inside `withCurrentUser`, so the
database enforces exactly what it enforces for the standalone app and two
people exporting the same period get different files — which is correct.
Proven with `.scratch/verify-hs.ts`: a bypassing query returns 3 concerns; the
admin sees 1, the employee sees 1, the two test profiles see 0. **Never replace
it with a plain query, not even temporarily to check a number.** The free text
— description, proposed solutions, comment thread — is deliberately NOT in the
file: a spreadsheet is a file that gets forwarded. Counts and dates only.

**What these reports refuse to do, and why that is the feature:**
- **Goods Return's party report does not show what each customer BOUGHT.** That
  column was built — it is the best question on the report — and removed. The
  two systems keep separate party lists with no shared id, so the only join is
  the name (matched 22 of 212), and the histories barely overlap (returns from
  June 2024, Orders from May 2026). It produced *"the middle party returns 50.6%
  of what they bought"*, which is not true of this business. It comes back the
  day the two systems share a customer id.
- **The Goods Return item report's value column is the WHOLE RETURN's**,
  repeated on each of its items, because the source records no money per cloth.
  It does not total at the foot and the caveat says never to sum it.
- **26 returns carry no value at all**; they are counted as returns, left out
  of every money figure, and flagged in their own column. **72 were received
  before their own date** during the catch-up, so days-to-receive is blank
  rather than negative. **One is dated 2000-01-01** and is flagged, not
  corrected — this repo does not edit live Goods Return records.

**The month grid took the FIRST nine months and hid the newest.** Over Goods
Return's 24-month span that printed 2024 and hid this year. `matrixFrom` now
keeps the last twelve and `drawMatrix` takes the last nine — **with the row
values offset to match**, because slicing columns from the end while still
indexing values from the front puts 2024's figures under 2026's headings, which
is a wrong number rather than a missing one.

**Reports has THREE views now, on one pill strip** (`reports-tabs.tsx`):
**Export files** (`/reports`, the picker), **Sales dashboard** (`/reports/sales`)
and **Production dashboard** (`/reports/production`). The owner asked for
on-screen dashboards after showing three reference dashboards (a retail sales
report, a garment-manufacturing KPI board, a production report); the two we
built are those shapes drawn from our own data.

**The dashboards do not query the database.** `lib/reports/dashboards/order-entry.ts`
runs the REPORTS — `orderRegister.run()`, `qualityAnalysis.run()`,
`productionStatus.run()` — and groups their already-verified rows. That is the
whole design: a dashboard with its own `sum(line_total)` looks identical to the
report's until one of them forgets to exclude cancelled lines, and then two
screens in the same ERP disagree by lakhs with nothing on either to say which
is wrong. It also means the `ReportAnalysis` the Excel dashboard draws (KPIs,
trend, panels, the month grid, the written insights and the caveats) renders on
the screen unchanged — the web dashboard and the workbook dashboard are the
same dashboard twice. Sales costs two report runs plus two dropdown queries,
Production one plus two, **all awaited in turn** (five-wide pool, transaction
pooler).

**The caveats print on the screen, not only in the file.** "Value excludes
cancelled lines" is the difference between ₹8.34 cr and ₹8.47 cr, and a
dashboard that omits it is one somebody reconciles against a printout and
cannot make balance.

**The slicers are a plain GET form** (`dashboard-filters.tsx`) — no client
component, no router push on every keystroke. A dashboard that re-runs two
reports on each change spends its life loading; a GET form gives back-button
history, a shareable URL and a working screen without JavaScript for free.
Every parameter is validated in `dashboard-common.ts`: a bad date would
silently become "no filter" and show a wider period than the header claims.

**`haste` is NOT an urgency field in the live data** and no chart may treat it
as one. 312 of 325 orders have it empty and the other 13 hold party names. The
card that tried to draw it now shows order-size bands instead, which answers
the question that card was there for — is the book a few big orders or many
small ones (68 under ₹50,000, 9 over ₹10 lakh).

**Charts are Recharts with `var(--token)` colours**, the same recipe as
`petty-cash/charts.tsx`, so they repaint on a theme flip with no JS. Six
shapes, one per kind of question — combo (how much AND how many), share pie,
ranked horizontal bars, labelled columns, an SVG ring gauge, and a CSS funnel.
A dashboard that repeats one chart eight times is a table with extra steps.

**Adding a report is one file and one line.** Write a `ReportDefinition`
(`src/lib/reports/types.ts`) — id, module, columns, filters, and a `run` that
returns rows plus an analysis — and add it to `REPORTS` in `registry.ts`.
It then appears on the picker, inherits its module's permission, and exports
as both CSV and a full workbook with no further code. `order-entry/order-register.ts`
is the worked example; copy its shape.

**Permission is the module's, and that is the owner's rule**, in their words:
*"all persons who have access to a particular module will be able to export
their module's reports."* So `lib/reports/authz.ts` reads
`ld_erp_core.system_access` and nothing else. Two exceptions they did not
overrule: cross-module reports show only the modules the viewer already holds,
and the audit-trail and users-and-access reports are ERP-admin only. **Help
Slip reports must go through `withHelpSlip`** under the caller's own profile —
a bulk export bypassing its RLS would be the worst thing this module could do.

**A report is offered on demand only.** The owner chose that over scheduling;
there is no cron, no `CRON_SECRET`, no emailed workbook. Do not add one without
asking.

**The two formats are genuinely different jobs.**
- **CSV** is the rows and nothing else — one header, ISO dates, bare numbers,
  no totals row. It carries a UTF-8 BOM (or Indian names arrive as mojibake in
  Excel on Windows) and prefixes any cell starting `=`, `+`, `-` or `@` with a
  quote. That last one is not theoretical: party names come from a shared list
  anybody with Masters can edit, and a name beginning `=` is a live formula the
  moment the file opens.
- **XLSX** is three sheets — Dashboard, Data, Notes — plus **Receipts** on a
  report that carries attachments (only Petty Cash today). The Notes sheet records
  who ran it, when, with which filters, what every column means, and the
  caveats. A caveat nobody reads is a caveat that did not happen, so they also
  print under the dashboard.

**The workbook carries REAL Excel charts, written into the zip by hand**
(`src/lib/reports/xlsx-charts.ts`, Sep 2026). ExcelJS has no `addChart` and
never has, so every visual used to be built out of cells — honest, but not what
a dashboard looks like, and the owner asked for the exported sheet to carry
what the screen carries. An .xlsx is a ZIP of XML parts and a chart is four of
them, so the workbook is built with ExcelJS exactly as before and then the
finished zip is opened with `jszip` and the chart, drawing, relationship and
content-type parts are added. The result is native: right-click → Edit Data
works, it redraws when the numbers change, it prints, and it opens in Google
Sheets and LibreOffice. **No images IN A CHART** — a PNG of a chart is a photograph that starts lying
the moment anybody touches a filter, and it would need a rasteriser on a
serverless function for decoration.

**THE RECEIPTS ARE A DIFFERENT QUESTION, AND THEY ARE EMBEDDED** (Sep 2026,
owner: the Receipt column showed *"only attached image name not the actual
image"*). A receipt is not a rendering of data that can go stale — it is the
document, and it is the evidence the figure beside it happened. So a report
may declare `ReportResult.images` (`rowKey`, `columns`, `byRow`, `load`) and
the workbook grows a **Receipts** sheet: one row per attachment, the picture
beside the entry's reference, date, payee, amount and reason.

- **It is a SHEET, not a tall cell on Data, and that is not a style choice.**
  An embedded picture FLOATS over cells; it does not belong to a row. Excel
  moves floating pictures when rows are inserted or filtered and does **not**
  move them when a range is sorted — so one click on the Data sheet's sort
  button would leave every receipt sitting over somebody else's payment, with
  nothing on the page to say so. A receipt over the wrong payment is worse
  than no receipt.
- **Bytes are fetched LATE.** `byRow` carries names and opaque references out
  of the report's own query; `load` is called by the workbook builder alone.
  A CSV export and a dashboard run never touch storage, and a 5,000-entry
  period does not pull 5,000 photographs to print a table.
- **The storage path is NEVER written into the file.** The workbook draws the
  picture and throws the path away — the whole attachment design refuses to
  hand out anything that works without a permission check.
- **THE CAP IS SET BY THE PLATFORM, AND THE FIRST ONE WAS WRONG.** The export
  route hands the WHOLE workbook back as one response body, and **Vercel
  refuses a serverless response over 4.5 MB** (`FUNCTION_PAYLOAD_TOO_LARGE`) —
  the response-side twin of the 4.5 MB REQUEST cap that already forced petty
  cash uploads to go browser-to-storage. The sheet shipped with a 20 MB budget
  and every local test passed, because `toWorkbook()` and a curl against
  localhost have no such limit: one 1.53 MB receipt made a 1.54 MB workbook and
  looked perfect. **The third receipt would have been a broken download in
  front of the MD.**

  Two controls now, and they do different jobs:
  - `MAX_IMAGES` 60 / `MAX_BYTES` 3 MB — the normal control, which drops the
    TAIL and keeps the rest.
  - `RESPONSE_CEILING` 4 MB, checked on the FINISHED file in `toWorkbook`. A
    budget on source bytes is a prediction; over the ceiling the platform does
    not truncate the download, it replaces it with an error. If the pictures
    pushed the file past it, the workbook is built ONCE more without them and
    says so on its own face. That fallback drops EVERY picture, which is why
    the budget has to be the thing that normally decides — a budget so tight
    the guard never gets close is receipts thrown away for nothing.

  `.scratch/payload-test.ts` proves both paths with synthetic receipts. **Its
  first version passed everything and was worthless**: it drew a pattern, the
  xlsx zip squeezed 1.5 MB down to 0.2 MB, and eight copies of one image were
  deduplicated by ExcelJS into a single stored part. Fake receipts must be
  RANDOM pixels and DISTINCT per image, or the test measures compression
  instead of payload.

  What did not fit is counted on the sheet with where to find it, and a file
  that is not a picture Excel can draw — a PDF bill, a .tif — gets its line
  saying what it is. Nothing is silently dropped.
- **Receipts are fetched in concurrent batches**, six at a time, not one after
  another inside the drawing loop. Sixty end-to-end round trips to storage on a
  function whose clock is running is how an export times out; `maxDuration` on
  the route is 60s, the most a Hobby plan allows and well inside Pro's.
- **Sizes come from the file's own header** (`image-size.ts`: PNG IHDR, GIF
  screen descriptor, JPEG SOF walk), so a portrait photo of a bill is not
  squashed into a landscape box, and a small thumbnail is never blown up.
- **`injectCharts` may no longer assume `drawing1.xml` is free.** ExcelJS
  writes that name for the Receipts sheet's pictures, so the hardcoded name
  overwrote the receipts with the chart drawing and left that sheet pointing
  at a part that no longer described it — a damaged file, the same class of
  bug as reusing an rId. Both the drawing and the chart parts now take the
  next free number.

Three things must be right or Excel refuses the whole file with "we found a
problem with some content" and names no part:
- **Child order is fixed by the schema.** `c:barChart` is barDir, grouping,
  varyColors, ser…, dLbls, gapWidth, overlap, axId, axId — in that order, and
  `c:ser` orders its children DIFFERENTLY for bar, line and pie. That is why
  there are three series builders and not one with flags.
- **Every `c:dLbls` must carry all five `show*` flags.** A missing
  `showBubbleSize` is a broken part, not a default.
- **`<drawing>` goes near the END of a worksheet part**, after pageSetup and
  before tableParts/extLst.

**The charts point at a hidden "Chart data" sheet**, not at the Data sheet. A
chart bound to the filtered table would change shape under a filter while the
KPIs and the headline beside it still described the whole period — half the
sheet answering a different question from the other half. The dashboard
describes the period as a whole, always, and a footnote on the sheet says so
and names the hidden sheet, because a hidden sheet nobody was told about is one
somebody finds and distrusts.

**Money is plotted in LAKHS.** An axis reading 20,000,000 is unreadable and
Excel's comma scaling only does powers of a thousand, so it cannot produce lakh
or crore. Money series are divided by 100,000 and the chart title says
"(₹ lakh)" — except on pies and doughnuts, which are labelled in percentages
and where the unit would read as a contradiction. Exact rupees stay on the Data
sheet, to the paisa.

**The KPI band and the heat grid stay as cells.** A figure with its own
movement arrow and denominator reads better as a tile than as a bar of length
one, and no chart type shows WHO and WHEN at once the way a colour-scaled grid
does. **A `dataBar`/`colorScale` rule REQUIRES `cfvo`** — undocumented, and
without it the workbook builds fine and then dies inside `writeBuffer()` on
`rule.cfvo.forEach`, a long way from the cause.

**THE MATERIAL IS CALLED A FABRIC, EVERYWHERE** (Sep 2026, owner's
instruction: *"rename cloth as fabric"*, then the same for Quality). It had
three names for one thing: the database column is `quality`, the reports wrote
"cloth", and the order form — which is what everybody actually uses — is built
out of FABRIC blocks. One dashboard read "237 qualities" beside "which cloth
earns most" about the same material.

Every user-facing string now says **fabric**: column labels, chart titles, KPI
labels, insights, caveats, and the report name (`Quality & design analysis` →
**Fabric & design analysis**). **Nothing under the surface moved** — the column
KEYS are still `quality` / `qualities`, the SQL still selects `li.quality`, and
the filter values are unchanged, so an existing link or a saved filter keeps
working.

Two traps a blanket find-and-replace walks straight into, and both bit:
- **It renames column KEYS.** `key: "qualities"` became `key: "fabrics"` while
  the row object still emitted `qualities`, which produces a silently EMPTY
  column — no error anywhere.
- **It renames SQL ALIASES.** `as qualities` became `as fabrics` while the
  outer select still asked for `l.qualities`: `column l.qualities does not
  exist`, and every Order Entry report stopped running.

Rename the strings people read, never the identifiers. Afterwards, prove no
column went blank — regenerate and check that every renamed column still has
values in it.

**THE WORKBOOK DASHBOARD FOLLOWS ONE DESIGN SYSTEM** (Sep 2026, on the
owner's brief: a premium corporate MIS pack, white ground, restrained
teal/blue/green, amber and red kept for warnings). The rules are in the code
and they are not negotiable per report, because a pack whose colours mean
different things on page two is not a pack:

| Colour | Means | Where |
|---|---|---|
| Teal | Normal, primary | Every comparison and ranking, single-colour |
| Blue | Information | A second series, a reference |
| Green | Completed, positive | Good end of a severity ramp, "Done" badges |
| Amber | Pending, warning | Warnings only |
| Red | Late, critical | Exceptions only |
| Grey | Neutral | "Everyone else", "Not recorded" |

- **Colour never encodes WHICH chart it is.** The old code rotated six colours
  per panel, so the same fact was teal on one chart and brown on the next. A
  ranking is one colour: its third bar is not more amber than its second. The
  ONE exception is a panel marked `tone: "severity"` — only `ageing()` sets it,
  because its rows genuinely run best to worst.
- **Three chart shapes, and the choice is never a guess.** A time series is a
  LINE. A FIXED-CATEGORY COMPARISON — money in against money out, done against
  still to do, settled against still open — is a clustered COLUMN. Everything
  else — rankings, funnels, ageing — is a HORIZONTAL BAR, read against a common
  baseline with room for a thirty-character party name.
  The column chart was removed once and came back on a stated rule, which is
  the distinction that matters: it used to be picked by a HEURISTIC ON LABEL
  LENGTH, so the same question was drawn two ways in one workbook depending on
  whose name was short. It is now picked by `Panel.fixedCategories`, which the
  report itself sets to declare that its categories come from the question and
  not from the data. A panel therefore draws the same way in every period and
  under every filter — the property that was actually missing.
- **Every chart carries a SUBTITLE, and it is written from the panel.** A title
  asks the question ("Where the money came from"); the subtitle says what the
  answer is OF ("By value — the top 10 of 24, highest first"). It is a second
  `a:p` inside the chart's own `c:rich` title, so it travels with the chart
  rather than sitting in a cell somebody can move away from it. **It must never
  say "all".** A ranking panel is already a top-N — `rank()` cuts at ten — so
  the panel cannot see how many customers there were, and "All 10" over the ten
  biggest of two hundred is exactly the sentence that gets quoted.
- **Colour carries STATUS on a fixed-category comparison, through
  `RankRow.tone`.** There the categories ARE the statuses, so "Done" is green
  and "Past their day" is red and the house palette is doing its job. It is
  never set on a ranking: a customer is not "good" for being third. "Still
  ahead" is grey rather than amber — a duty whose day has not come round is not
  late, and colouring it as a warning puts the checklist in the red on the
  first of every month.
- **A doughnut only for a composition, and only with 2–5 slices.** Share
  panels are the top FOUR plus "Everyone else", which also keeps the
  percentages honest (Excel rebases pie labels over the points it is given).
- **ONE BAR IS NOT A CHART.** A panel with a single category becomes a summary
  card. This is what the owner reported: the Checklist drew three charts each
  showing one bar of length 1. It now draws none and prints three cards.
- **A PAGE WITH NO CHARTS IS STILL A FINISHED PAGE.** That rule left Petty
  Cash, the Checklist and Help Slip — one row each, so every panel a single
  category — as figures, three cards, and a wide empty band where every other
  report has charts. The owner reported that too. The band now carries a line
  saying what a chart needs before it can appear.
- **EVERY PAGE ENDS IN THE MANAGEMENT TABLE**, not only the pages with nothing
  to chart. It was drawn only on the thin reports at first, which made it read
  as an apology for a thin report rather than the closing section of a pack —
  and it left the ten pages that DO have charts ending on a sentence, with
  nothing on them a manager could point at and say "show me one of those". Ten
  rows, drawn to the Data sheet's own rules (Indian grouping, DD MMM YYYY,
  units inside the cell, status badges), with a footnote naming what was left
  out.
  **Its columns take the width their content needs.** Every column of the
  dashboard is 12.6 characters, because the same twelve carry the KPI tiles and
  the charts — fine for a date, and it CLIPS a party name: "777 THE PREMIUM
  STORE" arrived as "777 THE PREMIUM", which on a page a manager reads is a
  different customer. Text and datetime columns take two of the twelve and
  their cells are merged, so the table shows about seven columns and every one
  of them is legible. The split is by column TYPE, never by the length of the
  values in this period — that is the label-length heuristic again, and it
  would redraw the table differently every month.
- **Labels are readable on the fill they sit on.** A doughnut writes its label
  INSIDE the slice, so those labels are WHITE; bar labels sit outside on white
  paper and stay dark. That was the owner's other complaint.
- **ALL TEXT IS DARK. Hierarchy comes from size, weight and case, never from
  fading text towards the paper.** Chart axis and legend text defaulted to a
  light grey chosen so a chart "does not shout over its own title", and the
  sheet's captions and notes used two more greys. On a printed page and on a
  projector they do not sit quietly, they disappear — the owner reported text
  they could not read. `txPr` now defaults to near-black, and `C.ink2` /
  `C.ink3` were darkened (#464B56 → #23272F, #7A8291 → #3C424E). A 20pt bold
  figure over an 8pt uppercase label is enough hierarchy on its own.
- **A ranking is one HUE, shaded dark-to-light by rank** (`RANK_RAMP`). This
  does not break the rule above it: every bar is the same teal and only its
  depth changes, so the shading carries the one thing the chart is about — the
  order. The owner's complaint was that every chart in the pack looked like
  the same chart; the answer is NOT a hue per chart (reverted in the Sep
  audit, because the same fact then changes colour page to page) but a ramp
  that means something inside one chart. Shades are spread across the ramp
  rather than taken in order, so two bars get the darkest and the lightest
  instead of two neighbours nobody can tell apart.
- **A subtitle leads with the value label, with no preposition in front of
  it.** "By ${valueLabel}" was tried and produced *"By paid out, highest
  first"* — the labels are noun phrases written for a column heading ("Paid
  out", "Value", "Entries"), and a preposition in front of one is a sentence
  nobody would say.
- **Empty period → "No data available for the selected period"**, not a blank
  half page.
- **The page reads top-down the way a manager asks questions:** title and
  period → what was filtered → the one sentence → six KPI tiles (the rest on
  one "Also —" line, because the eye stops at about six) → the primary trend
  full width → paired analysis charts → **Needs attention** (built from the
  KPIs the report already marks `bad`/`warn` — not a new judgement) → the month
  grid → the management table → what this says → caveats.

**THE DATA SHEET IS THE MANAGEMENT TABLE.** Indian digit grouping
(`83,42,172.64`, via `indianFormat()` — the commas are ESCAPED so Excel prints
them literally instead of applying its own locale grouping, and three sections
is the limit once conditions are used); dates **DD MMM YYYY**; units inside the
cell (`900.00 MTR`, `2 PCS`) via `ReportColumn.unit`, so a column read out of
context still says what it measures; and compact **status badges** via
`ReportColumn.badge`, an explicit value→meaning map. Never infer a badge from
the type: "Cancelled: Yes" is bad and "Received: Yes" is good, and nothing but
the column knows which.

**EVERY REPORT WAS GONE THROUGH FOR BADGES** (Sep 2026). Six of the twelve had
none at all and the other six had exactly one — nearly always the `Age`
bucket — so the same kind of column was tinted on one sheet and plain on the
next. Twenty-one maps were added across nine reports. Two rules came out of
doing it:

- **A MAP NAMES THE EXCEPTION, NOT THE STATE.** A tint on the majority value is
  not a highlight, it is a background, and the page stops meaning anything. So
  `Complete` carries `{Yes: "good"}` and nothing for No (264 of 337 orders are
  open — that is what a live book looks like); `Cancelled` carries
  `{Yes: "bad"}` and nothing for No; `Reached` colours only `Not started`,
  because an order at Challan is not doing worse than one at Bill. **The seven
  `stage — done` columns on production-status carry NOTHING**: either tone
  would paint thousands of cells across seven columns, and `Reached` and
  `Waiting on` beside them already say the same thing once.
- **`.scratch/badge-density.ts` measures it against the real data** and flags
  any column tinting over 70% of its rows. Seven do, and all seven were argued
  rather than waved through: the three `Age`/`How overdue` columns are severity
  SCALES (0–7 days green through over-60 red), which are meant to cover every
  row; the Checklist's is one row; and CRM's `Called` (100% amber) and `On time
  (our dates)` (96% red) are the truth — nobody has rung anybody and 72 of 75
  deliveries were late. Colouring an ordinary state is the defect; colouring a
  sheet that genuinely is a problem is the point.

**One fact is coloured ONCE.** Goods Return's `Received` boolean is badged and
its `Status` twin ("Sent, not yet received") is left plain — the terse column
is the one a reader has to interpret. The Checklist's `On time` carries only
the red, because `Where it stands` beside it already carries the green. **The CSV is untouched by all of this** — ISO dates,
bare numbers, no units — because it is the machine's copy.

**VALIDATE WITH REAL EXCEL, NOT WITH A LIBRARY.** This cost a shipped
release. `.scratch/validate.py` parsed every XML part, checked every
relationship, and re-read all six workbooks with **openpyxl** — a completely
different library from the one that wrote them — and reported every chart
present. Excel then refused five of the six with *"we found a problem with some
content"* and repaired them by deleting the drawing, so the owner opened a
dashboard that was KPI tiles and eighty blank rows.

A library round-trip proves the XML parses. It does not prove Excel accepts it.
`.scratch/excel-check.ps1` drives real Excel over COM, opens each workbook
read-only with alerts suppressed, and counts `ChartObjects` per sheet — **zero
charts on a file written with six is the repair having happened**. Run it
before shipping anything that touches `xlsx-charts.ts`; Excel is installed on
the owner's machine and the whole pass takes under a minute.

The bug it caught, and the shape of the lesson: **`c:dLblPos` is illegal on a
DOUGHNUT chart.** A pie accepts `bestFit`; a doughnut accepts no position
element at all. One shared `pieSer` builder emitted it for both. The tell was
that production-status — the only report with no share panel, so the only one
with no doughnut — opened perfectly while the other five did not. Also fixed:
negative `xdr:colOff`/`rowOff` in the anchor, which is schema-legal and which
Excel treats as damage; offsets must be >= 0.

**THE FULL AUDIT (Sep 2026) — 43 confirmed defects, all fixed.** The owner
asked for the whole module to be checked: build, CSV, Dashboard, Data, Notes,
figures, route, screens. Eight reviewers went at it in parallel and every
finding was then handed to an adversarial verifier who had to REPRODUCE it or
throw it out. The ones worth remembering, because each is a rule now:

- **A mean of means is not an average.** "Avg order" carried `total: "avg"`
  with no `avgWeightBy`, so the footer averaged 71 agents' own averages and
  read ₹1.94 L where total-value-over-total-orders is ₹2.57 L — **24% low**, on
  two files that go to the MD, under a note promising "the average order across
  the whole file". Any per-row average needs `avgWeightBy` naming its
  denominator column.
- **The heat grid divided money by a thousand twice.** `matrixFrom` stored
  thousands and the cell format `#,##0,` scaled by another thousand, so a
  ₹85,15,000 month printed as **9**. The screen had the mirror bug. Values are
  RUPEES everywhere now; only the number format scales.
- **A doughnut rebases its percentage labels over the points it is given.** The
  "share" panels are the top five, so Excel labelled PR EXPO **68.0%** on a
  sheet whose KPI card beside it said 25.8%. Share panels now carry an
  "Everyone else" slice.
- **The month grid ranked and totalled over ALL time while drawing twelve
  months**, so the biggest party sat at the top with every cell blank and
  ₹13.4 L beside it. It ranks and totals over the months shown.
- **The formula-injection guard fired on negative numbers**, turning 2,439
  "days late" cells into text Excel would not add up — and it did NOT protect
  the things that actually needed it: a design number `01` became 1 and merged
  with a different design, and a cloth literally named `TRUE` became a boolean.
  The guard is **type-aware** now: numeric columns are never guarded, text
  columns are guarded when Excel would execute OR silently coerce them.
- **`datetime` columns were text** carrying a date format, so Excel could not
  sort or group by them. They are real date cells, shifted to IST.
- **The autofilter covered the header row and nothing else** (`ref="A1:AM1"`).
- **`Panel.note` was never written to the workbook** — "only customers who took
  over 100 metres" existed on screen and nowhere in the file.
- **"Everything on record" was printed over date-filtered files**, because the
  label required BOTH bounds while the route and the SQL accept either. It also
  never said WHICH date it filtered on, and that differs per report.
- **Frozen numbers in caveat strings.** "26 of the returns carry no value" was
  a constant printed whatever the period. Any number in a sentence must be
  computed from the run.
- **One typing slip moved an average 62%** — the return dated 2000-01-01, which
  the same report flags as a slip, had been "waiting" 9,747 days. A row a report
  calls wrong must not sit inside a figure it calls right.
- **`current_date` is UTC; the rest of the ERP counts days in Asia/Kolkata.**
  Between 18:30 and midnight IST they are different days. Every "counted to
  today" column now uses `(now() at time zone 'Asia/Kolkata')::date`.
- **A failed export replaced the Reports screen with raw JSON**, because the
  download is a top-level navigation. It answers with a readable page, and
  "not signed in" is 401 rather than 403.
- **A part month against a whole month is not a fall.** On the 8th the
  dashboard printed "fell 66.0%" as fact two lines above its own run-rate
  sentence saying the opposite; the trend sentence now says the month is not
  finished.
- **An argument with a default is not a wired argument.** `buildDashboard`
  took `filters: string[] = []` from the day the strip was written and NOTHING
  EVER PASSED IT — the labels were resolved after the dashboard was built and
  handed only to Notes. So every workbook, including one narrowed to a single
  customer, printed "No filters applied — this is the whole period" over
  figures covering one party: the exact sentence the strip exists to prevent,
  and it read as correct because it is a correct-looking sentence.
  `.scratch/filters-strip.ts` now requires a filtered and an unfiltered run to
  produce DIFFERENT pages. A default parameter hides a missing caller; when one
  carries meaning, test the two cases apart.

**TWO MORE FIGURE DEFECTS, FOUND BY ASKING WHETHER THE MODULE WAS READY**
(Sep 2026). The answer was no, and these came out of checking rather than
assuming:

- **An order with NO LIVE LINE is neither open nor complete.** Four orders have
  none — three had every line cancelled, one had its only line deleted. Openness
  is `reached_no < 7`, and an order with no lines has no stages, so all four read
  as *"Not started, open 33 days"* forever: inside "Still open", inside the
  ageing panel, inside "open over a month" — and once `Reached` gained its badge
  they were AMBER, telling somebody to chase an order that was cancelled. They
  stay on the register, because they were placed and their cancelled value is
  real; `Reached` says **All lines cancelled** (badged grey, not amber), and
  `Days open` and `Age` are blank rather than zero so they cannot sit in the
  footer average.
- **The same four made "Avg order" 1.2% low.** Agent performance counted
  `count(distinct o.id)`, which includes an order contributing nothing to the
  value column, so the footer divided the whole book by 347 while the numerator
  covered 343. It is `count(distinct o.id) filter (where not li.is_cancelled)`
  now, and real Excel computes ₹2,70,625.07 — matching independently-written
  SQL to the paisa. The report's CUSTOMER count deliberately still counts
  everyone who placed an order; that difference is the documented one the
  line-detail insight explains in a clause.

**ONE CLOCK PER RUN, NOT ONE PER ROW.** `Date.now()` was read inside the row
loop in both order-register and production-status. `Days since move` is rounded
to a tenth of a day, so a row sitting on that boundary read 4.2 near the start
of a 6,000-row run and 4.3 near the end — **one file describing two different
instants** — and two runs seconds apart produced different bytes. The
byte-identical check caught it and it LOOKED like non-deterministic ordering,
which it was not: the ORDER BY has carried a total tie-break on the line id all
along. A report describes one moment, the moment it was run. Read once, use
everywhere.

**The regression suite that has to stay green** (`.scratch/` while it lasts):
`verify.ts` + `verify-gr.ts` + `verify4.ts` — 69 figures against
independently-written SQL, byte-identical double runs; `filters-honest.ts` —
every filter narrowed by an impossible value must return 0 rows, which is the
only test that catches a dropdown the query ignores; `no-dates.ts` — every
report run with NO parameters must return exactly what it returns for
1999–2100, which is the only test that catches a report substituting its own
window in SQL (a `coalesce($1, now() - interval '6 months')` would narrow an
export with nothing on screen to show it); `edge-zero.ts` — every
report over a period with no data, which is where four reports used to print
"the top five qualities are most of it"; `excel-check.ps1` — real Excel opens
every workbook with exactly the chart count the zip holds; `payload-test.ts` —
a workbook with receipts stays inside what the platform will send, both when
the budget trims the tail and when the ceiling drops the sheet; and a structural
pass that re-reads every produced file and checks headers against the
definitions, every Notes sheet against every column, and every chart's cached
values against the cells they point at.

**Three arithmetic traps this module already fell into**, all recorded in the
code that avoids them:
- **The join that inflates every count.** `customer_orders` joined to its lines
  returns one row per LINE; `count(*)` reported 2,900 orders in July against a
  true 161. Every order count is `count(distinct o.id)` and the roll-up happens
  in a subquery.
- **A direction word plus a signed figure.** "fell −68.3%" reads as a double
  negative. The word carries the direction; the figure carries no sign.
- **A rate is money.** `190.58064516129033` is rounded where the row is built,
  not left to a cell format — the CSV has no format to hide behind.

**Analysis lives in `lib/reports/analysis.ts`** — ten families (concentration,
trend, contribution to change, spread and outliers, ageing, ranking, run rate
and the sentence writers), pure functions, written once so every report gets
the same arithmetic AND the same honesty: a figure prints its denominator, a
figure that cannot be computed returns null rather than 0, and the median comes
before the mean.

**AN EXPORT STARTS AS EVERYTHING** (Sep 2026, owner: *"reports are wrong,
I'm searching order no and it's showing nothing — it should export all data"*).
The picker's date boxes opened PRE-FILLED from `defaultMonthsBack` — three
months on the order register, **two** on line detail — so an export taken
without touching them silently covered a window nobody had chosen. Order 420
was raised on 18 May; the box said 9 June. Ten orders and 535 lines were
missing and nothing on screen or in the sheet suggested it before somebody went
looking for an order and found none.

**The file was never wrong.** It carried exactly the window it was handed, the
name said the range and the Notes sheet said the period — which is precisely
why this was hard to see: every honest signal was downstream of a decision made
for the user. A person who wants a narrower period types one; a person who
wants their data should not have to notice a date field to get it.

The boxes now start BLANK and the form says so above them. Nothing in the query
layer changed — the route has always read missing dates as the whole period, so
blank IS everything. `defaultMonthsBack` stays on the definitions as a record of
what each report once thought sensible, with a comment saying it is wired to
nothing; if it ever comes back it must be a visible SUGGESTION, never a silent
pre-fill. Verified through the real route with no date parameters: order 420
present in the register, in line detail and in production status, oldest row
2026-05-17.

**`MAX_EXPORT_ROWS` is 50,000** and truncation is LOUD — the file name gains
`_PARTIAL`, the Notes sheet says how many were left out, and the dashboard
figures still cover every matching row. Silently returning the first 50,000 of
200,000 is how somebody reconciles a year and comes up short.

**`exceljs` is the one dependency this added.** It pulls an old `uuid` with a
moderate advisory about a missing bounds check when a caller supplies `buf` —
neither we nor ExcelJS ever does. Note that `npm install` PRUNES Playwright,
which lives here extraneous on purpose; reinstall it with
`npm install playwright --no-save` and check `git diff package.json` afterwards.

The same prune takes **`server-only`** with it, and nothing in the app notices
until a `.scratch/` script is run: every report file imports it, so `tsx` stops
at `Cannot find module 'server-only'` and no verification script can run. Do
NOT fix that with `npm install` — it prunes Playwright again, and the real
package's `index.js` THROWS outside a React Server Component, which is correct
for a Next build and useless for a script. Drop an empty stub into
`node_modules/server-only` (a `package.json` with `"main": "index.js"` and an
empty `index.js`); node_modules is gitignored, so it costs nothing and
disturbs nobody.

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
