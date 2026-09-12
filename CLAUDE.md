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

**A WHOLE NUMBER PRINTS WHOLE.** `formatNumber` (`lib/order-entry/orders.ts`)
forced two decimals on every quantity, rate, line total and order total in the
module — `3,400.00`, `160.00`, `₹5,44,000.00` — and almost every figure in this
business is whole, so those zeros were noise on nearly every cell of the widest
tables in the ERP. The owner asked for them gone (Sep 2026).

**They are dropped only when they ARE zeros.** Hard-rounding is the obvious
reading of "remove the decimals" and it is the wrong one: 88 line quantities, 59
rates and 23 order totals in the live data carry a real fraction, so rounding
turns a rate of `82.50` into `83` and a quantity of `100.02` into `100` —
misstating real orders on the screen people price from, to save two characters.
A whole number prints whole; a fractional one keeps BOTH places, so `4,704.50`
stays `4,704.50` rather than becoming a ragged `4,704.5`. The rounding happens
before the whole-number test, or a float that is `4699.999999999999` prints as
`4,700.00` while testing as fractional.

One helper feeds all five columns on all three order tables plus the designs
panel, the trash view and CRM — which is why this was one edit and not six.
**The CSV exports and the workbook are untouched**: they write raw values and
`indianFormat()` respectively, because a file is the machine's copy and must
not be rounded for looks.

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

**`--text-3` IS FOR A TIMESTAMP, NOT FOR A LABEL.** The tokens were already
right — `--text-1` and `--text-2` are pure black and `--text-3` is #3f4650 at
9.5:1 on white, tuned after the report came back twice that the app "looks
light and blurry". The dashboards then reintroduced the same complaint by
REACHING for `text-text-3` on content that is not secondary: a KPI's label is
the only thing saying what its number means, and the sub-line under it carries
the denominator, which this ERP treats as part of the figure. Both were grey at
10.5px and the owner reported the page unreadable again.

Content is `text-2`. `text-3` is for a timestamp, a caption, a hint and icons —
and if reaching for it feels like it is carrying meaning, it is the wrong
token. Hierarchy comes from a 19px bold figure between two 11px lines, not from
fading the words that explain it. The one thing that must stay light is
`--text-placeholder`: a placeholder as dark as typed text makes an empty field
look filled.

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

## Importing the old Google Sheet — orders

`/order-entry/settings/import` (Order Entry rules → Import), Sep 2026. Half of
this financial year was entered in the Google Sheet this ERP replaced and has
to come across; the new system's own data starts **17 May 2026**. The owner's
framing was the important part: *"old google sheet ke data me mistakes honge,
data types may be not match to our system"* — so this is a screen with a
mapping step and a preview, not a one-off script.

`src/lib/order-entry/import/` is the core — `fields.ts` (what a column can
become, plus the auto-guess), `coerce.ts` (reading a cell nobody validated),
`build.ts` (rows → a plan), `parse-file.ts` (CSV/TSV/XLSX → rows).
`src/app/api/order-entry/import/route.ts` writes.

**THE SERVER RE-READS THE ROWS.** The browser posts the raw cells and the
mapping, never the plan it drew, and the route runs `buildPlan` again against
order numbers and master lists read fresh in that request. Same rule as the
checklist importer and for the same reason: a preview built minutes ago
describes a database that has moved, and a client is a thing somebody can edit
before it posts.

**FOUR TABLES, NOT TWO.** An order is `customer_orders` + `order_line_items` +
**every `line_stage_progress` row per line** (seven until Sep 2026, eight since
`on_hold` was added — `buildInitialStageRows` writes whatever `STAGE_KEYS` holds) + `design_database`. The
stage rows are the one that gets forgotten: without them an order renders on
the Operations board as permanently "not started" and can never be ticked, and
nothing anywhere reports it. `line_total` is a GENERATED column
(`qty_mtr * rate`) and must never be inserted — a sheet's own Amount column is
mappable as `check_total`, which is READ and compared and never written.

**A BLANK ORDER NUMBER MEANS "THE ONE ABOVE".** This is the behaviour the
importer lives or dies on. A person writing an order into Sheets types the
number, party and date once and lists the designs underneath — visually a
merged cell, and once exported those cells are empty strings. The first version
grouped on the raw cell and dropped every continuation row: a four-design order
imported with one design, and the report said "no order number on this row"
three times, which reads like a broken file rather than a completely normal
one. The number forward-fills, but only onto a row that CARRIES LINE DATA, so a
trailing note is not swallowed as a design. It is reported once for the file,
never per row — on a real sheet this is most of the rows.

