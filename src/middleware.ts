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
  /**
   * The app-icon files are excluded ALONGSIDE favicon.ico, and leaving them out
   * was a real bug rather than tidiness: `icon.svg` and `apple-icon.png` are
   * ordinary routes as far as this matcher is concerned, so a signed-OUT
   * browser asking for the tab icon got a 307 to /login and a page of HTML
   * where it expected an image. The result was no icon on the login screen —
   * the one screen everybody sees before they have a session.
   *
   * Add any future Next metadata file here too (`opengraph-image`,
   * `twitter-image`, `manifest.webmanifest`); they are all generated as routes
   * and all fetched without a session.
   */
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|icon.svg|apple-icon.png).*)",
  ],
};
