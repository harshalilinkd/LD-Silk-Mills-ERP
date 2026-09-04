import NextAuth from "next-auth";
import { NextResponse } from "next/server";
import { authConfig } from "@/auth.config";

// Edge-safe auth instance built only from the DB-free authConfig — do not
// import from "@/auth" here, it pulls in postgres.js, which needs Node.js
// APIs middleware's Edge runtime doesn't have.
const { auth } = NextAuth(authConfig);

// `/privacy` and `/terms` MUST stay reachable without a session. Google will
// not move an OAuth app out of "Testing" without a public privacy policy URL,
// and it fetches that URL itself — behind this gate it would receive a 307 to
// /login and reject the app. The same goes for a person deciding whether to
// sign in at all: a policy you can only read after agreeing to it is not a
// policy.
const PUBLIC_PATHS = ["/login", "/not-registered", "/privacy", "/terms"];

export default auth((req) => {
  const { nextUrl } = req;
  const isPublic =
    PUBLIC_PATHS.includes(nextUrl.pathname) ||
    nextUrl.pathname.startsWith("/api/auth") ||
    // The machine-to-machine order feed. It authenticates on its own with a
    // static `x-api-key` (see src/app/api/export/orders/route.ts) and has no
    // session — left in this gate it would 307 SCOT and the Embroidery System
    // to /login and hand them HTML where they expect JSON.
    nextUrl.pathname.startsWith("/api/export");

  if (isPublic) return;

  if (!req.auth) {
    const loginUrl = new URL("/login", nextUrl);
    loginUrl.searchParams.set("callbackUrl", nextUrl.pathname);
    return NextResponse.redirect(loginUrl);
  }
});

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};
