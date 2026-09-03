import NextAuth from "next-auth";
import Google from "next-auth/providers/google";
import Credentials from "next-auth/providers/credentials";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { users } from "@/db/schema";
import { authConfig } from "./auth.config";

// Full auth config, including DB-touching callbacks — runs on the Node.js
// runtime (server components, server actions, the /api/auth route
// handler), never on Edge. Only middleware.ts uses the DB-free
// `authConfig` directly.
export const { handlers, auth, signIn, signOut } = NextAuth({
  ...authConfig,
  trustHost: true,
  providers: [
    Google,
    // TEMPORARY dev-only login, added because Google OAuth credentials
    // weren't available yet to unblock local testing. There is no
    // password column on ld_erp_core.users — this checks a single
    // shared password (DEV_LOGIN_PASSWORD env var), not a per-user one.
    // Remove this provider before Phase 2 (auth hardening) / before any
    // real deployment. Locked spec for Phase 1 was Google-only.
    Credentials({
      id: "dev-password",
      name: "Dev password (temporary)",
      credentials: {
        email: { label: "Email", type: "email" },
        password: { label: "Password", type: "password" },
      },
      async authorize(credentials) {
        // REFUSES IN PRODUCTION, unconditionally and before anything else.
        //
        // The login page already hides this form when DEV_LOGIN_PASSWORD is
        // unset, and the deploy instructions say not to copy that variable —
        // but "we told somebody not to paste it" is not a control. One shared
        // password that every ERP account answers to, on a public address, is
        // the worst failure this app could have, and it would be caused by a
        // single careless copy of an env var list.
        //
        // So the door does not exist off localhost. If Google sign-in ever
        // fails in production the fix is to fix Google, not to reopen this.
        if (process.env.NODE_ENV === "production") return null;

        const email = credentials?.email as string | undefined;
        const password = credentials?.password as string | undefined;
        const devPassword = process.env.DEV_LOGIN_PASSWORD;

        if (!email || !password || !devPassword) return null;
        if (password !== devPassword) return null;

        const [dbUser] = await db
          .select()
          .from(users)
          .where(eq(users.email, email))
          .limit(1);

        if (!dbUser) return null;

        return {
          id: dbUser.id,
          name: dbUser.name,
          email: dbUser.email,
          image: dbUser.avatar ?? undefined,
        };
      },
    }),
  ],
  callbacks: {
    ...authConfig.callbacks,
    async signIn({ user }) {
      if (!user.email) return false;

      const [existing] = await db
        .select({ id: users.id, status: users.status })
        .from(users)
        .where(eq(users.email, user.email))
        .limit(1);

      // Unknown email: do NOT auto-provision. Send them to a clear
      // "not set up yet" screen instead of a silent failure.
      if (!existing) {
        return "/not-registered";
      }

      if (existing.status !== "active") {
        return "/not-registered";
      }

      return true;
    },
    async jwt({ token, user }) {
      if (user?.email) {
        const [dbUser] = await db
          .select()
          .from(users)
          .where(eq(users.email, user.email))
          .limit(1);
        if (dbUser) {
          token.userId = dbUser.id;
          token.name = dbUser.name;
          token.picture = dbUser.avatar ?? user.image ?? undefined;
        }
      }
      return token;
    },
  },
});
