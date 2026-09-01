import { Router } from "express";

import { AccessToken, LiveKitAPI } from "livekit-server-sdk";
import { randomUUID } from "node:crypto";

import type { Request, Response } from "express";
import { createInterview } from "../store/interviews";
import type { StartInterviewRequest } from "../types/interview";
import { logError } from "../utils/logger";
import { isNonEmptyString, isValidQuestions } from "../utils/validation";

const router = Router();

const INTERVIEWER_AGENT_NAME =
  process.env.LIVEKIT_AGENT_NAME ?? "interviewer-agent";

router.post("/start-interview", async (req: Request, res: Response) => {
  try {
    const { candidateName, jobTitle, questions } =
      req.body as StartInterviewRequest;

    if (
      !isNonEmptyString(candidateName) ||
      !isNonEmptyString(jobTitle) ||
      !isValidQuestions(questions)
    ) {
      return res.status(400).json({
        error:
          "candidateName, jobTitle, and a non-empty questions array are required",
      });
    }

    const metadata = {
      candidateName: candidateName.trim(),
      jobTitle: jobTitle.trim(),
      questions: questions.map((question) => question.trim()),
    };
    const roomName = `interview-${randomUUID()}`;
    const candidateIdentity = `candidate-${randomUUID()}`;

    console.info("[Interview] Starting interview");
    console.info(`[Interview] Candidate: ${metadata.candidateName}`);
    console.info(`[Interview] Job: ${metadata.jobTitle}`);
    console.info(`[Interview] Questions: ${metadata.questions.length}`);
    console.info(`[Interview] Room: ${roomName}`);

    const tokenConfig = new AccessToken(
      process.env.LIVEKIT_API_KEY,
      process.env.LIVEKIT_API_SECRET,
      {
        identity: candidateIdentity,
        ttl: 2 * 60 * 60, // 2 hrs
        // ttl: 15 * 60, // 15 mins - like access token. if expires need to call it silently using interceptor
      },
    );

    // add permissions
    tokenConfig.addGrant({
      roomJoin: true,
      room: roomName,
      canPublish: true,
      canSubscribe: true,
    });

    let accessToken: string;

    try {
      accessToken = await tokenConfig.toJwt();
      console.info("[Interview] Candidate token generated");
    } catch (error) {
      logError("[Interview] Failed to generate candidate token", error);
      return res.status(500).json({ error: "Failed to start interview" });
    }

    try {
      const api = new LiveKitAPI();
      await api.agentDispatch.createDispatch(roomName, INTERVIEWER_AGENT_NAME, {
        metadata: JSON.stringify(metadata),
      });
      console.info("[Interview] Interviewer agent dispatched");
    } catch (error) {
      logError("[Interview] Failed to dispatch interviewer agent", error);
      return res.status(502).json({ error: "Failed to start interview" });
    }

    createInterview({
      interviewId: roomName,
      candidateName: metadata.candidateName,
      jobTitle: metadata.jobTitle,
      status: "in-progress",
      startedAt: new Date().toISOString(),
      transcript: [],
    });

    console.info("[Interview] Interview started");

    return res.status(200).json({
      roomName,
      accessToken,
    });
  } catch (error) {
    logError("[Interview] Failed to start interview", error);
    return res.status(500).json({
      error: "Failed to start interview",
    });
  }
});

export { router as ConnectRouter };
