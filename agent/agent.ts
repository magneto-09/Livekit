import "dotenv/config"

import {
  cli,
  defineAgent,
  inference,
  voice,
  WorkerOptions,
  type JobContext,
} from "@livekit/agents"
import { fileURLToPath } from "node:url"
import { InterviewController } from "./interview-controller.js"
import { InterviewerAgent } from "./interviewer.js"
import { parseInterviewMetadata } from "./utils/parse-interview-metadata.js"
import { createInterviewerInstructions } from "./utils/interviewer-instructions.js"

export default defineAgent({
  entry: async (ctx: JobContext) => {
    let metadata

    try {
      metadata = parseInterviewMetadata(ctx.job.metadata)
    } catch (error) {
      console.error("[Interview] Invalid interview metadata", error)
      ctx.shutdown("invalid interview metadata")
      return
    }

    console.info("[Agent] Configuring STT")
    const stt = new inference.STT({
      model: "deepgram/nova-3",
      language: "en",
    })

    console.info("[Agent] Configuring LLM")
    const llm = new inference.LLM({
      model: "google/gemma-4-31b-it",
    })

    console.info("[Agent] Configuring TTS")
    const tts = new inference.TTS({
      model: "inworld/inworld-tts-2",
      voice: "Ashley",
    })

    const session = new voice.AgentSession({
      stt,
      llm,
      tts,
      turnHandling: {
        turnDetection: new inference.TurnDetector(),
        // The streaming turn detector's default endpointing (300ms of
        // silence) is tuned for snappy back-and-forth chat. Candidates
        // pausing mid-answer to think were getting cut off, so give them
        // more room before the agent decides their turn is over.
        endpointing: {
          minDelay: 1000,
          maxDelay: 2500,
        },
      },
    })

    let controller: InterviewController

    try {
      console.info("[Agent] Connecting to room")
      await ctx.connect()
      console.info("[Agent] Connected to room")

      const candidate = await ctx.waitForParticipant()
      const notifyFrontend = async (status: "completed" | "aborted") => {
        const localParticipant = ctx.room.localParticipant
        if (!localParticipant) {
          throw new Error("Agent has no local participant to notify the frontend with")
        }
        await localParticipant.publishData(
          new TextEncoder().encode(
            JSON.stringify({ type: "interview-completed", status })
          ),
          { reliable: true }
        )
      }
      controller = new InterviewController(
        session,
        metadata,
        ctx.room.name ?? "",
        (reason) => ctx.shutdown(reason),
        notifyFrontend
      )
      const agent = new InterviewerAgent(
        controller,
        createInterviewerInstructions(metadata)
      )

      const onParticipantDisconnected = (participant: { identity: string }) => {
        if (participant.identity === candidate.identity) {
          void controller.abort()
        }
      }

      ctx.room.on("participantDisconnected", onParticipantDisconnected)
      ctx.addShutdownCallback(async () => {
        ctx.room.off("participantDisconnected", onParticipantDisconnected)
      })

      console.info("[Agent] Starting session")
      await session.start({
        agent,
        room: ctx.room,
        inputOptions: {
          participantIdentity: candidate.identity,
          closeOnDisconnect: false,
        },
      })
      console.info("[Agent] Session started")
    } catch (error) {
      console.error("[Agent] Failed to start session", error)
      throw error
    }

    session.on(voice.AgentSessionEventTypes.UserTranscriptionTimeout, () => {
      void controller.requestRepeat().catch((error) => {
        console.error("[Interview] Failed to request a repeated answer", error)
      })
    })

    session.on(voice.AgentSessionEventTypes.Error, (ev) => {
      console.error(`[Interview] ${ev.error.type} occurred`, ev.error)
      if (ev.error.type === "stt_error") {
        void controller.requestRepeat().catch((error) => {
          console.error(
            "[Interview] Failed to request a repeated answer after STT error",
            error
          )
        })
      }
    })

    session.on(voice.AgentSessionEventTypes.Close, (ev) => {
      console.info(`[Agent] Session closed: ${ev.reason}`)
      void controller.finalizeIfUnreported(ev.reason).catch((error) => {
        console.error("[Interview] Failed to finalize interview after session close", error)
      })
    })

    try {
      await controller.start()
    } catch (error) {
      console.error("[Interview] Failed to start interview", error)
      throw error
    }
  },
})

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  cli.runApp(
    new WorkerOptions({
      agent: fileURLToPath(import.meta.url),
      agentName: process.env.LIVEKIT_AGENT_NAME ?? "interviewer-agent",
      // Dev mode spawns a fresh job process per job (no pre-warmed pool), and
      // that process has to load tsx + @livekit/agents from cold before it
      // can report ready. The 10s default is too tight for that on Windows.
      initializeProcessTimeout: 60_000,
      // The worker's own health-check server (GET / -> 200) needs to bind to
      // whatever port the host assigns (e.g. Azure App Service's PORT env
      // var), or the platform can't confirm the instance is alive.
      port: Number(process.env.PORT) || 8081,
    })
  )
}
