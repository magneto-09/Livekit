import type { LocalTrackPublication, RemoteTrack, Room } from "livekit-client"
import { RoomEvent, Track } from "livekit-client"
import { useCallback, useEffect, useRef } from "react"

// Records the full interview conversation (agent + candidate mixed together,
// not just the local mic) by combining every published audio track into one
// MediaStreamDestination via the Web Audio API, then capturing that with
// MediaRecorder. Recording happens client-side and is uploaded to the backend
// on completion — no LiveKit Egress/cloud storage required.
export function useInterviewRecorder(room: Room) {
  const audioContextRef = useRef<AudioContext | null>(null)
  const destinationRef = useRef<MediaStreamAudioDestinationNode | null>(null)
  const recorderRef = useRef<MediaRecorder | null>(null)
  const chunksRef = useRef<Blob[]>([])
  const mixedTrackIdsRef = useRef<Set<string>>(new Set())

  const getContext = useCallback(() => {
    if (!audioContextRef.current) {
      audioContextRef.current = new AudioContext()
      destinationRef.current =
        audioContextRef.current.createMediaStreamDestination()
    }
    // Browsers can create a new AudioContext in a "suspended" state until a
    // user gesture resumes it — if that never happens, the destination node
    // never actually processes audio and the recording comes out empty.
    if (audioContextRef.current.state === "suspended") {
      void audioContextRef.current.resume().catch((error) => {
        console.error("[Recording] Failed to resume AudioContext", error)
      })
    }
    return {
      audioContext: audioContextRef.current,
      destination: destinationRef.current!,
    }
  }, [])

  const mixInTrack = useCallback(
    (mediaStreamTrack: MediaStreamTrack) => {
      if (mixedTrackIdsRef.current.has(mediaStreamTrack.id)) {
        return
      }
      try {
        const { audioContext, destination } = getContext()
        const source = audioContext.createMediaStreamSource(
          new MediaStream([mediaStreamTrack])
        )
        source.connect(destination)
        mixedTrackIdsRef.current.add(mediaStreamTrack.id)
      } catch (error) {
        console.error("[Recording] Failed to mix in an audio track", error)
      }
    },
    [getContext]
  )

  useEffect(() => {
    const { destination } = getContext()

    const mimeType = MediaRecorder.isTypeSupported("audio/webm;codecs=opus")
      ? "audio/webm;codecs=opus"
      : "audio/webm"

    chunksRef.current = []
    const recorder = new MediaRecorder(destination.stream, { mimeType })
    recorder.ondataavailable = (event) => {
      if (event.data.size > 0) {
        chunksRef.current.push(event.data)
      }
    }
    recorder.onerror = (event) => {
      console.error("[Recording] MediaRecorder error", event)
    }
    recorder.start(1000)
    recorderRef.current = recorder

    const handleTrackSubscribed = (track: RemoteTrack) => {
      if (track.kind === Track.Kind.Audio) {
        mixInTrack(track.mediaStreamTrack)
      }
    }

    const handleLocalTrackPublished = (publication: LocalTrackPublication) => {
      if (publication.kind === Track.Kind.Audio && publication.track) {
        mixInTrack(publication.track.mediaStreamTrack)
      }
    }

    room.on(RoomEvent.TrackSubscribed, handleTrackSubscribed)
    room.on(RoomEvent.LocalTrackPublished, handleLocalTrackPublished)

    // Pick up tracks published before this hook mounted.
    room.localParticipant.audioTrackPublications.forEach((publication) => {
      if (publication.track) {
        mixInTrack(publication.track.mediaStreamTrack)
      }
    })
    room.remoteParticipants.forEach((participant) => {
      participant.audioTrackPublications.forEach((publication) => {
        if (publication.track) {
          mixInTrack(publication.track.mediaStreamTrack)
        }
      })
    })

    return () => {
      room.off(RoomEvent.TrackSubscribed, handleTrackSubscribed)
      room.off(RoomEvent.LocalTrackPublished, handleLocalTrackPublished)
      if (recorderRef.current && recorderRef.current.state !== "inactive") {
        recorderRef.current.stop()
      }
      void audioContextRef.current?.close().catch(() => {})

      // React 18 StrictMode (dev only) double-invokes this effect: mount ->
      // cleanup -> mount. Without resetting these, the second mount's
      // getContext() would see a non-null ref and reuse the AudioContext we
      // just closed above — a closed context can't process audio, so every
      // track "mixes in" successfully but produces silence, and the
      // MediaRecorder ends up with zero real chunks.
      audioContextRef.current = null
      destinationRef.current = null
      recorderRef.current = null
      mixedTrackIdsRef.current = new Set()
    }
    // Recording setup should only run once per room connection.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [room])

  const finalizeChunks = useCallback((): Blob | null => {
    if (chunksRef.current.length === 0) {
      console.warn(
        "[Recording] No audio chunks were captured — recording will be unavailable.",
        {
          mixedTracks: mixedTrackIdsRef.current.size,
          audioContextState: audioContextRef.current?.state,
        }
      )
      return null
    }
    return new Blob(chunksRef.current, { type: "audio/webm" })
  }, [])

  const stopAndGetRecording = useCallback((): Promise<Blob | null> => {
    return new Promise((resolve) => {
      const recorder = recorderRef.current
      if (!recorder || recorder.state === "inactive") {
        resolve(finalizeChunks())
        return
      }
      recorder.onstop = () => {
        resolve(finalizeChunks())
      }
      recorder.stop()
    })
  }, [finalizeChunks])

  return { stopAndGetRecording }
}
