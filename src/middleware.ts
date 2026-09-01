import NextAuth from "next-auth";
import { NextResponse } from "next/server";
import { authConfig } from "@/auth.config";

// Edge-safe auth instance built only from the DB-free authConfig — do not
// import from "@/auth" here, it pulls in postgres.js, which needs Node.js
// APIs middleware's Edge runtime doesn't have.
const { auth } = NextAuth(authConfig);

const PUBLIC_PATHS = ["/login", "/not-registered"];

export default auth((req) => {
  const { nextUrl } = req;
  const isPublic =
    PUBLIC_PATHS.includes(nextUrl.pathname) ||
    nextUrl.pathname.startsWith("/api/auth");

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
