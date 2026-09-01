# LD Silk Mills ERP — Shell

Phase 1: the entrance hall for the LD Silk Mills ERP — login, sidebar,
topbar, dashboard, and the system registry that drives every future
module. This repo only builds the shell; Order Entry, Help Slip, and
future modules keep their own independent codebases and are wired in
during later phases.

## Stack

Next.js 15 (App Router) + TypeScript, Postgres via Drizzle ORM
(`postgres.js` driver), Auth.js v5 with Google OAuth only, Tailwind CSS
v4 + shadcn/ui (Base UI).

## Database

`ld_erp_core` is a **schema inside the same Supabase project** Order
Entry and Help Slip already share ("LD Silk Mills", project ref
`ygxnbmfmrwookrilpbfx`) — matching how every other module is organized
(each module = one Postgres schema, one shared project). It holds
ERP-level data only (`users`, `systems`, `system_access`, `audit_logs`)
and never touches `ld_order_entry` or `ld_help_slip`'s tables. The
schema and seed data already exist there, applied directly via Supabase
migration tooling — you don't need to create anything to see the data;
you only need a connection string for the *app* to query it locally.

Schema source lives in `src/db/schema.ts`, migrations in
`drizzle/migrations/`. To change the schema: edit `schema.ts`, run
`npm run db:generate` to produce a new migration file, then apply that
file's SQL to the Supabase project (via `npm run db:migrate` once you
have a working `DATABASE_URL`, or by pasting it into a Supabase
migration/SQL editor).

## Local setup

```bash
npm install
# Fill in DATABASE_URL in .env.local first — see below.
npm run dev
```

## Required human setup before this is demoable

1. **Database password.** `.env.local` has a `DATABASE_URL` with a
   `TODO_DB_PASSWORD` placeholder — Supabase's tools don't expose the raw
   Postgres password to this session, so it couldn't be filled in
   automatically. Get it from Supabase Dashboard → LD Silk Mills project
   → Project Settings → Database → Connection string → **Transaction
   pooler** (port 6543 — same pooler Order Entry uses). Paste the real
   password into the placeholder.

2. **Google OAuth credentials.** Create an OAuth 2.0 Client ID (Web
   application) in Google Cloud Console and put the values in
   `.env.local`:
   - `AUTH_GOOGLE_ID`
   - `AUTH_GOOGLE_SECRET`

   Register these authorized redirect URIs on that OAuth client:
   - `http://localhost:3000/api/auth/callback/google` (local dev)
   - `https://<your-vercel-domain>/api/auth/callback/google` (once deployed)
   - `https://erp.ldsilkmills.com/api/auth/callback/google` (once DNS is
     attached — not done in this phase)

3. **Real Order Entry / Help Slip URLs.** Seeded `systems.application_url`
   values are placeholders (`https://ld-order-entry.vercel.app`,
   `https://ld-help-slip.vercel.app`) because the Phase 0 audit couldn't
   confirm either app's real production Vercel URL. Update them from
   `/admin/system-registry` once the app is running, before treating
   this as live.

4. **Naushi Tibrewala's ERP login email.** Seeded as
   `naushi.linkdprints@gmail.com`. She also holds `naushi500@gmail.com`
   in Order Entry (both kept there, untouched). Confirm which is her
   intended ERP sign-in identity.

## Why the DB client isn't the Supabase JS SDK

Like Order Entry, this app connects with a plain Postgres client
(`postgres.js` + Drizzle), not `@supabase/supabase-js` — `ld_erp_core` is
a normal Postgres schema, not exposed through Supabase's PostgREST Data
API, so there's no REST layer to call through. This also matters for
**Next.js Edge middleware**: `postgres.js` needs real Node.js APIs (TCP
sockets, `fs`, `os`) that don't exist in the Edge runtime, so the DB
client must never be imported by anything middleware.ts pulls in.
`src/auth.config.ts` (DB-free) vs `src/auth.ts` (DB-touching callbacks)
is that split — middleware.ts only ever imports `auth.config.ts`.

## What's deliberately NOT in this phase

- No reverse proxy / rewrites / `basePath` changes to any other repo — no
  integration work at all. Order Entry and Help Slip sidebar entries are
  plain external links that open in a new tab.
- No code in this app reads or writes `ld_order_entry` or `ld_help_slip`
  — only its own `ld_erp_core` schema, enforced by
  `drizzle.config.ts`'s `schemaFilter`.
- Auth works end-to-end but isn't hardened — session expiry, concurrent
  sessions, and logout edge cases are Phase 2's job.
- No fake numbers anywhere. Every dashboard card without a real data
  source shows an explicit empty state.
