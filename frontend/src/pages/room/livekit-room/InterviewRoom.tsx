import { uploadInterviewRecording } from "@/api-services/connect.services"
import { AgentAudioVisualizerWave } from "@/components/agent-audio-visualizer-wave"
import { ParticipantAvatarTile } from "@/components/ParticipantAvatarTile"
import { Button } from "@/components/ui/button"
import { useInterviewRecorder } from "@/hooks/use-interview-recorder"
import { useRoomTokenStore } from "@/store/room.slices"
import {
  ControlBar,
  RoomAudioRenderer,
  useConnectionState,
  useIsSpeaking,
  useLocalParticipant,
  useRemoteParticipants,
  useRoomContext,
  useTracks,
  useVoiceAssistant,
  VideoTrack,
} from "@livekit/components-react"
import {
  ConnectionState,
  LocalAudioTrack,
  RemoteParticipant,
  RoomEvent,
  Track,
} from "livekit-client"
import { useEffect, useRef } from "react"
import { useNavigate } from "react-router-dom"
import { toast } from "sonner"

interface InterviewCompletedMessage {
  type: "interview-completed"
  status: "completed" | "aborted"
}

const isInterviewCompletedMessage = (
  value: unknown
): value is InterviewCompletedMessage =>
  typeof value === "object" &&
  value !== null &&
  (value as InterviewCompletedMessage).type === "interview-completed"

