import { S3Client } from "@aws-sdk/client-s3";

// R2 is S3-compatible, so the standard AWS S3 SDK works against it as long
// as it's pointed at the account's R2 endpoint instead of an AWS region.
export const R2_BUCKET = process.env.R2_BUCKET_NAME as string;

export const r2Client = new S3Client({
  region: "auto",
  endpoint: `https://${process.env.R2_ACCOUNT_ID}.r2.cloudflarestorage.com`,
  credentials: {
    accessKeyId: process.env.R2_ACCESS_KEY_ID as string,
    secretAccessKey: process.env.R2_SECRET_ACCESS_KEY as string,
  },
});
