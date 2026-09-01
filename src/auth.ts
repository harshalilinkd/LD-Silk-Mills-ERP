import NextAuth from "next-auth";
import Google from "next-auth/providers/google";
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
  providers: [Google],
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
