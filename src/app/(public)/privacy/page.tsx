import type { Metadata } from "next";
import { LegalShell, Section } from "../legal-shell";

export const metadata: Metadata = {
  title: "Privacy — LD Silk Mills ERP",
  description:
    "What LD Silk Mills ERP collects, why, and who can see it. An internal staff tool, not a public service.",
};

/**
 * Written to describe what the application ACTUALLY does, checked against the
 * code and the database rather than copied from a template:
 *
 *  · `ld_erp_core.users` holds name, email, avatar, status, role, and a bcrypt
 *    password hash for anyone who set one.
 *  · Google is used only to establish identity — the provider requests
 *    `openid email profile` and nothing else (no custom `scope` is set on the
 *    Google provider in src/auth.ts).
 *  · Data lives in one Supabase Postgres project in ap-south-1 (Mumbai).
 *  · Help Slip photographs sit in a PRIVATE bucket and are proxied through an
 *    authorising route, never a shareable link.
 *
 * If any of that changes, this page has to change with it. A privacy policy
 * that describes an older version of the software is worse than none.
 */
export default function PrivacyPage() {
  return (
    <LegalShell title="Privacy" updated="4 September 2026">
      <p>
        LD Silk Mills ERP is an internal tool for LD Silk Mills staff. It is not
        a public service and there is no way to create an account yourself — an
        administrator adds you, or you cannot get in. This page explains what
        the system holds about you and why.
      </p>

      <Section heading="What we collect about you">
        <p>When you sign in with Google, we receive and store three things:</p>
        <ul className="ml-5 list-disc space-y-1">
          <li>your name</li>
          <li>your email address</li>
          <li>your Google profile picture</li>
        </ul>
        <p>
          That is the entirety of what Google shares with us. We ask Google for
          nothing else — no access to your Gmail, Drive, Calendar, contacts or
          any other Google service, and we could not read them if we wanted to.
        </p>
        <p>
          If an administrator gives you a password instead, we store a one-way
          scrambled version of it (a bcrypt hash). The password itself is never
          written down anywhere, and nobody — including an administrator — can
          read it back.
        </p>
      </Section>

      <Section heading="What the system records as you work">
        <p>
          Ordinary business records: orders, customers, deliveries, production
          stages, customer-relationship notes, and concerns raised through Help
          Slip along with any photographs attached to them. Your name is
          attached to entries you create or change, so colleagues can see who
          did what.
        </p>
      </Section>

      <Section heading="Who can see it">
        <p>
          Only LD Silk Mills staff with an account, and only the parts their
          role allows. Confidential concerns raised through Help Slip are
          restricted further and are visible only to the people authorised to
          handle them — that restriction is enforced by the database itself, not
          by hiding buttons on a screen.
        </p>
        <p>
          Photographs attached to a concern are held in private storage. Every
          time one is viewed, permission is checked again; there is no shareable
          link that keeps working if it is forwarded.
        </p>
      </Section>

      <Section heading="Where it is kept">
        <p>
          In a single managed PostgreSQL database hosted by Supabase in the
          Mumbai (ap-south-1) region, and served by Vercel from the same region.
          Data is encrypted in transit and at rest by those providers.
        </p>
      </Section>

      <Section heading="What we never do">
        <ul className="ml-5 list-disc space-y-1">
          <li>Sell or rent your information to anyone.</li>
          <li>Use it for advertising, or share it with advertisers.</li>
          <li>
            Send it to any third party beyond the hosting providers above.
          </li>
          <li>Track you anywhere outside this application.</li>
        </ul>
      </Section>

      <Section heading="How long it is kept">
        <p>
          Business records are kept for as long as the company needs them for
          its operations and to meet its legal obligations. If you leave, your
          account is deactivated so you can no longer sign in; entries you made
          remain in the business records, because removing them would leave gaps
          in the order and production history.
        </p>
      </Section>

      <Section heading="Your choices">
        <p>
          You can ask what is held about you, ask for a correction, or ask for
          your account to be closed, by writing to the address below. You can
          also disconnect this application from your Google account at any time
          through your Google account settings, which stops you signing in with
          Google — an administrator can give you a password instead.
        </p>
      </Section>

      <Section heading="Cookies">
        <p>
          One cookie, which keeps you signed in. There are no analytics,
          advertising or tracking cookies of any kind.
        </p>
      </Section>

      <Section heading="Contact">
        <p>
          Questions about anything on this page:{" "}
          <a
            className="text-accent-text underline underline-offset-2"
            href="mailto:mastersystem@linkdprints.com"
          >
            mastersystem@linkdprints.com
          </a>
        </p>
      </Section>
    </LegalShell>
  );
}
