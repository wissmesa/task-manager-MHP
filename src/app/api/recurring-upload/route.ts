import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { randomUUID } from "crypto";
import path from "path";
import { buildRecurringImageKey, uploadToS3 } from "@/lib/s3";

const MAX_FILES = 10;
const MAX_FILE_SIZE = 10 * 1024 * 1024; // 10 MB

/**
 * Uploads images for recurring task instructions/comments to S3 and returns
 * their keys. It does NOT write to the database: the caller passes the returned
 * keys to the relevant server action (createRecurringTask, updateRecurringTask,
 * addRecurringTaskComment) which persists them.
 */
export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const formData = await req.formData();
  const files = formData.getAll("files") as File[];

  if (files.length === 0) {
    return NextResponse.json({ images: [] });
  }

  if (files.length > MAX_FILES) {
    return NextResponse.json(
      { error: `You can upload up to ${MAX_FILES} images at a time.` },
      { status: 400 }
    );
  }

  const images: { s3Key: string; originalName: string }[] = [];

  for (const file of files) {
    if (!file.type.startsWith("image/")) {
      return NextResponse.json(
        { error: "Only image files are allowed." },
        { status: 400 }
      );
    }
    if (file.size > MAX_FILE_SIZE) {
      return NextResponse.json(
        { error: "Each image must be 10 MB or smaller." },
        { status: 400 }
      );
    }

    const bytes = await file.arrayBuffer();
    const buffer = Buffer.from(bytes);

    const ext = path.extname(file.name) || ".png";
    const filename = `${randomUUID()}${ext}`;
    const s3Key = buildRecurringImageKey(filename);

    await uploadToS3(s3Key, buffer, file.type || "image/png");

    images.push({ s3Key, originalName: file.name });
  }

  return NextResponse.json({ images });
}
