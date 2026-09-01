import { voice } from "@livekit/agents"
import type { InterviewController } from "./interview-controller.js"

export class InterviewerAgent extends voice.Agent {
  constructor(private readonly controller: InterviewController, instructions: string) {
    super({ instructions })
  }

  override async onUserTurnCompleted(
    _chatCtx: Parameters<voice.Agent["onUserTurnCompleted"]>[0],
    newMessage: Parameters<voice.Agent["onUserTurnCompleted"]>[1]
  ) {
    await this.controller.processCandidateAnswer(newMessage.textContent ?? "")

    // The controller generated the acknowledgement and next question itself.
    throw new voice.StopResponse()
  }
}
