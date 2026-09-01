import type { InterviewStatus, TranscriptMessage } from "../types/interview";

export const isNonEmptyString = (value: unknown): value is string =>
  typeof value === "string" && value.trim().length > 0;

export const isValidQuestions = (value: unknown): value is string[] =>
  Array.isArray(value) && value.length > 0 && value.every(isNonEmptyString);

export const isValidStatus = (value: unknown): value is InterviewStatus =>
  value === "completed" || value === "aborted";

export const isValidTranscript = (value: unknown): value is TranscriptMessage[] =>
  Array.isArray(value) &&
  value.every(
    (item) =>
      item &&
      (item.speaker === "ai" || item.speaker === "candidate") &&
      typeof item.text === "string",
  );
