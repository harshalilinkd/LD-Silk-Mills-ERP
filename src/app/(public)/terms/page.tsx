import type { Metadata } from "next";
import { LegalShell, Section } from "../legal-shell";

export const metadata: Metadata = {
  title: "Terms — LD Silk Mills ERP",
  description:
    "Terms of use for LD Silk Mills ERP, an internal tool for LD Silk Mills staff.",
};

/**
 * NOT required by Google — the console's own message lists app name, support
 * email, homepage URL and privacy policy URL, and stops there. This exists
 * because the footer links to it and a legal page linking to a 404 is worse
 * than no link, and because the console offers the field if you want it.
 */
export default function TermsPage() {
  return (
    <LegalShell title="Terms of use" updated="4 September 2026">
      <p>
        LD Silk Mills ERP is private software operated by LD Silk Mills for its
        own staff. It is not offered to the public and there is no way to
        register yourself for an account.
      </p>

      <Section heading="Who may use it">
        <p>
          Only people to whom LD Silk Mills has issued an account. Access is
          granted, changed and withdrawn by an administrator at the
          company&apos;s discretion. Signing in with a Google account that has
          not been added to the system gives you nothing — you are shown a
          &ldquo;not registered&rdquo; page and no data.
        </p>
      </Section>

      <Section heading="Your account">
        <p>
          Keep your sign-in to yourself. Do not share your password or leave a
          session open on a shared device. Tell an administrator immediately if
          you think someone else has used your account.
        </p>
      </Section>

      <Section heading="Acceptable use">
        <p>
          Use the system for LD Silk Mills business only. Do not copy, export or
          pass on company or customer information except as your work requires.
          Information marked confidential — including concerns raised in
          confidence through Help Slip — must be treated as such.
        </p>
      </Section>

      <Section heading="The information in here">
        <p>
          Records belong to LD Silk Mills. Enter information accurately: orders,
          stages and concerns recorded here drive real production and real
          decisions, and a wrong entry has consequences beyond the screen.
        </p>
      </Section>

      <Section heading="Availability">
        <p>
          The system is provided as it is, for internal use. It may be
          unavailable for maintenance or for reasons outside the company&apos;s
          control, and features may change as the business changes.
        </p>
      </Section>

      <Section heading="Contact">
        <p>
          Questions:{" "}
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
