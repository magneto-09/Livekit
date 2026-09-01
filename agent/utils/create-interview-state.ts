import type { InterviewMetadata, InterviewState } from "../types/interview.js"

export function createInterviewState(
  metadata: InterviewMetadata
): InterviewState {
  return {
    ...metadata,
    currentQuestionIndex: 0,
    status: "not-started",
    answers: [],
    transcript: [],
  }
}
