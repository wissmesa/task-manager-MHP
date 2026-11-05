/**
 * Client helper: shrinks large images (e.g. retina screenshots) before upload.
 * Vercel rejects request bodies over ~4.5 MB with a non-JSON 413, so a couple
 * of full-size PNG screenshots in one request were enough to break uploads.
 * Images are scaled down to MAX_DIMENSION and re-encoded as JPEG; small images
 * and formats we can't safely re-encode (GIF, SVG) are returned untouched.
 */
const MAX_DIMENSION = 1920;
const SKIP_BELOW_BYTES = 400 * 1024;
const JPEG_QUALITY = 0.75;

export async function compressImage(file: File): Promise<File> {
  if (!file.type.startsWith("image/")) return file;
  if (file.type === "image/gif" || file.type === "image/svg+xml") return file;

  let bitmap: ImageBitmap;
  try {
    bitmap = await createImageBitmap(file);
  } catch {
    return file;
  }

  const scale = Math.min(1, MAX_DIMENSION / Math.max(bitmap.width, bitmap.height));
  if (scale === 1 && file.size <= SKIP_BELOW_BYTES) {
    bitmap.close();
    return file;
  }

  const width = Math.round(bitmap.width * scale);
  const height = Math.round(bitmap.height * scale);
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext("2d");
  if (!ctx) {
    bitmap.close();
    return file;
  }

  // JPEG has no alpha channel; paint white so transparent areas don't turn black.
  ctx.fillStyle = "#ffffff";
  ctx.fillRect(0, 0, width, height);
  ctx.drawImage(bitmap, 0, 0, width, height);
  bitmap.close();

  const blob = await new Promise<Blob | null>((resolve) =>
    canvas.toBlob(resolve, "image/jpeg", JPEG_QUALITY)
  );
  if (!blob || blob.size >= file.size) return file;

  const baseName = file.name.replace(/\.[^.]+$/, "") || "image";
  return new File([blob], `${baseName}.jpg`, { type: "image/jpeg" });
}

/**
 * Reads an error message from a failed upload response, which may not be JSON
 * (e.g. Vercel's plain-text 413 when the body is too large).
 */
export async function readUploadError(res: Response, fallback: string) {
  if (res.status === 413) {
    return "The images are too large to upload. Try fewer or smaller images.";
  }
  const data = await res.json().catch(() => ({}));
  return (data as { error?: string }).error || fallback;
}