**IT IS SAFE TO RUN TWICE, AND EVERYTHING RESTS ON THAT.** An order number
already present is SKIPPED (the owner's choice over overwrite). That is what
lets the browser send the file in batches, lets each ORDER be its own
transaction rather than one all-or-nothing block, and lets somebody fix three
bad rows and re-run the same file — the orders already in are stepped over.
**Batches are cut only at a row that carries its own order number**, or the
rows that inherited it would be lost or filed as a second order; the route
refuses a batch whose first row has no number.

**Order numbers overlap, and that was the trap worth finding first.** The new
system already holds 148–1305 dated 17 May–9 Sep. An old sheet covering the
earlier half of the same financial year uses the same series, so collisions are
expected rather than exceptional — which is why skip-and-report is the default
and why the report names every skipped number.

**"Already there: 40" is a number nobody can act on.** The report counted the
skipped orders and listed only the REFUSED ones, so the forty that did not come
across could not be found again — and a skipped order is one that is NOT in from
that file, not one that was merged. The numbers are printed as plain
comma-separated text (a table row each would be two hundred identical reasons on
a real file), with a line saying they were not imported and to check them in the
old sheet. Covered by `.scratch/skip-e2e.mjs`, which imports a file twice.

**It may CLEAN a value but never quietly.** `₹1,23,456` → 123456,
`1,200 mtr` → 1200, `(250)` → −250, a spreadsheet date serial → a date, invisible
non-breaking and zero-width characters stripped (`"PR EXPO"` with a trailing
U+00A0 is a different party to every comparison in this system and nothing on
screen shows why). Each of those prints a note against its own line number.
Dates are DAY-FIRST like the rest of the ERP, and an ambiguous one — both
halves 12 or under — says so, because `05/06/2026` is 5 June here and 6 May in
a US export with nothing in the cell to say which. **A range like `12-15` is
REFUSED, not guessed**, and an unrecognised word in a yes/no column is refused
rather than read as no — a cancellation flag read as "not cancelled" puts money
into a total that should not have it.

**Line numbers must match the person's own sheet**, so `parseDelimited` gained
a `keepEmptyRows` option: dropping blank rows shifts every number after them,
and an error report pointing at the wrong row is worse than one pointing at
nothing. The checklist's own callers are unchanged (the option defaults off).

**Parsing happens in the BROWSER.** Vercel refuses a request body over 4.5 MB
before our code runs — the same cap that forced petty cash receipts
browser-to-storage — and only the finished batches are posted. ExcelJS's
browser build is dynamically imported and only when an .xlsx is chosen, so a
CSV import never downloads it. A date CELL comes back from ExcelJS as a JS
`Date` whose `toString()` no parser here can read, and it is UTC midnight, so
it is emitted as ISO from the UTC parts — formatting it locally gives the day
before, east of Greenwich.

**A name the master lists do not have still imports.** `party_name` is TEXT,
not a foreign key. But a name that is not in `lookup_values` cannot be picked
from a dropdown or a filter afterwards, so the preview lists every unknown name
with how many rows use it and the nearest existing match, ticked by default, to
be added in one go. The nearest-match suggestion is deliberately conservative
(exact normalised match, or containment at five characters or more) — an
edit-distance match would confidently propose "LONDON" for "LONDAN" and also
"EARTH" for "EARTHY", and an import that quietly merges two fabrics cannot be
undone by looking at the result.

**Imported historical orders read as PENDING and overdue, and that is
correct.** Planned stage dates are computed from the order date plus the
`workflow_stages` offsets, so a June order's planned dates are months past.
Until the production-status data is imported too, every imported order sits in
the Overdue count. Expect that; it is not a defect.

**Proven end to end against the live tables** (`.scratch/import-core.mts`,
`import-e2e.mjs`, `import-verify.mts`). Three test orders written and removed
again: 21 and 14 stage rows (3×5 and 2×7), `line_total` computed by Postgres,
design `01` keeping its leading zero, `60.5 @ 82.50` keeping both decimals, and
the 31-February order refused. `import-verify.mts --clean` removes the
`design_database` rows FIRST — its `order_id` is ON DELETE SET NULL, so they
survive the order and would be left pointing at nothing.

**`setInputFiles` BEFORE HYDRATION FIRES NOTHING.** The e2e test passed once
and then failed on a re-run: the file lands in the input, no React handler is
attached yet, and the run dies sixty seconds later on a selector that was never
going to appear. The first pass only worked because a warm-up curl happened to
buy it a second. CLAUDE.md already recorded this trap for form filling; it
applies to a file input identically.

**THE REAL WORKBOOK BROKE ALL OF THAT, AND FOUR THINGS HAD TO CHANGE.** The
owner sent `LinkD dataEntryInterface.xlsx` (tab **`orders`** — TIMESTAMP, DATE,
ORDER NO., SALES PERSON, PARTY NAME, AGENT, HASTE, TRANSPORT, FABRIC, DEPT.,
DSGN-MATCHING, MTR-YARD, RATE, plus `cancelled order`). Run against it as first
written, the importer produced **three orders, zero lines and twenty-three
errors**. Each of these was on its own enough to do that:

1. **`"OK"` was read as CANCELLED.** The sheet's `cancelled order` column holds
   exactly two words — `OK` for a live line, `Cancelled` for a dead one — and
   `ok` sat in `TRUE_WORDS`. Every healthy line in half a financial year would
   have imported as cancelled, with no error and no warning; the orders all look
   real until somebody asks why the year has no sales. `ok` is FALSE now, and
   `done` is in NEITHER list — in a cancellation column it is genuinely
   ambiguous, and a refusal somebody reads beats a guess nobody sees.
2. **FABRIC is merged down INSIDE an order**, not just at its head. The
   order-level forward-fill did not cover it, because `quality` is a LINE field:
   the fabric is written once per block and blank on every design under it, so
   most rows failed "Fabric is required". It now carries within an order only —
   an order opening on a blank fabric still fails rather than inheriting the
   previous ORDER's cloth — and every carry is reported.
3. **`DSGN-MATCHING` and `MTR-YARD` did not auto-map.** Those spellings were not
   in the aliases.
4. **`DEPT.` had no field at all.** `customer_orders.department` has existed all
   along (varchar 40, default `LD`), and the importer never wrote it — so every
   `LINKD` order would have become `LD`, silently, because the column's own
   default covers it. **Map DEPT. or the two departments merge.**

Also: `-` is read as blank. `SALES PERSON` is `-` on thousands of rows and was
being stored literally, creating a party and a salesperson actually NAMED "-"
in the master lists and every dropdown.

**`Status` is deliberately NOT an alias for the cancelled flag.** The workbook
has both a `Cancelled order` column and a `Status` column, and the
production-status sheet is nothing but status columns — claiming the generic
word would let a stage word land in `is_cancelled`.

**EXPORT THE `.xlsx`, NOT THE CSV.** The CSV the owner first sent came off the
`all_orders` tab, which is the same data through a `QUERY()` and has **no
AGENT, HASTE or TRANSPORT columns at all**. All three are optional, so importing
it loses them with no error. The workbook also carries `dropDown` (the master
lists), `linkD` and `LD_entry` (the same rows filtered by department) and
`Interface` (a data-entry form, not data).

## Importing the old Google Sheet — production status

The second pass, same screen: Order Entry rules → Import → **Production
status** tab (`import-tabs.tsx`, both screens kept mounted so switching tabs
does not throw away a loaded file). `status-layout.ts` finds the columns,
`status-build.ts` turns rows into stage ticks, `api/order-entry/import/status/`
writes.

**IT ONLY EVER TICKS. It creates nothing and it never unticks.** A row whose
order is not in the system is REPORTED, not inserted — the orders sheet is what
creates orders. And a stage that is blank in the sheet but ticked here is left
alone: the sheet is half a year old, so a blank is the sheet being out of date,
not an instruction to undo somebody's work. That is also what makes the file
safe to run twice and safe to run on a working day. The rule is in the UPDATE's
own `WHERE is_done = false`, not only in the plan, so a stage ticked in the
seconds between the read and the write is still not overwritten.

**THE HEADINGS CANNOT SAY WHICH STAGE A COLUMN IS.** The sheet repeats
`Planned, Actual, Status, Time Delay` once per stage — `Planned` appears eight
times — and the stage NAME lives in a merged cell one row above. So the layout
is DETECTED and then shown for confirmation, one row per stage with a real value
from the file under it. Twenty-five dropdowns would be unusable and, worse, easy
to set wrong by one column, which would file every dispatch date under `bill`
with nothing on screen to show it.

- **The heading row is not the first non-empty row.** This file opens with a
  timestamp row and three rows of department names and SLA text; the real
  heading is row 6. It is found by looking for the row that repeats `Planned`
  and `Actual`. `SheetData` gained `raw` (every row, heading included) so the
  status importer can do that without distorting the orders importer's view.
- **The label row is not the NEAREST row above either**, and that cost a whole
  run. Four rows sit above the heading, all populated at exactly the stage
  columns: names, then who owns it, then where, then the SLA. Taking the first
  non-empty one labelled every block `NEXT EOD`, matched no stage, and the
  importer reported that this system has none of the stages in the sheet. The
  label row is chosen by SCORING each candidate on how many blocks it names.

**`"OK"` MEANS DONE HERE AND MEANT NOT-CANCELLED IN THE ORDERS SHEET.** Same
three letters, opposite meanings, one column apart in the same workbook. That is
why `coerceStageFlag` exists beside `coerceFlag` instead of one shared helper —
whichever meaning a shared one picked would silently corrupt the other sheet.
Stock checking also uses `Yes`/`No` where every other stage uses `TRUE`/`FALSE`,
which maps onto `stock_status` in/out of stock.

**THE SAME NUMBER IS NOT THE SAME ORDER, AND THIS IS THE ONE THAT PROTECTS THE
NEW BOOK.** The old sheet's order numbers OVERLAP the new system's — the book
runs 148-1305 and the sheet has 50, 321, 478, 2726. An old order whose number is
already taken is SKIPPED by the orders import (correctly) and never enters the
system. The status pass then looks that number up and finds the NEW order
wearing it: match on order + fabric + design alone and a 2024 production status
can be written onto an order raised in August 2026, silently, whenever the
fabric and design happen to coincide. Nothing would ever have reported it.

So the sheet's own `OD DATE` and `PARTY NAME` are read and CHECKED — never
written. A different date is a different order and the row is REFUSED; a
different party on the same date is a warning, because a party gets respelt far
more often than a date changes. Both templates carry an ORDER DATE column for
this reason. Covered in `.scratch/status-core.mts` under "the same NUMBER is not
the same ORDER".

**THE MATCH IS ORDER + FABRIC + DESIGN, NOT QUANTITY.** `lineMatchKey` in
`workflow-constants.ts` keys on quantity too, which is right for the order form.
The status sheet's `MTR-YARD` holds `190` and also `2-SET` and `1-BALE`, so
keying on it would fail to match every row measured in bales. The quantity is
checked instead — and only when it IS a number, or `2-SET` "disagrees" with 60
metres on most rows of some orders.

**TWO DECISIONS ARE THE OWNER'S, NOT THE CODE'S** (Sep 2026):

- **A later stage ticked with an earlier one blank BACKFILLS the earlier ones.**
  The sheet has such lines (order 2756 has CHALLAN done and STOCK CHECKING
  blank) and this system's own rules say that cannot happen —
  `applyStageProgress` refuses to tick past stock checking until it is in stock,
  so the line would import and then be impossible to work with on the board. A
  backfilled tick takes the sheet's own Actual for that stage if it has one and
  otherwise NOTHING; a made-up date would go straight into delay figures people
  read as fact. Every backfill is reported as one.
- **Our planned dates are kept; only Actual and the tick come from the sheet**,
  and `delay_minutes` is recomputed from the two. The sheet's own planned dates
  are visibly a bulk fill (every line's stock-checking planned is
  `24-05-2025 18:39`) and its `Time Delay` column reads `5617:39:42`.

**The file is 99% empty and that is normal.** 21,310 rows, 38 with data: the
rest are array-formula spill carrying the word `FALSE`, and a dozen carry `OK`
with no order, fabric or design at all. Rows with no design number are counted
and reported ONCE — reporting each would bury the real problems under twenty
thousand identical lines. **File-level issues are never truncated out of the
report**, because forty per-row notes had pushed "21,266 rows were skipped" off
the bottom of the list.

**`ON HOLD` used to be a stage the sheet had and this system did not** — it was
reported as not imported. The owner asked for it (Sep 2026) and it is now the
eighth stage. Read the section below before touching it: it is an ASIDE, not a
step, and the importer never backfills it.

**The browser collects before it posts, and that is the one deviation from
"the server re-reads the rows".** 21,310 rows by 44 columns is far past the
4.5 MB body cap. The browser drops the rows with no design and resolves the
merged order number and fabric; everything that could go stale — which line a
row matches, which stages are already ticked, what the planned dates are — is
still read fresh in the request and re-decided there.

**`workflow.ts` was split.** The stage vocabulary and every pure function are in
**`workflow-constants.ts`** and re-exported from `workflow.ts`, so nothing that
imported from there changed. `workflow.ts` opens the database at module scope,
so a client component importing `STAGE_LABELS` from it pulled `postgres` into
the browser bundle and the build died on `Can't resolve 'net'` / `'perf_hooks'`
/ `'fs'` — with the page rendering blank and saying nothing useful.

**Proven end to end against the live tables** (`.scratch/status-core.mts` —
46 assertions, `status-e2e.mjs`, `status-verify.mts`, `status-twice.mts`).
Twelve orders and 38 lines built from the REAL status sheet's own rows, imported
through both screens, then removed (table back to 351 orders / 6,466 lines /
45,262 stage rows): 266 stage rows, 43 ticked, the gate-breaking line coming out
`order_entry, stock_checking, rolling_checking, challan` with the backfilled
stock check `in_stock` and the backfilled rolling tick carrying no date, and a
**second run of the same file writing nothing at all**.

### The import templates

A **Download the template** button on each of the two import tabs
(`template-button.tsx`), building an .xlsx from
`lib/order-entry/import/templates.ts`. Copies are also written to `templates/`
for handing to whoever does the data entry.

**They are BUILT, not served, and that is the point.** Two files in `public/`
would have been less code and would go stale silently: the day a column joins
`IMPORT_FIELDS`, or the day `on_hold` becomes a stage, the file on disk still
describes the importer as it was and the person filling it in has no way to
tell. Generating from the same constants the importer reads means a template
cannot describe a shape the importer refuses. ExcelJS is dynamically imported on
click, the same rule the .xlsx parser follows.

**A template is only worth anything if it imports cleanly itself.**
`.scratch/templates-verify.mts` generates both and runs them back through
`parseImportFile` → `suggestMapping` → `buildPlan` / `buildStatusPlan`. All 18
order fields must auto-map, nothing required may be left for a person to map by
hand, and the sample rows must plan with zero errors. A template whose headings
the mapper does not recognise is worse than none — it teaches a shape the system
then refuses, and the person who filled in four hundred rows is the one who
finds out.

**The sample rows ARE the documentation.** Each demonstrates something a header
row cannot express: the order number and party written once and left blank
underneath, the fabric written once per block, `OK` against `Cancelled`, `LINKD`
in its own column, a design number of `01`, decimals in qty and rate. They are
obviously fake (`SAMPLE-1`), italic and grey, and both notes sheets say to
delete them — a sample that gets imported as a real order is the one thing worse
than no sample.

**`DESIGN NO` is formatted as text (`@`)** in both templates. It is the only
formatting decision that changes what imports rather than how it looks: without
it Excel turns `01` into `1` and merges it with a different design.

**The status template's row 1 is the stage names, merged across each block of
four; row 2 is the headings; data starts on row 3.** That is the shape
`detectStatusLayout` needs and the shape the old workbook already has. Note
ExcelJS reports a merged cell's value on EVERY column it spans, so reading row 1
back gives thirty-two labels rather than eight — `blockCell` takes the first
non-empty cell of each block, so this is read behaviour and not a defect.

`on_hold` appears in the status template where the old sheet puts it, after
stock checking, because that is where the people filling it in expect it.
Nothing about column ORDER tells the importer anything — the stage is recognised
by its NAME — so moving it breaks nothing.

**Proven in a real browser too** (`.scratch/templates-e2e.mjs`): both buttons
clicked, both downloads saved and re-read. A dynamic import that fails in the
browser bundle fails silently — the spinner stops and no file arrives — which no
server-side test can see.

## `on_hold` is an EIGHTH stage that is not a step, and that distinction is load-bearing

Added Sep 2026 on the owner's instruction, so the old sheet's `ON HOLD` column
stops being dropped on import. Read this before touching anything that counts
stages.

**"Completed" in this system means EVERY stage row on the line is done.** Add an
eighth stage that is almost never ticked and it means nothing is ever complete.
Measured on the live table first: **2,047 completed lines and 72 completed
orders** would have stopped being complete the moment the row was inserted —
across the Order status board, All orders, the home page, the AI assistant and
two reports, on the same day, for a column about something that did not happen.

So it is an **aside**: a real stage row that can be ticked, carries a date and
shows on the board, but that no sequence computation may count.
`ASIDE_STAGE_KEYS` / `FLOW_STAGE_KEYS` / `isAsideStage` / `FLOW_STAGE_SQL` in
`workflow-constants.ts` are that rule; the SQL constant exists because half the
places that needed it are raw queries.

**`sort_order = 0`, and that is not cosmetic.** `dashboard-brain.ts` decides a
line is delivered by finding the stage with
`sort_order = (select max(sort_order) from workflow_stages)`. Given the hold the
highest sort order, "delivered" would silently have come to mean "put on hold".
At 0 it sorts before `order_entry`, so `max()` is still Received LR and that
query needed no change at all — nor did `order-register.ts` or
`line-detail.ts`, whose `coalesce(max(sort_order) filter (is_done), 0)` reads 0
for a hold, which is the same answer as nothing ticked. Verified after the
write: max(sort_order) is still `received_lr`, and the home page still reads
273 of 346 orders open.

**Where the exclusion had to be written, and what each would have done:**

| File | Left in, it would have said |
|---|---|
| `order-status-query.ts` (the `grid` CTE) | every order in the business is sitting "On hold" — `first_undone` resolves to it for nearly every line |
| `orders/route.ts` (the per-line counts) | every line unfinished — `lineStatusFromCounts` compares done against TOTAL |
| `ai/tools.ts` | every order "still in progress", forever |
| `workflow-constants.ts` `computeLineStatus` | the 2,047 lines above |
| `tracking-board.tsx` `lineStatusOf` | the same, in the browser — this file knowingly duplicates the server's rules, and its own comment says the two change in one commit |

`tracking-board.tsx` also compares stage POSITIONS for its two confirmations
("later stages are still done", "stock is being dropped with work after it").
The hold sits last in `STAGE_KEYS`, so without the filter un-ticking Dispatch on
a held line would warn that "On hold" comes after it.

**The gate does not apply to it.** `applyStageProgress` refuses any stage past
stock checking until stock checking is in stock. Goods can be held at any point
— including before anybody has checked stock — and the hold's position in
`STAGE_KEYS` would otherwise make it inherit that gate and refuse the one case
the column exists to record.

**The status importer never BACKFILLS it.** The backfill ticks everything up to
the furthest tick, which is only meaningful for a sequence. Counted in that walk
it would do damage both ways: a held line would backfill every stage before the
hold, and a line that reached Challan would be recorded as having been held when
it never was. The walk runs over `FLOW_STAGE_KEYS`; the hold is taken exactly as
the sheet writes it.

**Its dot is GREY** (`STAGE_DOT.on_hold`), not because the palette ran out —
that is the documented reason the last two are both teal — but because it must
not read as one of the seven coloured stages a line moves through.

**Production status reports it, in two columns OUTSIDE the stage loop.**
`STAGES` in `reports/order-entry/shared.ts` is still the SEVEN and must stay
that way: `production-status.ts` derives `reached`, `waiting_on`, `Still open`
and the funnel from those columns BY INDEX, and `days_start_to_finish` reads
`s6_at`, which is Received LR by position and nothing else. Adding an eighth
entry there shifts every one of those. So the hold is read as its own
`hold_done` / `hold_at` aggregate and lands as **On hold** (badged only on Yes —
a hold is the exception, and tinting "No" would colour the whole sheet) and
**Held on**, beside Waiting on. `last_tick` — which drives "days since move" —
also excludes it, because a line has not moved just because somebody held it
three weeks ago. An insight appears only when something IS held, and a caveat
says a hold never counts as progress.

Verified against the live tables with a real hold on a finished line
(`.scratch/report-hold-live.mts`): still `Still open = No`, still
`Reached = Received LR`, still `Stages done = 7` and waiting on nothing. The
other five Order Entry reports needed no change — `sort_order = 0` keeps every
`max(sort_order) filter (is_done)` reading exactly what it read before.

`.scratch/verify.ts`'s section 4 used to trace `test-002` by name and started
failing the day that order was deleted. It picks the newest order with live
lines now: a check that hangs on one particular row breaks when somebody tidies
up, and says nothing about the reports when it does.

**The 6,460 backfilled rows.** `.scratch/add-on-hold.mts` inserts the config row
and one progress row per existing line (a stage with no row cannot be ticked,
and the board renders the rows that exist). Both writes are
`on conflict do nothing`, so it is safe to run twice. It refuses to write unless
every existing `planned_at` is UTC midnight plus a whole number of days, which
is what proves the date arithmetic matches `plannedAtForOffset` rather than
drifting by a timezone.

**Only 25,663 of 45,220 existing planned dates match today's offsets**, and that
is not a fault: the offsets were raised from the schema default of 1 to 8/10/12
after those orders were entered, and changing an offset does not rewrite dates
already written. There is a "recompute" endpoint for that; it was not run.

**Proven on the live tables** (`.scratch/on-hold-tick.mts`,
`on-hold-screens.mjs`): order 1040, every flow stage ticked, was put on hold
through the real endpoint — 200, still `COMPLETED`, still 2,047 completed lines
across the book — then taken off hold and the row left exactly as it was. The
Order status board reports no order on hold, and no page errors anywhere.

**The standalone Order Entry app read eight rows, saw seven done, and showed a
finished order as partially completed.** It was patched on the owner's
instruction — see "The standalone Order Entry app was patched too" below.

## FINISHED MEANS THE LAST STAGE IS TICKED, AND NOT ON HOLD

The owner's rule (Sep 2026), in their words: *"if anyone click on on hold that
order will became un completed thats the onlly logic for completing order its
not necessary to tick all stages"*.

**It replaced "every stage row is done", which disagreed with half the ERP.**
33 live lines have Received LR ticked with an earlier stage never ticked — a
missed tick behind work that has plainly left the mill. Counting ticks called
those 33 unfinished while the reports, the production dashboard and the home
page all read the LAST stage and called them finished. The same book was
**2,047 complete on the board and 2,080 in the reports**, and CLAUDE.md already
recorded that split as a known defect. One rule now, everywhere: 2,080.

Where it is written, and every one of these had to move together or the split
comes back:

| File | What decides it |
|---|---|
| `workflow-constants.ts` | `computeLineStatus` — the last FLOW stage done, and no aside stage done |
| `workflow-constants.ts` | `lineStatusFromCounts` — now takes `lastStageDone` + `onHold`, not just counts |
| `order-status-query.ts` | `line_finished` / `line_held` CTEs feed `line_status` |
| `orders/route.ts` | reads `lastStageDone` and `onHold` per line instead of filtering the hold out |
| `dashboard-brain.ts` | already read the max-sort_order stage; gained "and not held" |
| `reports/production-status.ts` | `isOpen` gained `|| held` |
| `reports/order-register.ts` | `finished_lines` excludes held lines; `is_complete` needs `held_lines = 0`; new **Lines on hold** column |

**A held line reads PARTIALLY COMPLETED, not PENDING**, because the work up to
the hold really did happen. **`Stages done` beside the status is where a missed
tick still shows** — the figure is not hidden, it just no longer decides.

Proven on the live tables (`.scratch/rule-live.mts`): 2,080 by hand-written SQL,
2,080 from the production report, then one finished line put on hold — the count
drops to 2,079, `computeLineStatus` stops saying COMPLETED, the report flips it
to `Still open = Yes` with `On hold = Yes`, the order register counts
`held_lines = 1` and `is_complete = false` — and the hold is released and every
figure comes back.

## The standalone Order Entry app was patched too

`Desktop/LD Order Entry/LD-Order-Entry`, six files, on the owner's instruction
(Sep 2026). CLAUDE.md's "this repo never modifies them" still stands as the
default — this was asked for, and the six files were checked to be clean of the
other person's uncommitted work first (`CLAUDE.md`, `middleware.ts` and three
CRM components were, and are, untouched).