const InterviewRoom = () => {
  const room = useRoomContext()

  const connectionState = useConnectionState(room)

  const { state: agentState, audioTrack: agentAudioTrack } = useVoiceAssistant()

  const {
    localParticipant,
    microphoneTrack: localMicTrack,
    cameraTrack: localVideoTrack,
  } = useLocalParticipant()

  const isHumanSpeaking = useIsSpeaking(localParticipant)

  const remoteParticipants = useRemoteParticipants()

  // AgentAudioVisualizerWave only turns real audio volume into motion when
  // its `state` prop is exactly "speaking" (see useAgentAudioVisualizerWave)
  // — every other state just runs a canned pulse and ignores the track. So
  // to react to the human too, we have to force state to "speaking" (and
  // feed the human's mic) whenever they're actually talking, not just when
  // the agent's own conversational state says "speaking".
  const visualizerTrack =
    agentState === "speaking"
      ? agentAudioTrack
      : isHumanSpeaking
        ? (localMicTrack?.track as LocalAudioTrack | undefined)
        : undefined

  const visualizerState =
    agentState === "speaking" || isHumanSpeaking ? "speaking" : agentState

  const cameraTracks = useTracks([Track.Source.Camera])?.filter(
    (trackRef) => trackRef.participant.isLocal
  )

  // Audio-only interview, so these tiles are keyed off the mic (not camera):
  // withPlaceholder still gives every remote participant a tile-ready
  // reference even without a live mic track, so the tile shows their
  // name/avatar and mute state without ever trying to render video.
  const remoteParticipantTracks = useTracks([
    { source: Track.Source.Microphone, withPlaceholder: true },
  ])?.filter((trackRef) =>
    remoteParticipants?.some(
      (participant) => participant.identity === trackRef.participant.identity
    )
  )

  const navTo = useNavigate()

  const { stopAndGetRecording } = useInterviewRecorder(room)
  const finishingRef = useRef(false)

  const finishInterview = async (status: "completed" | "aborted") => {
    if (finishingRef.current) {
      return
    }
    finishingRef.current = true
    useRoomTokenStore.getState().setIsFinishingInterview(true)

    const roomName = room.name
    const recording = await stopAndGetRecording().catch((error) => {
      console.error("Failed to finalize interview recording", error)
      return null
    })

    if (recording) {
      const uploaded = await uploadInterviewRecording(roomName, recording).catch(
        (error) => {
          console.error("Failed to upload interview recording", error)
          return undefined
        }
      )
      if (!uploaded) {
        toast.error("Could not save the interview recording.")
      }
    } else {
      console.warn(
        "No interview audio was captured; the result page won't have a recording."
      )
    }

    await room.disconnect()

    toast[status === "completed" ? "success" : "info"](
      status === "completed" ? "Interview completed." : "Interview ended."
    )
    navTo(`/interview/result/${roomName}`, { replace: true })
  }

  // The Agent broadcasts this once the interview conversation is over, so the
  // candidate side can stop recording/upload it and move to the result page.
  useEffect(() => {
    const handleData = (payload: Uint8Array) => {
      let message: unknown
      try {
        message = JSON.parse(new TextDecoder().decode(payload))
      } catch {
        return
      }
      if (isInterviewCompletedMessage(message)) {
        void finishInterview(message.status)
      }
    }

    room.on(RoomEvent.DataReceived, handleData)

    return () => {
      room.off(RoomEvent.DataReceived, handleData)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [room])

  // Fires for every mic/camera failure, no matter what triggered it: a
  // ControlBar toggle, the persisted-choice auto-restore on mount, or the
  // browser's own `devicechange` retries.
  useEffect(() => {
    const handleMediaDevicesError = (error: Error, kind?: MediaDeviceKind) => {
      const label =
        kind === "audioinput"
          ? "microphone"
          : kind === "videoinput"
            ? "camera"
            : "device"

      toast.error(`Could not access your ${label}: ${error.message}`)
    }

    room.on(RoomEvent.MediaDevicesError, handleMediaDevicesError)

    return () => {
      room.off(RoomEvent.MediaDevicesError, handleMediaDevicesError)
    }
  }, [room])

  // Announce any participant joining the room.
  useEffect(() => {
    const handleParticipantConnected = (participant: RemoteParticipant) => {
      toast.info(
        `${participant.name || participant.identity} joined the interview`
      )
    }

    room.on(RoomEvent.ParticipantConnected, handleParticipantConnected)

    return () => {
      room.off(RoomEvent.ParticipantConnected, handleParticipantConnected)
    }
  }, [room])

  const handleEndInterview = async () => {
    // Release the camera/mic hardware (and the browser's recording indicator)
    // before tearing down the connection.
    await Promise?.all([
      room.localParticipant.setCameraEnabled(false),
      room.localParticipant.setMicrophoneEnabled(false),
    ])

    // The candidate leaving is what the Agent treats as an abort; finalize
    // and route to the result page the same way a natural completion does.
    await finishInterview("aborted")
  }

  return (
    <div className="flex h-svh w-full flex-col bg-background text-foreground">
      <RoomAudioRenderer />

      <header className="flex items-center justify-between border-b border-border px-6 py-4">
        <span className="font-semibold">AI Interview</span>
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <span
            className={`h-2 w-2 rounded-full ${
              connectionState === ConnectionState.Connected
                ? "bg-emerald-500"
                : "bg-amber-500"
            }`}
          />
          <span className="capitalize">{connectionState}</span>
        </div>
      </header>

      <main className="flex flex-1 flex-col items-center justify-center gap-2 px-6 py-6">
        <div className="flex h-14 w-14 items-center justify-center rounded-full border border-border text-3xl">
          🤖
        </div>

        <div className="text-center">
          <h2 className="text-lg font-semibold">AI Interviewer</h2>
          <p className="text-sm text-muted-foreground capitalize">
            {agentState ?? "connecting"}
          </p>
        </div>

        <div className="border-1.5 flex items-center gap-2 rounded-lg border-gray-400">
          <AgentAudioVisualizerWave
            size="xl"
            color="#1FD5F9"
            blur={0.1}
            lineWidth={2}
            audioTrack={visualizerTrack}
            state={visualizerState}
            colorShift={0.3}
          />

          {cameraTracks?.[0] && !localVideoTrack?.isMuted && (
            <div className="relative aspect-video w-full max-w-xs overflow-hidden rounded-lg border border-border">
              <VideoTrack trackRef={cameraTracks?.[0]} />
            </div>
          )}
        </div>
      </main>

      {remoteParticipantTracks.length > 0 && (
        <div className="fixed right-4 bottom-24 z-20 flex flex-col items-end gap-2 overflow-y-auto">
          {remoteParticipantTracks?.map((trackRef) => (
            <ParticipantAvatarTile
              key={trackRef.participant.identity}
              trackRef={trackRef}
            />
          ))}
        </div>
      )}

      <footer className="flex items-center justify-center gap-2 border-t border-border px-2">
        <ControlBar
          controls={{
            microphone: true,
            camera: false,
            screenShare: false,
            chat: false,
            leave: false,
          }}
        />

        <Button variant="destructive" size="lg" onClick={handleEndInterview}>
          End Interview
        </Button>
      </footer>
    </div>
  )
}

export default InterviewRoom
