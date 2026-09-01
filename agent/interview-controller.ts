import type { voice } from "@livekit/agents"
import type { InterviewMetadata, InterviewState } from "./types/interview.js"
import { createInterviewState } from "./utils/create-interview-state.js"
import { httpClient } from "./utils/httpClient/index.js"
import { withRetry } from "./utils/with-retry.js"

export class InterviewController {
  readonly state: InterviewState
  private processing = false
  private resultReported = false

  constructor(
    private readonly session: voice.AgentSession,
    metadata: InterviewMetadata,
    private readonly roomName: string,
    private readonly shutdown: (reason: string) => void,
    private readonly notifyFrontend: (
      status: "completed" | "aborted"
    ) => Promise<void>
  ) {
    this.state = createInterviewState(metadata)
  }

  async start() {
    if (this.state.status !== "not-started") {
      return
    }

    this.state.status = "in-progress"
    this.state.startedAt = new Date().toISOString()
    console.info("[Interview] Starting interview")
    console.info(`[Interview] Candidate: ${this.state.candidateName}`)
    console.info(`[Interview] Job: ${this.state.jobTitle}`)
    console.info(`[Interview] Total questions: ${this.state.questions.length}`)

    await this.say(
      `Hello ${this.state.candidateName}, welcome to your ${this.state.jobTitle} interview. I'll be asking you a few questions today. Let's get started.`
    )
    await this.askCurrentQuestion()
  }

  async processCandidateAnswer(transcript: string) {
    if (this.processing || this.state.status !== "in-progress") {
      return
    }

    const answer = transcript.trim()
    if (answer === "") {
      await this.requestRepeat()
      return
    }

    this.processing = true

    try {
      const question = this.currentQuestion()
      if (!question) {
        return
      }

      console.info(
        `[Interview] Candidate answer received for question ${this.state.currentQuestionIndex + 1}/${this.state.questions.length}`
      )

      // Every answer the candidate gives goes in the transcript, but only
      // once per question in the control-flow-facing `answers` list.
      this.state.transcript.push({
        speaker: "candidate",
        text: answer,
        timestamp: new Date().toISOString(),
      })
      if (!this.state.answers.some((item) => item.question === question)) {
        this.state.answers.push({ question, answer })
        console.info("[Interview] Answer stored")
      }

      const isFinalQuestion =
        this.state.currentQuestionIndex === this.state.questions.length - 1
      const instructions = isFinalQuestion
        ? `Thank ${this.state.candidateName} warmly and briefly confirm that the interview is complete. Do not ask another question.`
        : `Give a single short, natural acknowledgement of the candidate's answer. Do not ask a question, introduce a new topic, or discuss interview state.`

      try {
        await withRetry(
          () =>
            this.session.generateReply({
              userInput: answer,
              instructions,
              allowInterruptions: false,
            }),
          "LLM response"
        )
      } catch (error) {
        console.error("[Interview] LLM response failed after retry", error)
        console.info(
          `[Interview] Keeping current question: ${this.state.currentQuestionIndex}`
        )
        // Graceful fallback: re-ask the same question rather than leaving the
        // candidate hanging. currentQuestionIndex is untouched, and the answer
        // already stored above is never duplicated on the next turn.
        await this.askCurrentQuestion()
        return
      }

      if (isFinalQuestion) {
        this.state.status = "completed"
        console.info("[Interview] Final answer received")
        console.info("[Interview] Interview completed")
        console.info("[Interview] Ending Agent session")
        await this.finish("completed")
        this.shutdown("interview completed")
        return
      }

      this.state.currentQuestionIndex += 1
      console.info(
        `[Interview] Advancing to question ${this.state.currentQuestionIndex + 1}/${this.state.questions.length}`
      )
      await this.askCurrentQuestion()
    } finally {
      this.processing = false
    }
  }

  async requestRepeat() {
    if (this.processing || this.state.status !== "in-progress") {
      return
    }

    console.info("[Interview] Empty or unclear answer; keeping current question")
    await this.say(
      "Sorry, I didn't quite catch that. Could you please repeat your answer?"
    )
  }

  async abort() {
    if (this.state.status === "completed" || this.state.status === "aborted") {
      return
    }

    this.state.status = "aborted"
    console.info("[Interview] Candidate disconnected")
    console.info("[Interview] Interview aborted")
    console.info("[Interview] Ending Agent session")
    await this.finish("aborted")
    this.shutdown("candidate disconnected")
  }

  /** Called when the session closes without going through completion/abort above
   * (e.g. an unhandled Agent/session error) so the interview never stays stuck
   * "in-progress" forever. */
  async finalizeIfUnreported(reason: string) {
    if (this.resultReported) {
      return
    }

    console.warn(
      `[Interview] Session ended unexpectedly (${reason}) while status=${this.state.status}; finalizing`
    )
    if (this.state.status !== "completed") {
      this.state.status = "aborted"
    }
    await this.finish(this.state.status === "completed" ? "completed" : "aborted")
  }

  private async finish(status: "completed" | "aborted") {
    if (this.resultReported) {
      return
    }
    this.resultReported = true
    this.state.endedAt = new Date().toISOString()

    await this.notifyFrontend(status).catch((error) => {
      console.error("[Interview] Failed to notify frontend of completion", error)
    })
    await this.reportResult()
  }

  private async reportResult() {
    try {
      const response = await httpClient.callAPI({
        url: `/api/connect/interviews/${this.roomName}/result`,
        method: "POST",
        data: {
          status: this.state.status,
          endedAt: this.state.endedAt,
          transcript: this.state.transcript,
        },
      })
      if (!response?.ok) {
        throw new Error("Backend did not confirm the interview result")
      }
      console.info("[Interview] Result reported to backend")
    } catch (error) {
      console.error("[Interview] Failed to report interview result", error)
    }
  }

  private async say(text: string) {
    try {
      await withRetry(
        () => this.session.say(text, { allowInterruptions: false }),
        "TTS"
      )
    } catch (error) {
      console.error("[Interview] TTS failed after retry; leaving state unchanged", error)
    }
  }

  private async askCurrentQuestion() {
    const question = this.currentQuestion()
    if (!question || this.state.status !== "in-progress") {
      return
    }

    console.info(
      `[Interview] Asking question ${this.state.currentQuestionIndex + 1}/${this.state.questions.length}`
    )
    // Only the questions actually asked go in the transcript — not the
    // greeting, acknowledgements, or closing remarks.
    this.state.transcript.push({
      speaker: "ai",
      text: question,
      timestamp: new Date().toISOString(),
    })
    await this.say(question)
  }

  private currentQuestion() {
    return this.state.questions[this.state.currentQuestionIndex]
  }
}