**The concept is one sentence: count only the stages that app knows about.**
`KNOWN_STAGE_KEYS` / `isKnownStage` / `KNOWN_STAGE_SQL_LIST` in its
`lib/workflow.ts`, applied in `computeLineStatus`, `dashboard-query.ts`,
`monthly-report.ts`, `order-status-query.ts`, `app/api/orders/route.ts` and
`components/tracking/tracking-board.tsx`.

Deliberately NOT "ignore `on_hold`": if this ERP ever adds another aside stage,
that app keeps working. **Nothing there writes** — only the counting changed.

Two traps it had that are worth knowing if it is ever touched again:

- **`stageCount()` is `select count(*) from workflow_stages`** in both
  `dashboard-query.ts` and `monthly-report.ts`, compared as
  `doneCount >= stageCount()`. That became 8, which no line could reach.
- **`doneCount` had to be filtered as well, not just `stageCount()`.** It counts
  every done stage row on the line, so a line with six flow stages done AND a
  ticked hold would have counted 7 against a stageCount of 7 and reported as
  finished — a wrong number rather than a missing one.

Its `order-status-query.ts` loads the stage list straight out of
`workflow_stages`, so without the filter its board would also have drawn an
eighth column nobody there can tick.

Verified with its own module under its own env: a finished line comes back
COMPLETED with an unknown stage present, and a ticked hold never drags an
unfinished line over the line. It cannot be exercised end-to-end from here — it
is a separate deployment on its own port — so tsc, eslint and that logic test
are the checks that were run.

