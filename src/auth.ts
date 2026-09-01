import NextAuth from "next-auth";
import Google from "next-auth/providers/google";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { users } from "@/db/schema";

export const { handlers, auth, signIn, signOut } = NextAuth({
  trustHost: true,
  providers: [Google],
  session: { strategy: "jwt" },
  pages: {
    signIn: "/login",
  },
  callbacks: {
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
    async session({ session, token }) {
      if (token.userId && session.user) {
        session.user.id = token.userId as string;
      }
      return session;
    },
  },
});
