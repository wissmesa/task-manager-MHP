import { compressImage, readUploadError } from "@/lib/compress-image";

/**
 * Client helper: uploads images for task/recurring-task instructions and
 * comments straight from the browser to S3 and returns their stored S3 keys.
 * /api/upload-urls only hands out presigned URLs, so the image bytes never go
 * through our serverless functions (and their ~4.5 MB body limit). The keys are
 * then passed to the relevant route or server action to persist them.
 */
export async function uploadImages(
  files: File[]
): Promise<{ s3Key: string; originalName: string }[]> {
  if (files.length === 0) return [];

  const compressed = await Promise.all(files.map(compressImage));

  const res = await fetch("/api/upload-urls", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      files: compressed.map((f) => ({ name: f.name, type: f.type, size: f.size })),
    }),
  });

  if (!res.ok) {
    throw new Error(await readUploadError(res, "Failed to upload images"));
  }

  const { uploads } = (await res.json()) as {
    uploads: { uploadUrl: string; s3Key: string; originalName: string }[];
  };

  await Promise.all(
    uploads.map(async (upload, i) => {
      const putRes = await fetch(upload.uploadUrl, {
        method: "PUT",
        headers: { "Content-Type": compressed[i].type },
        body: compressed[i],
      }).catch(() => null); // network/CORS errors reject instead of returning a response
      if (!putRes?.ok) {
        throw new Error("Failed to upload images");
      }
    })
  );

  return uploads.map(({ s3Key, originalName }) => ({ s3Key, originalName }));
}