## The Import screen's layout

Rebuilt Sep 2026 after the owner reported it "not looking good". Four things
were wrong and each is a rule worth keeping:

- **TWO IDENTICAL PILL STRIPS, STACKED.** The Orders / Production status switch
  used the same `Tabs` component at the same size in the same box as the
  settings strip directly above it, so the page opened with two full-width
  strips and nothing said which was subordinate. The switch is smaller now and
  sits INSIDE the header card beside the title it changes — it is the only
  control on the page that looks like that, which is what makes it read as a
  choice within Import rather than beside it.
- **PROSE AT THE CARD WIDTH, BECAUSE THAT IS THIS APP'S MEASURE.** A reading
  measure (`max-w-[78ch]`) was tried here and reported as worse, and measuring
  said why: every other settings page runs its description across the whole
  1,288px card — the page subtitle above it, Design Database's own note — so a
  619px column made this page the odd one out, cramped lines with half a card of
  white beside them. Match the house, not the typography textbook.
- **THE HOLE IN THE MIDDLE.** Prose left, template button pinned right, 400px of
  nothing between them. One column now: what this is, then the thing you
  download before doing it. Whitespace at the edge reads as a margin; whitespace
  in the middle reads as a mistake.
- **A FILE CHOOSER IS ONE ROW, NOT A ROOM — AND NOT A FRAME INSIDE A FRAME.**
  It was a 230px-tall card with a button floating in the middle; the first fix
  put a dashed box inside a Card, which is two borders drawing the same edge.
  The dashed strip IS the element now, and its whole area is the click target.
  It stacks below `sm`, where a row would push the button off the edge.

