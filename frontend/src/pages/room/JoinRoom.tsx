import { startInterview } from "@/api-services/connect.services"
import { INTERVIEW_PAYLOAD } from "@/config/interview.config"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { useRoomTokenStore } from "@/store/room.slices"
import { useState } from "react"
import { useNavigate } from "react-router-dom"

const JoinRoom = () => {
  const [candidateName, setCandidateName] = useState<string>("")

  const [loading, setLoading] = useState<boolean>(false)

  const { setRoomData } = useRoomTokenStore((state) => state)

  const navTo = useNavigate()

  const handleJoin = async () => {
    //    IIFE
    ;(async () => {
      setLoading(true)

      try {
        const data = await startInterview({
          candidateName,
          ...INTERVIEW_PAYLOAD,
        })

        if (!data?.roomName || !data?.accessToken) {
          return
        }

        setRoomData(data)
        navTo(`/interview/room/${data.roomName}`, { replace: true })
      } finally {
        setLoading(false)
      }
    })()
  }

  return (
    <div className="flex h-svh w-full items-center justify-center bg-background">
      <div className="flex w-full max-w-sm flex-col gap-4 rounded-lg border border-border p-8">
        <h1 className="text-center text-lg font-semibold">
          LiveKit AI Interviewer
        </h1>

        <div className="flex flex-col gap-2">
          <div className="flex items-center">
            <span className="text-sm font-medium">Your Name</span>
            <span className="text-red-600">*</span>
          </div>
          <Input
            className="focus-visible:ring-0 focus-visible:ring-offset-0"
            value={candidateName}
            onChange={(e) => setCandidateName(e.target.value)}
            placeholder="Enter your name"
            required
          />
        </div>

        <Button
          disabled={loading === true || !candidateName.trim()}
          className="w-full"
          size="lg"
          onClick={handleJoin}
        >
          <div className="flex items-center gap-1">
            {loading ? (
              <div className="h-4 w-4 animate-spin rounded-full border-2 border-white/30 border-t-white" />
            ) : (
              <></>
            )}

            <span className="text-sm">{`${loading ? "Starting..." : "Start Interview"}`}</span>
          </div>
        </Button>
      </div>
    </div>
  )
}

export default JoinRoom
