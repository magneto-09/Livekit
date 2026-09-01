import {
  GetObjectCommand,
  HeadObjectCommand,
  PutObjectCommand,
} from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";

import { R2_BUCKET, r2Client } from "./r2-client";

// interviewId is always our own `interview-<uuid>` room name, but it arrives
// as a route param, so guard the object keys built from it.
export const INTERVIEW_ID_PATTERN = /^[a-zA-Z0-9-]+$/;

// The bucket is private, so playback goes through a freshly minted signed
// URL every time rather than a permanent public link.
const SIGNED_URL_TTL_SECONDS = 60 * 60;

const recordingKey = (interviewId: string) => `${interviewId}.webm`;

export const uploadRecording = (
  interviewId: string,
  body: Buffer,
  contentType: string,
) =>
  r2Client.send(
    new PutObjectCommand({
      Bucket: R2_BUCKET,
      Key: recordingKey(interviewId),
      Body: body,
      ContentType: contentType,
    }),
  );

export const recordingExists = async (interviewId: string) => {
  try {
    await r2Client.send(
      new HeadObjectCommand({ Bucket: R2_BUCKET, Key: recordingKey(interviewId) }),
    );
    return true;
  } catch {
    return false;
  }
};

export const getRecordingSignedUrl = (interviewId: string) =>
  getSignedUrl(
    r2Client,
    new GetObjectCommand({ Bucket: R2_BUCKET, Key: recordingKey(interviewId) }),
    { expiresIn: SIGNED_URL_TTL_SECONDS },
  );
