import { RoomContext, useConnectionState } from "@livekit/components-react"

import RoomLoader from "@/components/RoomLoader"
import { useRoomTokenStore } from "@/store/room.slices"
import { ConnectionState, Room } from "livekit-client"
import { useEffect, useMemo, useRef } from "react"
import { useNavigate, useParams } from "react-router-dom"
import { toast } from "sonner"
import InterviewRoom from "./InterviewRoom"

const LiveKitProvider = () => {
  const room: Room = useMemo(() => new Room({}), [])

  const { roomData } = useRoomTokenStore((state) => state)

  const connectionState: ConnectionState = useConnectionState(room)

  const { roomName } = useParams()

  const navTo = useNavigate()

  const firstConnected = useRef(false)

  useEffect(() => {
    if (connectionState === ConnectionState.Connected) {
      toast.success(`Connected to room ${roomName}`)
    }

    if (connectionState === ConnectionState.Reconnecting) {
      toast.info(`Reconnecting to room ${roomName}`)
    }

    if (
      connectionState === ConnectionState.Disconnected &&
      firstConnected.current &&
      !useRoomTokenStore.getState().isFinishingInterview
    )
      navTo("/join-room")
  }, [connectionState])

  useEffect(() => {
    // IIFE
    ;(async () => {
      if (roomData && roomData?.accessToken) {
        await room?.connect(
          import.meta.env.VITE_LIVEKIT_URL,
          roomData?.accessToken
        )

        firstConnected.current = true
      } else {
        await room?.disconnect()

        setTimeout(() => {
          toast?.error(`Disconnected to room ${roomName}`)
          navTo("/join-room")
        }, 3000)
      }
    })()
  }, [roomData])

  return (
    <RoomContext.Provider value={room}>
      {connectionState === ConnectionState.Connecting ||
      connectionState === ConnectionState.Disconnected ? (
        <RoomLoader connectionState={connectionState} />
      ) : (
        <InterviewRoom />
      )}
    </RoomContext.Provider>
  )
}

export default LiveKitProvider
