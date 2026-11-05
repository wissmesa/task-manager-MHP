import { S3Client, PutObjectCommand, GetObjectCommand } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";

let _s3: S3Client | null = null;

function getS3() {
  if (!_s3) {
    _s3 = new S3Client({
      region: process.env.AWS_REGION!,
      credentials: {
        accessKeyId: process.env.AWS_ACCESS_KEY_ID!,
        secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY!,
      },
    });
  }
  return _s3;
}

function getBucket() {
  return process.env.AWS_S3_BUCKET_NAME!;
}

function getEnv() {
  return process.env.envionment || "development";
}

/**
 * Key for images uploaded directly from the browser (task, recurring task and
 * responsibility instructions, and comments). These are uploaded before the
 * parent row exists, so the key is not tied to a specific parent id.
 */
export function buildUploadImageKey(filename: string) {
  return `${getEnv()}/uploads/${filename}`;
}

/** True when the key was issued by buildUploadImageKey for this environment. */
export function isUploadImageKey(key: string) {
  return key.startsWith(`${getEnv()}/uploads/`) && !key.includes("..");
}

export async function getSignedImageUrl(key: string) {
  const command = new GetObjectCommand({
    Bucket: getBucket(),
    Key: key,
  });
  return getSignedUrl(getS3(), command, { expiresIn: 3600 });
}

/**
 * Presigned PUT URL so the browser can upload straight to S3, bypassing the
 * ~4.5 MB request body limit of our serverless functions. The client must send
 * the same Content-Type header it was signed with.
 */
export async function getSignedUploadUrl(key: string, contentType: string) {
  const command = new PutObjectCommand({
    Bucket: getBucket(),
    Key: key,
    ContentType: contentType,
  });
  return getSignedUrl(getS3(), command, { expiresIn: 300 });
}
