import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import jwt from "jsonwebtoken";
import { signIn } from "@/lib/auth";

export async function GET(req: Request) {
  const cookieStore = await cookies();
  const sharedAuth = cookieStore.get("shared_auth")?.value;

  if (!sharedAuth) {
    return NextResponse.redirect(new URL("/login", req.url));
  }

  if (!process.env.JWT_SECRET) {
    return NextResponse.redirect(new URL("/login", req.url));
  }

  try {
    const decoded = jwt.verify(sharedAuth, process.env.JWT_SECRET) as {
      userId: string;
      email: string;
    };

    if (!decoded.userId || !decoded.email) {
      return NextResponse.redirect(new URL("/login", req.url));
    }

    await signIn("credentials", {
      email: decoded.email,
      password: sharedAuth,
      redirect: false,
    });

    return NextResponse.redirect(new URL("/tasks", req.url));
  } catch {
    return NextResponse.redirect(new URL("/login", req.url));
  }
}
