import { cn } from "@/lib/utils"
import {
  useIsSpeaking,
  useTrackMutedIndicator,
  type TrackReferenceOrPlaceholder,
} from "@livekit/components-react"
import { Mic, MicOff, User } from "lucide-react"

interface ParticipantAvatarTileProps {
  trackRef: TrackReferenceOrPlaceholder
  className?: string
}

export function ParticipantAvatarTile({
  trackRef,
  className,
}: ParticipantAvatarTileProps) {
  const isSpeaking = useIsSpeaking(trackRef.participant)

  const { isMuted } = useTrackMutedIndicator(trackRef)

  const name = trackRef.participant.name || trackRef.participant.identity

  return (
    <div className={cn("flex flex-col items-center gap-1", className)}>
      <div
        className={cn(
          "flex h-16 w-16 flex-col items-center justify-center gap-1 rounded-lg border-2 bg-muted p-2 transition-colors",
          isSpeaking ? "border-emerald-500" : "border-border"
        )}
      >
        <User className="h-6 w-6 flex-1 text-muted-foreground" />

        <div className="flex w-full justify-end">
          {isMuted ? (
            <MicOff className="h-3.5 w-3.5 text-destructive" />
          ) : (
            <Mic className="h-3.5 w-3.5 text-emerald-500" />
          )}
        </div>
      </div>

      <span className="max-w-16 truncate text-center text-[10px] text-muted-foreground">
        {name}
      </span>
    </div>
  )
}
