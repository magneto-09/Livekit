export interface StartInterviewRequest {
  candidateName?: unknown;
  jobTitle?: unknown;
  questions?: unknown;
}

export interface TranscriptMessage {
  speaker: "ai" | "candidate";
  text: string;
  timestamp: string;
}

export type InterviewStatus = "in-progress" | "completed" | "aborted";

export interface InterviewRecord {
  interviewId: string;
  candidateName: string;
  jobTitle: string;
  status: InterviewStatus;
  startedAt: string;
  endedAt?: string;
  transcript: TranscriptMessage[];
  recordingUrl?: string;
}
