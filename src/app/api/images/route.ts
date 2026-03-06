import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { getSignedImageUrl } from "@/lib/s3";

export async function GET(req: NextRequest) {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const key = req.nextUrl.searchParams.get("key");
  if (!key) {
    return NextResponse.json({ error: "Missing key parameter" }, { status: 400 });
  }

  const url = await getSignedImageUrl(key);
  return NextResponse.json({ url });
}
