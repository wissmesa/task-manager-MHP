/**
 * Client helper: uploads images for task/recurring-task instructions and
 * comments via the /api/recurring-upload route and returns their stored S3
 * keys. The keys are then passed to the relevant server action to persist them.
 */
export async function uploadImages(
  files: File[]
): Promise<{ s3Key: string; originalName: string }[]> {
  if (files.length === 0) return [];

  const formData = new FormData();
  files.forEach((f) => formData.append("files", f));

  const res = await fetch("/api/recurring-upload", {
    method: "POST",
    body: formData,
  });

  if (!res.ok) {
    const data = await res.json().catch(() => ({}));
    throw new Error(data.error || "Failed to upload images");
  }

  const data = (await res.json()) as {
    images: { s3Key: string; originalName: string }[];
  };
  return data.images;
}
