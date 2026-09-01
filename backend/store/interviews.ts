import type { InterviewRecord } from "../types/interview";

const interviews = new Map<string, InterviewRecord>();

export const createInterview = (record: InterviewRecord): void => {
  interviews.set(record.interviewId, record);
};

export const getInterview = (
  interviewId: string,
): InterviewRecord | undefined => interviews.get(interviewId);

export const updateInterview = (
  interviewId: string,
  patch: Partial<Omit<InterviewRecord, "interviewId">>,
): InterviewRecord | undefined => {
  const existing = interviews.get(interviewId);
  if (!existing) {
    return undefined;
  }

  const updated: InterviewRecord = { ...existing, ...patch };
  interviews.set(interviewId, updated);
  return updated;
};