The two screens no longer carry their own intro card — `import-tabs.tsx` owns
the header for whichever is active, so there is one header and one working area
rather than two features stacked. Both screens stay MOUNTED behind `hidden`:
switching to check the other sheet and coming back to find the file gone,
mapping and preview and all, is the kind of small loss that makes somebody
re-upload rather than look.

## Removing an order is WRITTEN DOWN now, and it carries the order with it

Sep 2026. Orders **1262, 1264 and 1265** (Watchlier Clothing, 8 Sep, LONDON,
about ₹29 lakh between them) were on screen in the afternoon and gone from the
table by evening. Every place a trace could survive was searched —
`design_database`, whose `order_id` is ON DELETE SET NULL so its rows outlive
their order; `crm_followups`; the audit log itself — and there was nothing.
`DELETE /api/order-entry/orders/[id]` ran `db.delete(customerOrders)` and
returned. Nobody could say who, when, or what was in them, and there was nothing
to restore from.

**Removing an order is TWO deliberate steps**, which is why it is not an
accident: the permanent delete refuses while any live line remains
(*"Delete the order (move it to Trash) before permanently removing it"*), so
somebody has to bin it and then remove it. Both steps need `orders.edit` — ADMIN
or OPS.

`lib/order-entry/audit.ts` now records all three actions:

