import type { InterviewMetadata } from "../types/interview.js"

export function parseInterviewMetadata(metadata: string): InterviewMetadata {
  let value: unknown

  try {
    value = JSON.parse(metadata)
  } catch {
    throw new Error("Job metadata must be valid JSON")
  }

  if (typeof value !== "object" || value === null) {
    throw new Error("Job metadata must be an object")
  }

  const { candidateName, jobTitle, questions } = value as Record<string, unknown>

  if (typeof candidateName !== "string" || candidateName.trim() === "") {
    throw new Error("Job metadata requires a non-empty candidateName")
  }

  if (typeof jobTitle !== "string" || jobTitle.trim() === "") {
    throw new Error("Job metadata requires a non-empty jobTitle")
  }

  if (
    !Array.isArray(questions) ||
    questions.length === 0 ||
    questions.some(
      (question) => typeof question !== "string" || question.trim() === ""
    )
  ) {
    throw new Error("Job metadata requires a non-empty array of questions")
  }

  return {
    candidateName: candidateName.trim(),
    jobTitle: jobTitle.trim(),
    questions: questions.map((question) => question.trim()),
  }
}
