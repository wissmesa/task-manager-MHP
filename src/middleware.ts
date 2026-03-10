import { auth } from "@/lib/auth";
import { NextResponse } from "next/server";

export default auth((req) => {
  const isLoggedIn = !!req.auth;
  const isOnLogin = req.nextUrl.pathname === "/login";

  if (isOnLogin && isLoggedIn) {
    return NextResponse.redirect(new URL("/tasks", req.url));
  }

  if (!isLoggedIn && !isOnLogin) {
    const sharedAuth = req.cookies.get("shared_auth")?.value;
    if (sharedAuth) {
      const ssoUrl = new URL("/api/auth/sso", req.url);
      return NextResponse.redirect(ssoUrl);
    }
    return NextResponse.redirect(new URL("/login", req.url));
  }

  return NextResponse.next();
});

export const config = {
  matcher: ["/((?!api|_next/static|_next/image|favicon.ico|uploads).*)"],
};
