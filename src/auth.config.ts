import type { NextAuthConfig } from "next-auth";

/**
 * Edge-safe auth config — no DB import allowed here. This is the only
 * part of the auth setup that middleware.ts (which runs on the Edge
 * runtime) is allowed to pull in. `postgres.js` (used by src/db/index.ts)
 * needs real Node.js APIs (TCP sockets, `fs`, `os`) that don't exist on
 * Edge, so anything that touches `db` must stay out of this file and out
 * of middleware — same split Order Entry uses (auth.config.ts vs
 * auth.ts), confirmed in the Phase 0 audit.
 */
export const authConfig = {
  pages: {
    signIn: "/login",
  },
  session: { strategy: "jwt" },
  providers: [],
  callbacks: {
    async session({ session, token }) {
      if (token.userId && session.user) {
        session.user.id = token.userId as string;
      }
      return session;
    },
  },
} satisfies NextAuthConfig;
