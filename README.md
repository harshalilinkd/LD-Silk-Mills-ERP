# LD Silk Mills ERP — Shell

Phase 1: the entrance hall for the LD Silk Mills ERP — login, sidebar,
topbar, dashboard, and the system registry that drives every future
module. This repo only builds the shell; Order Entry, Help Slip, and
future modules keep their own independent codebases and databases and are
wired in during later phases.

## Stack

Next.js 15 (App Router) + TypeScript, Neon Postgres (`ld-erp-core` project)
via Drizzle ORM, Auth.js v5 with Google OAuth only, Tailwind CSS v4 +
shadcn/ui (Base UI).

## Local setup

```bash
npm install
npm run db:migrate   # applies drizzle/migrations to the Neon database
npm run db:seed      # seeds the 8 systems + 11 users from the Phase 0 audit
npm run dev
```

## Required human setup before this is demoable

1. **Google OAuth credentials.** Create an OAuth 2.0 Client ID (Web
   application) in Google Cloud Console and put the values in
   `.env.local`:
   - `AUTH_GOOGLE_ID`
   - `AUTH_GOOGLE_SECRET`

   Register these authorized redirect URIs on that OAuth client:
   - `http://localhost:3000/api/auth/callback/google` (local dev)
   - `https://<your-vercel-domain>/api/auth/callback/google` (once deployed)
   - `https://erp.ldsilkmills.com/api/auth/callback/google` (once DNS is
     attached — not done in this phase)

2. **Real Order Entry / Help Slip URLs.** `src/db/seed.ts` seeds
   `systems.application_url` with placeholder values
   (`TODO_ORDER_ENTRY_URL`, `TODO_HELP_SLIP_URL`) because the Phase 0
   audit could not confirm either app's real production Vercel URL (no
   Vercel dashboard access in that session). Update those two constants
   with the real URLs — or just edit the rows directly from
   `/admin/system-registry` once the app is running — before treating
   this as live.

3. **Naushi Tibrewala's ERP login email.** Seeded as
   `naushi.linkdprints@gmail.com`. She also holds `naushi500@gmail.com`
   in Order Entry (both kept there, untouched). Confirm which is her
   intended ERP sign-in identity — see the comment in `src/db/seed.ts`.

## What's deliberately NOT in this phase

- No reverse proxy / rewrites / `basePath` changes to any other repo — no
  integration work at all. Order Entry and Help Slip sidebar entries are
  plain external links that open in a new tab.
- No connection to the Supabase project Order Entry and Help Slip share.
  This shell has its own, separate Neon database holding only
  ERP-level data (`users`, `systems`, `system_access`, `audit_logs`) —
  never business records from either app.
- Auth works end-to-end but isn't hardened — session expiry, concurrent
  sessions, and logout edge cases are Phase 2's job.
- No fake numbers anywhere. Every dashboard card without a real data
  source shows an explicit empty state.

## Database

Schema lives in `src/db/schema.ts`, migrations in `drizzle/migrations/`.
To change the schema: edit `schema.ts`, then `npm run db:generate` to
produce a new migration, then `npm run db:migrate` to apply it.
