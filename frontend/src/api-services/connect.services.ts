import { httpClient } from "@/utils/httpClient"

export interface StartInterviewPayload {
  candidateName: string
  jobTitle: string
  questions: string[]
}

export interface TranscriptMessage {
  speaker: "ai" | "candidate"
  text: string
  timestamp: string
}

export interface InterviewResult {
  interviewId: string
  candidateName: string
  jobTitle: string
  status: "in-progress" | "completed" | "aborted"
  startedAt: string
  endedAt?: string
  duration?: number
  transcript: TranscriptMessage[]
  recordingUrl?: string
}

export const startInterview = (payload: StartInterviewPayload) =>
  httpClient?.callAPI({
    url: "/api/connect/start-interview",
    method: "POST",
    data: payload,
  })

export const getInterviewResult = (
  interviewId: string
): Promise<InterviewResult | undefined> =>
  httpClient?.callAPI({
    url: `/api/connect/interviews/${interviewId}`,
    method: "GET",
  })

export const uploadInterviewRecording = (interviewId: string, recording: Blob) =>
  httpClient?.callAPI({
    url: `/api/connect/interviews/${interviewId}/recording`,
    method: "POST",
    data: recording,
    headers: { "Content-Type": recording.type || "audio/webm" },
  })
