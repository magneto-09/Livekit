export interface InterviewMetadata {
  candidateName: string
  jobTitle: string
  questions: string[]
}

export interface InterviewAnswer {
  question: string
  answer: string
}

export interface TranscriptMessage {
  speaker: "ai" | "candidate"
  text: string
  timestamp: string
}

export type InterviewStatus =
  | "not-started"
  | "in-progress"
  | "completed"
  | "aborted"

export interface InterviewState extends InterviewMetadata {
  currentQuestionIndex: number
  status: InterviewStatus
  answers: InterviewAnswer[]
  transcript: TranscriptMessage[]
  startedAt?: string
  endedAt?: string
}
