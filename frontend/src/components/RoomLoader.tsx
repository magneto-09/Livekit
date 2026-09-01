import { Spinner } from "@/components/ui/spinner"
import type { ConnectionState } from "livekit-client"

interface RoomLoaderProps {
  connectionState: ConnectionState
}

const RoomLoader = ({ connectionState }: RoomLoaderProps) => {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-background/95 px-6">
      <div className="flex flex-col items-center gap-4 text-center">
        <Spinner className="size-10 text-primary" />
        <div className="flex flex-col gap-1">
          <span className="text-lg font-semibold">Joining room</span>
          <span className="text-sm text-muted-foreground capitalize">
            Connection status: {connectionState}
          </span>
        </div>
      </div>
    </div>
  )
}

export default RoomLoader
