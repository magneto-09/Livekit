import { lazy, Suspense } from "react"
import { Navigate, Route, Routes } from "react-router-dom"
import LiveKitProvider from "./pages/room/livekit-room/LiveKitProvider"

const JoinRoom = lazy(() => import("./pages/room/JoinRoom"))

const ResultPage = lazy(() => import("./pages/result/ResultPage"))

export function App() {
  return (
    <Suspense fallback={<div>Loading...</div>}>
      <Routes>
        <Route path="/" element={<Navigate to="/join-room" replace />} />

        <Route path="/join-room" element={<JoinRoom />} />

        <Route path="/interview/room/:roomName" element={<LiveKitProvider />} />

        <Route path="/interview/result/:roomName" element={<ResultPage />} />
      </Routes>
    </Suspense>
  )
}

export default App
