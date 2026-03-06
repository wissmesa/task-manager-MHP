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

export function buildS3Key(taskId: string, filename: string) {
  return `${getEnv()}/task-images/${taskId}/${filename}`;
}

export async function uploadToS3(
  key: string,
  body: Buffer,
  contentType: string
) {
  await getS3().send(
    new PutObjectCommand({
      Bucket: getBucket(),
      Key: key,
      Body: body,
      ContentType: contentType,
    })
  );
}

export async function getSignedImageUrl(key: string) {
  const command = new GetObjectCommand({
    Bucket: getBucket(),
    Key: key,
  });
  return getSignedUrl(getS3(), command, { expiresIn: 3600 });
}