| Action | Written by |
|---|---|
| `order-entry.order_binned` | `PATCH /orders/[id]/delete` with `deleted: true` |
| `order-entry.order_restored` | the same, with `deleted: false` |
| `order-entry.order_deleted` | `DELETE /orders/[id]` |

**The row is written BEFORE the thing it records, and that ordering is the
point.** Audit-after leaves exactly the hole above whenever the second write
fails. Audit-before can leave a row describing a delete that did not happen —
recoverable, because the order is still there to look at. Of the two ways to be
wrong, only one loses the answer. `auditOrderEntry` THROWS on failure for the
same reason: the destructive step then does not run.

**And the row carries the whole order, not just its number.** `metadata` is
jsonb, so `snapshotOrder` stores the party, date, department, agent, transport,
challan, lot, totals AND every design line with its quantity, rate and
line_total — capped at 500 lines. Recording the number alone would have answered
WHO in this case and still left nothing to put back. It reads the soft-deleted
lines too: on the permanent-delete path every line is deleted by definition, so
skipping them would snapshot an empty order.

Proven by actually doing it (`.scratch/audit-snapshot.mts`,
`audit-delete-e2e.mts`): an order is created through the real endpoints, binned,
permanently removed — and then rebuilt from the audit row alone, with Postgres
recomputing `line_total` from the restored quantity and rate and arriving at the
same money.

**THE STANDALONE ORDER ENTRY APP STILL HAS NO AUDIT, AND CANNOT GET ONE FROM
HERE.** It shares `ld_order_entry` and has the same two delete endpoints, but
`ld_erp_core` is this repo's exclusively — writing to it from there would point
the dependency the wrong way. So a delete done in that app still leaves no
trace. If order deletions ever need to be answerable whatever the door, that
app needs its own audit table, and that is a change in its repo.

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
  `useTrackView`, `useDebouncedValue`, `useColumnPrefs`, `ColumnPicker`,
  `csv`). Reuse them; §0.4 exists because these were hand-rolled
  inconsistently before.
