import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { randomUUID } from "crypto";
import path from "path";
import { buildUploadImageKey, getSignedUploadUrl } from "@/lib/s3";

const MAX_FILES = 10;
const MAX_FILE_SIZE = 25 * 1024 * 1024; // 25 MB

/**
 * Returns presigned S3 PUT URLs for images the browser is about to upload.
 * The files themselves never pass through this function, so their size is not
 * limited by the serverless request body limit. It does NOT write to the
 * database: the caller passes the returned keys to the relevant route/server
 * action which persists them.
 */
export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = (await req.json().catch(() => null)) as {
    files?: { name?: unknown; type?: unknown; size?: unknown }[];
  } | null;
  const files = Array.isArray(body?.files) ? body.files : [];

  if (files.length === 0) {
    return NextResponse.json({ uploads: [] });
  }

  if (files.length > MAX_FILES) {
    return NextResponse.json(
      { error: `You can upload up to ${MAX_FILES} images at a time.` },
      { status: 400 }
    );
  }

  const uploads: { uploadUrl: string; s3Key: string; originalName: string }[] = [];

  for (const file of files) {
    const name = typeof file.name === "string" ? file.name : "image";
    const type = typeof file.type === "string" ? file.type : "";
    const size = typeof file.size === "number" ? file.size : 0;

    if (!type.startsWith("image/")) {
      return NextResponse.json(
        { error: "Only image files are allowed." },
        { status: 400 }
      );
    }
    if (size > MAX_FILE_SIZE) {
      return NextResponse.json(
        { error: "Each image must be 25 MB or smaller." },
        { status: 400 }
      );
    }

    const ext = path.extname(name).replace(/[^.a-zA-Z0-9]/g, "") || ".png";
    const s3Key = buildUploadImageKey(`${randomUUID()}${ext}`);
    const uploadUrl = await getSignedUploadUrl(s3Key, type);

    uploads.push({ uploadUrl, s3Key, originalName: name });
  }

  return NextResponse.json({ uploads });
}
