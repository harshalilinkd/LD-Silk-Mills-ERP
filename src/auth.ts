import NextAuth from "next-auth";
import Google from "next-auth/providers/google";
import Credentials from "next-auth/providers/credentials";
import { compare } from "bcryptjs";
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
    /**
     * Email + password, per user.
     *
     * This REPLACES a temporary provider that checked one shared password from
     * `DEV_LOGIN_PASSWORD` against any known email. That was a stopgap while
     * Google credentials were unavailable and it is gone: the env var is no
     * longer read anywhere, so copying it to a host does nothing.
     *
     * ── WHAT THIS DELIBERATELY DOES NOT DO ────────────────────────────────
     *
     * It never says WHICH half was wrong. An unknown email, a known email with
     * no password set, a wrong password and a deactivated account all return
     * the same `null` and the same sentence on screen. Distinguishing them
     * turns the login form into a tool for discovering who works here.
     *
     * For the same reason the bcrypt comparison runs even when there is no
     * stored hash — against a dummy hash of the same cost. Returning early on
     * "no password set" makes that case measurably faster than a wrong
     * password, and the difference is enough to enumerate accounts with a
     * stopwatch.
     *
     * `passwordHash` is selected explicitly here and nowhere else in the app.
     * It is never returned from an action, never sent to a page, never logged.
     */
    Credentials({
      id: "password",
      name: "Email and password",
      credentials: {
        email: { label: "Email", type: "email" },
        password: { label: "Password", type: "password" },
      },
      async authorize(credentials) {
        const email = (credentials?.email as string | undefined)
          ?.trim()
          .toLowerCase();
        const password = credentials?.password as string | undefined;
        if (!email || !password) return null;

        const [dbUser] = await db
          .select({
            id: users.id,
            name: users.name,
            email: users.email,
            avatar: users.avatar,
            status: users.status,
            passwordHash: users.passwordHash,
          })
          .from(users)
          .where(eq(users.email, email))
          .limit(1);

        // A bcrypt hash of a value nobody knows, at the same cost as a real
        // one. Comparing against this when the account does not exist or has
        // no password keeps every failure the same shape AND the same duration.
        const DUMMY =
          "$2a$10$N9qo8uLOickgx2ZMRZoMyeIjZAgcfl7p92ldGxad68LJZdL17lhWy";

        const ok = await compare(password, dbUser?.passwordHash ?? DUMMY);

        if (!dbUser || !dbUser.passwordHash) return null;
        if (!ok) return null;
        // Status is checked here as well as in the `signIn` callback below,
        // because a deactivated account must not be distinguishable from a
        // wrong password by anything the caller can observe.
        if (dbUser.status !== "active") return null;

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
        // Explicit columns. `select()` pulled `password_hash` into memory on
        // every token refresh for the three fields below — harmless while only
        // these three are copied out, and one careless spread from not being.
        const [dbUser] = await db
          .select({ id: users.id, name: users.name, avatar: users.avatar })
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