- **THE COLUMN PICKER IS ON ALL THREE ORDER TABLES** (Sep 2026, owner: *"in
  order status table we have given choose column option … so I need this same
  option in All orders and Operations table"*). It was written for the Order
  status board and lived under `order-status/`, which read as belonging to that
  screen. It moved to `shared/` — the old path is a re-export, so nothing that
  imported it had to change — and All orders (`orders-dashboard.tsx`) and
  Operations (`tracking-index.tsx`) now carry it too. These are the same orders
  on three screens, and somebody who never reads Haste never reads it on any of
  them.
  - **One key per table, never one shared key.** `oe:order-status:cols:<email>`,
    `oe:orders:cols:<email>`, `oe:operations:cols:<email>`. The column SETS
    differ — the board has Stages and Overall, the other two have Agent and
    Actions — and a shared key would fill everybody's storage with ids that
    mean nothing on the other screens. `useColumnPrefs` filters restored ids
    against the current list, so it would not break; it would just quietly
    forget half of what you chose.
  - **A COLUMN IS GATED IN THE HEADER AND IN THE BODY, OR THE TABLE LIES.**
    Hiding a `<th>` and forgetting its `<td>` renders perfectly: the table just
    shifts one column left from that point down, so every figure sits under the
    wrong heading and nothing errors. `.scratch/col-picker.mjs` counts the
    header cells and every row's cells and requires them to agree, before and
    after switching columns off. Any expanded row's `colSpan` is computed from
    the same list, never hardcoded — the designs panel on All orders was a
    hard `13`.
  - **The min-width has to follow the choice.** The board pins its table at
    `min-w-[1240px]` whatever is hidden, so switching four columns off there
    stretches the eight left and the sideways scroll never goes away — which
    is the one thing the control exists to fix. The two new tables give each
    column a `w` and ask for the sum of the VISIBLE ones; the widths add up to
    the width that table always had, so nothing moves until something is
    switched off. The board still has the old behaviour.
  - **No picker where there is no table.** Both new tables become a card list
    below their breakpoint (`lg` on All orders, `md` on Operations), so the
    button is hidden there. A control offering to hide columns on a screen with
    no columns does nothing when tapped.
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

**The unified People screen (`(app)/settings/users/people-table.tsx`) does NOT
grant a Petty Cash role — it never has.** Its `PersonDialog` has pickers for
ERP, Orders & CRM and Help Slip only. Ticking "Petty Cash" in Settings →
Access, or setting someone's ERP role there, only satisfies "may they open
it" (`system_access.canView`); it does not touch `ld_petty_cash.members`, so
the person defaults to `VIEWER` (or `ADMIN` if they happen to be an ERP admin
with no member row — the bootstrap above) and does not get the "New
transaction" button. The only way to grant OPERATOR/ADMIN is Petty Cash →
Masters → "Who may use it", same as every other module here keeping its own
role table. Real confusion this caused once (Sep 2026): an admin granted "all
system access" through the unified screen and could not see why the person
still had no create button. Considered and declined: adding a Petty Cash
picker to `PersonDialog` — the architecture is deliberate (see the
`system_access` vs `members` split above), and the fix is a documentation gap,
not a missing feature. If this bites again, that picker is where to add it.

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
runs, so the 50 MB this module offers per file could never have worked that
way. The server issues a one-use SIGNED UPLOAD URL per file, the browser PUTs
the bytes straight to Supabase Storage, and the form submits only the paths —
each carrying an HMAC over it, which `verifySignedPath` re-checks so a client
cannot point its entry at a path we never issued. `next.config.ts` caps Server
Action bodies at 4 MB to match the platform, and **Goods Return and Help Slip
were lowered from 10 MB and 8 MB to 4 MB** because they still upload through
the server; the signed-URL pattern in `lib/petty-cash/attachments.ts` is where
they go if that ever bites.

**A transaction can carry up to `ATTACHMENT_MAX_FILES` (5) receipts of ANY
file type, up to `ATTACHMENT_MAX_BYTES` (50 MB) each** (Sep 2026, on the
owner's instruction — the old shape was one JPG/PNG/WEBP/HEIC/PDF up to
10 MB). Files live in `ld_petty_cash.entry_attachments` (`transaction_id`,
`file_path`, `file_name`, `file_size_bytes`, `mime_type`), a real table rather
than a second pair of columns, the same shape Help Slip's
`concern_attachments` already uses. **`transactions.attachment_path` /
`attachment_name` are the OLD shape and are read-only from here on** — kept
so entries saved before this table existed still show their receipt, never
written to by a new save. Editing ANY entry (even one still on the old shape,
even if the set of files does not change) migrates it: `updateTransaction`
always clears the legacy pair and writes the full current set to
`entry_attachments`, so a row is never split across both shapes. The dialog
always submits the FULL desired set — new uploads and previously-existing
files alike — as one whole-set replacement; there is no diff and no
"unchanged" sentinel, because the dialog always knows the current state.
`pathFor` derives the storage extension from the uploaded FILENAME now, not a
fixed MIME→extension table, since any type is accepted; an unrecognised or
missing extension falls back to `.bin`.

**Receipts use a PRIVATE bucket** (`petty-cash-attachments`, size limit and
MIME allow-list updated directly via the Storage API when the 50 MB /
any-type change shipped — `ensureBucket()` now creates-or-updates so it stays
idempotent against future limit changes too) and are proxied through
`/api/petty-cash/entries/[id]/attachment/[attachmentId]`, re-authorised on
every view. `attachmentId` is either a real `entry_attachments.id` — checked
to belong to THIS entry, never trusted from the request — or the literal
string `legacy` for the old single-column shape. Never signed URLs: a signed
URL is a bearer token in a query string that keeps working for anyone holding
it, and these are bills carrying names and amounts. A ledger row or card shows
a receipt COUNT (`📎 3 files`), not a direct link — a table cell can't hold
several hrefs — and opens the entry's own detail panel, where each file gets
its own link. Both that route and `/api/petty-cash/entries/[id]` re-check
`resolvePettyCashViewer()` from scratch — **a route handler runs without the
layout above it**, the same rule the Checklist's CSV export follows. Storage
calls use `SUPABASE_SERVICE_ROLE_KEY` and are confined to
`lib/petty-cash/attachments.ts`.

**"From" is required on the entry form, "What was it for" is optional** (Sep
2026, on the owner's instruction — the reverse of the original spec). Enforced
server-side in `mutations.ts`'s `validate()`, not only in the dialog: a direct
call still gets refused for a blank `fromName`, and a blank `reason` now
saves cleanly instead of being refused.

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

**The calendar itself is a grid above `lg` and a LIST below it** (raised from
`sm` in a later pass — a seven-column grid does not get meaningfully less
cramped between 640px and 1024px, so `sm` left a phone in landscape or a
small tablet with the same illegible grid it was built to avoid; `lg`
matches the breakpoint every other list-to-card conversion in the ERP uses).
At 390px each cell would be 45px and "+ ₹10,000" wraps onto three lines. The
list shows only the days that had activity and opens the same filtered
ledger when tapped.

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

**THE SECOND AUDIT (Sep 2026) — 57 findings, 4 real.** The owner asked for the
reports to be audited again. `.scratch/audit-all.ts` goes at the SHAPE rather
than the figures — empty columns, totals that cannot honestly be added,
sentences carrying a NaN, headers drifted from their definitions, two runs
differing. **Fifty-three of the fifty-seven were thrown out**, and throwing them
out was most of the work:

- **Eight "column is empty in every row"** — checked against the source column
  in the database, one at a time. All eight are empty because nobody has filled
  the field in: `lot_no`, `challan_no`, `custom_reason`, `receiving_notes`,
  `proof_other`, CRM `notes` and `completed_by`. `line-detail`'s Remarks reads
  the LINE's remarks (0 of 6,466 filled), which is a different column from the
  order's. The check stays because this is the exact signature of the fabric
  rename that silently blanked a column — but a blank column is only a defect
  when the source has data.
- **Four "CSV formula guard did not fire" on `-`** — deliberate and documented
  in `csv.ts`: a lone `-` is neither executed nor coerced by Excel, and
  guarding it stopped the file round-tripping.
- **Thirteen "average with no weight"** on day and count columns — a plain mean
  IS the honest average of a per-row quantity. The `avgWeightBy` rule is about
  RATIOS, not about every average.
- **Four "badge map matches nothing"** — exception badges that have not fired
  yet. That is what an exception badge looks like before the exception.

The four that survived:

- **`Lines through` is a RATIO and was averaged unweighted.** A one-line order
  that finished counted as much as a forty-line order that did not, so the foot
  read **33.07%** where finished-over-live is **32.71%**. Now
  `avgWeightBy: "live_lines"`; real Excel computes 32.7% beside the 2,080 and
  6,359 it is made of. Small, and the same class as the "Avg order" mean-of-means
  that read 24% low.
- **Three `Share` columns defaulted to SUM**, so their foot read `100.00%` —
  while their own sibling percent columns in the same reports already declared
  `total: "none"` (agent performance's "From that one") or a weight (party
  analysis's "Cost as % of value"). Inconsistency inside one sheet is the
  evidence it was an oversight rather than a decision. All four are `none` now
  — **four, because the first pass fixed three and missed customer-ledger's**:
  the triage was done off a TRUNCATED terminal dump, and what is not printed is
  not reviewed. Excel prints blank feet for all four and still computes the
  weighted one.

**AND THEN THE SCRIPT WAS TAUGHT WHAT THE HAND-CHECK KNEW.** Leaving 53 known
false positives in it would have made the next audit worthless: somebody runs
it, sees 54 lines, and either re-does an afternoon of verification or stops
believing the script — both worse than no script. So:

- `EMPTY_AT_SOURCE` is a REGISTER, not a silencer: 27 columns each checked
  against its own table and recorded with the count (`crm_followups.contacted_at
  — 0 of 75; no call has been made`). A column that is empty and NOT on the
  list is still HIGH, because that is the fabric-rename signature.
- The `avgWeightBy` check fires on RATIOS only. Thirteen day and count columns
  were flagged and every one was fine.
- The CSV check mirrors `csv.ts` exactly, lone `-` included.
- **The determinism check ignores clock columns.** "Days since move" steps every
  72 minutes, so two runs seconds apart legitimately differ on a few of six
  thousand rows; `verify.ts` only escapes this because its two runs are
  milliseconds apart. Ordering that is not pinned still fails it.

A clean run now says something: **0 to act on, 27 noted.**

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

**A COUNT IS NOT A NAME.** The order register carried `Fabrics: 2` — how many
distinct fabrics an order has — while the Orders screen had been showing
"ASTOR, Platinum." in a column of the same name all along. A reader got a
number and then had to open a second sheet to find out which. The names are
now their own column (`quality_names`, label **Fabrics**, `string_agg(distinct
… order by …)` so two runs produce the same string) and the count sits beside
it as **Fabric count**. Both are filtered `not is_cancelled`, identically, so
they cannot disagree — verified across all 351 orders, zero mismatches.

**ONE SEARCH BOX, EVERY COLUMN IN FRONT OF THE PERSON.** The Orders table
searched four fields — order no, party, challan, lot — so typing a FABRIC found
nothing on a screen whose own table has a Fabrics column. It now also matches
agent, sales person, transport, and (through an EXISTS, never a join, or the
order is multiplied by its lines and every count on the screen inflates) fabric
and design number. Note the search uses `ilike` where the fabric FILTER param
uses `eq`, deliberately: the filter is a dropdown over the real fabric list and
means "exactly this one"; a search box means "contains what I typed".

**AND IT IS LIVE, DEBOUNCED 300ms.** It used to apply only on ENTER, on the
reasoning that a refetch per character is a denial of service. The reasoning
was right and the remedy was wrong — debouncing is what stops the
refetch-per-character; Enter-only stops the SEARCH instead, and somebody typing
a fabric name got an unchanged table and concluded the data was not there.
Measured: 3, 5 and 7 keystrokes each fire exactly ONE request. Enter still
applies immediately, it is simply not required. The Tracking view beside it had
been live all along, which is what made the Orders view read as broken.

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
- **`<Card>` GIVES NO HORIZONTAL PADDING.** It sets `py-(--card-spacing)` and
  nothing else; the left and right padding lives on `CardHeader` and
  `CardContent`. A card written with raw children — `<Card size="sm"
  className="flex flex-col gap-3">` with an `<h2>` and a `<p>` inside — renders
  its text flush against its own border, which is what "the text is touching the
  grid" looked like on the Import screen. Every card on those screens now
  carries `px-(--card-spacing)`: the same token the vertical padding uses, so
  the two match and both follow `size`. Three cards elsewhere had already been
  patched with a hand-written `px-4`, which is the same fix arrived at twice —
  if a fourth turns up, reach for the token.
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
- **`HScroll`'s `className` and `bodyClassName` hide different things, and
  hiding the wrong one leaves a dead scrollbar strip on screen.** `className`
  is the whole component including its own synced scrollbar-above-header
  strip; `bodyClassName` is only the inner scrolling `<div>`. Hiding a table
  on mobile with `hidden lg:block` has to go on `className` — see § List
  screens → "Below `lg`, a wide table becomes a card list" in `DESIGN.md` for
  the full pattern, applied across every list screen in the ERP (Sep 2026).

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
