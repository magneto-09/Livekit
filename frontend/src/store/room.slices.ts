import { create } from "zustand"

interface roomTokenInterface {
  roomData: Record<string, any>
  setRoomData: (roomData: Record<string, any>) => void
  // Set right before InterviewRoom intentionally disconnects (interview
  // completed/aborted) so LiveKitProvider's generic disconnect handler
  // doesn't race it to a different route.
  isFinishingInterview: boolean
  setIsFinishingInterview: (value: boolean) => void
}

export const useRoomTokenStore = create<roomTokenInterface>((set) => ({
  roomData: {},
  setRoomData: (roomData: Record<string, any>) => set({ roomData }),
  isFinishingInterview: false,
  setIsFinishingInterview: (value: boolean) => set({ isFinishingInterview: value }),
}))
