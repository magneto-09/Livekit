import {
  getInterviewResult,
  type InterviewResult,
} from "@/api-services/connect.services"
import { Button } from "@/components/ui/button"
import { Spinner } from "@/components/ui/spinner"
import { useEffect, useState } from "react"
import { useNavigate, useParams } from "react-router-dom"

const formatDuration = (seconds?: number) => {
  if (seconds === undefined) {
    return "--:--"
  }
  const minutes = Math.floor(seconds / 60)
  const remaining = seconds % 60
  return `${String(minutes).padStart(2, "0")}:${String(remaining).padStart(2, "0")}`
}

const statusLabel: Record<InterviewResult["status"], string> = {
  "in-progress": "In Progress",
  completed: "Completed",
  aborted: "Aborted",
}

const ResultPage = () => {
  const { roomName } = useParams()
  const navTo = useNavigate()

  const [result, setResult] = useState<InterviewResult | null>(null)
  const [loading, setLoading] = useState(true)
  const [notFound, setNotFound] = useState(false)

  useEffect(() => {
    if (!roomName) {
      return
    }

    let cancelled = false

    const fetchResult = async () => {
      const data = await getInterviewResult(roomName)
      if (cancelled) {
        return
      }
      if (!data) {
        setNotFound(true)
        setLoading(false)
        return
      }
      setResult(data)
      setLoading(false)

      // The Agent reports the final transcript/status to the backend
      // asynchronously; if we got here before that landed, try once more
      // rather than showing a stale "in-progress" view.
      if (data.status === "in-progress") {
        setTimeout(async () => {
          const refreshed = await getInterviewResult(roomName)
          if (!cancelled && refreshed) {
            setResult(refreshed)
          }
        }, 1500)
      }
    }

    void fetchResult()

    return () => {
      cancelled = true
    }
  }, [roomName])

  if (loading) {
    return (
      <div className="flex h-svh w-full items-center justify-center bg-background">
        <Spinner className="size-6" />
      </div>
    )
  }

  if (notFound || !result) {
    return (
      <div className="flex h-svh w-full flex-col items-center justify-center gap-4 bg-background">
        <p className="text-sm text-muted-foreground">Interview result not found.</p>
        <Button onClick={() => navTo("/join-room")}>Back to Start</Button>
      </div>
    )
  }

  return (
    <div className="flex min-h-svh w-full justify-center bg-background px-4 py-10">
      <div className="flex w-full max-w-2xl flex-col gap-6">
        <div className="rounded-lg border border-border p-6">
          <h1 className="text-lg font-semibold">Interview Result</h1>

          <dl className="mt-4 grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 text-sm">
            <dt className="text-muted-foreground">Candidate</dt>
            <dd>{result.candidateName}</dd>

            <dt className="text-muted-foreground">Job Title</dt>
            <dd>{result.jobTitle}</dd>

            <dt className="text-muted-foreground">Status</dt>
            <dd>{statusLabel[result.status]}</dd>

            <dt className="text-muted-foreground">Duration</dt>
            <dd>{formatDuration(result.duration)}</dd>
          </dl>
        </div>

        <div className="rounded-lg border border-border p-6">
          <h2 className="text-sm font-semibold">Conversation</h2>

          {result.transcript.length === 0 ? (
            <p className="mt-3 text-sm text-muted-foreground">
              No conversation was recorded for this interview.
            </p>
          ) : (
            <div className="mt-4 flex flex-col gap-3">
              {result.transcript.map((message, index) => (
                <div key={index} className="flex flex-col gap-0.5">
                  <span className="text-xs font-semibold text-muted-foreground uppercase">
                    {message.speaker === "ai" ? "AI" : "Candidate"}
                  </span>
                  <p className="text-sm">{message.text}</p>
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="rounded-lg border border-border p-6">
          <h2 className="text-sm font-semibold">Audio</h2>

          {result.recordingUrl ? (
            <audio
              className="mt-3 w-full"
              controls
              src={`${import.meta.env.VITE_API_BASE_URL}${result.recordingUrl}`}
            />
          ) : (
            <p className="mt-3 text-sm text-muted-foreground">
              Recording not available for this interview.
            </p>
          )}
        </div>

        <Button variant="outline" className="w-full" onClick={() => navTo("/join-room")}>
          Start Another Interview
        </Button>
      </div>
    </div>
  )
}

export default ResultPage
