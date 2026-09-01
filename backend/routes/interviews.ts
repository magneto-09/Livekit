import express, { Router } from "express";

import type { Request, Response } from "express";
import { getInterview, updateInterview } from "../store/interviews";
import { computeDuration } from "../utils/compute-duration";
import { logError } from "../utils/logger";
import {
  getRecordingSignedUrl,
  INTERVIEW_ID_PATTERN,
  recordingExists,
  uploadRecording,
} from "../utils/recording-storage";
import { isValidStatus, isValidTranscript } from "../utils/validation";

const router = Router();

router.get("/:interviewId", (req: Request<{ interviewId: string }>, res: Response) => {
  const { interviewId } = req.params;
  const interview = getInterview(interviewId);

  if (!interview) {
    return res.status(404).json({ error: "Interview not found" });
  }

  return res.status(200).json({
    ...interview,
    duration: computeDuration(interview.startedAt, interview.endedAt),
  });
});

// Called by the Agent when the interview finishes (completed or aborted).
router.post("/:interviewId/result", (req: Request<{ interviewId: string }>, res: Response) => {
  const { interviewId } = req.params;
  const { status, endedAt, transcript } = req.body ?? {};

  if (!isValidStatus(status) || !isValidTranscript(transcript)) {
    return res.status(400).json({
      error: "status ('completed'|'aborted') and a valid transcript array are required",
    });
  }

  const updated = updateInterview(interviewId, {
    status,
    endedAt: typeof endedAt === "string" ? endedAt : new Date().toISOString(),
    transcript,
  });

  if (!updated) {
    console.warn(`[Interview] Result reported for unknown interview: ${interviewId}`);
    return res.status(404).json({ error: "Interview not found" });
  }

  console.info(`[Interview] Result recorded for ${interviewId}: ${status}`);
  return res.status(200).json({ ok: true });
});

// Called by the frontend once it has finished recording the interview audio.
router.post(
  "/:interviewId/recording",
  express.raw({ type: "*/*", limit: "50mb" }),
  async (req: Request<{ interviewId: string }>, res: Response) => {
    const { interviewId } = req.params;

    if (!INTERVIEW_ID_PATTERN.test(interviewId)) {
      return res.status(400).json({ error: "Invalid interview id" });
    }

    if (!getInterview(interviewId)) {
      return res.status(404).json({ error: "Interview not found" });
    }

    if (!Buffer.isBuffer(req.body) || req.body.length === 0) {
      return res.status(400).json({ error: "Recording payload is empty" });
    }

    try {
      await uploadRecording(
        interviewId,
        req.body,
        req.headers["content-type"] ?? "audio/webm",
      );
    } catch (error) {
      logError("[Interview] Failed to save recording", error);
      return res.status(500).json({ error: "Failed to save recording" });
    }

    updateInterview(interviewId, {
      recordingUrl: `/api/connect/interviews/${interviewId}/recording`,
    });

    console.info(`[Interview] Recording saved for ${interviewId}`);
    return res.status(200).json({ ok: true });
  },
);

// recordingUrl always points back here rather than at R2 directly, since the
// bucket is private — each hit mints a fresh short-lived signed URL and
// redirects to it instead of persisting one.
router.get(
  "/:interviewId/recording",
  async (req: Request<{ interviewId: string }>, res: Response) => {
    const { interviewId } = req.params;

    if (!INTERVIEW_ID_PATTERN.test(interviewId)) {
      return res.status(400).json({ error: "Invalid interview id" });
    }

    if (!(await recordingExists(interviewId))) {
      return res.status(404).json({ error: "Recording not available" });
    }

    try {
      const signedUrl = await getRecordingSignedUrl(interviewId);
      return res.redirect(302, signedUrl);
    } catch (error) {
      logError("[Interview] Failed to generate recording URL", error);
      return res.status(500).json({ error: "Failed to retrieve recording" });
    }
  },
);

export { router as InterviewsRouter };
